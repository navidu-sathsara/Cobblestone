'use strict';

/**
 * Electron host for the Cobblestone launcher core.
 *
 * The core ships no window, preload or navigation policy on purpose, so every
 * host responsibility listed in docs/ADVANCED_BACKEND_GUIDE.md ("Security
 * model" -> "Host responsibilities") is implemented here: sandboxed renderer,
 * context isolation, a strict CSP, an exact-match custom protocol, navigation
 * and window-open denial, and no unrestricted ipcRenderer bridge.
 */

const path = require('node:path');
const fsp = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, net, protocol, session, shell } = require('electron');
const { createLauncherBackend } = require('../backend');
const { registerElectronIpc } = require('../backend/adapters/electron-ipc');
const { serializeError } = require('../backend/core/errors');
const { version: appVersion } = require('../package.json');
const { buildCsp, EXTERNAL_LINK_HOSTS } = require('./csp');
const { createSenderValidator, isAllowedExternalUrl, resolveRendererFile } = require('./guards');
const { createUpdaterController } = require('./updater');

const RENDERER_ROOT = path.join(__dirname, '..', 'frontend', 'dist');
const APP_SCHEME = 'app';
const APP_HOST = 'launcher';
// Set by scripts/dev-desktop.js; absent in a packaged/production run.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || null;
const RENDERER_URL = DEV_SERVER_URL || `${APP_SCHEME}://${APP_HOST}/index.html`;

let launcher = null;
let disposeBackendIpc = null;
let mainWindow = null;
let updaterController = null;
let shuttingDown = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

/**
 * Serves the built renderer. Host matching and path containment live in
 * ./guards.js so they are unit tested away from Electron.
 */
async function serveRenderer(request) {
  const resolved = resolveRendererFile(RENDERER_ROOT, request.url, APP_HOST);
  if (!resolved.ok) return new Response('Not available', { status: resolved.status });

  try {
    await fsp.access(resolved.file);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  return net.fetch(pathToFileURL(resolved.file).toString());
}

const validateSender = createSenderValidator({
  scheme: APP_SCHEME,
  host: APP_HOST,
  devServerOrigin: DEV_SERVER_URL,
});

/** True for https URLs on an allowlisted community domain. */
const isAllowedLink = (url) => isAllowedExternalUrl(url, EXTERNAL_LINK_HOSTS);

/**
 * Registers the window-chrome and link channels the backend adapter does not
 * own, using the same validated `{ ok, value | error }` envelope.
 */
function registerHostIpc(updater) {
  const channels = [];
  const handle = (channel, operation) => {
    ipcMain.handle(channel, async (event, payload = {}) => {
      if (!validateSender(event.senderFrame)) {
        return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'IPC sender is not trusted' } };
      }
      try {
        return { ok: true, value: await operation(payload, event) };
      } catch (error) {
        return { ok: false, error: serializeError(error) };
      }
    });
    channels.push(channel);
  };

  const windowFor = (event) => BrowserWindow.fromWebContents(event.sender);

  handle('window:minimize', (_payload, event) => {
    windowFor(event)?.minimize();
    return true;
  });
  handle('window:maximize', (_payload, event) => {
    const target = windowFor(event);
    if (!target) return false;
    if (target.isMaximized()) target.unmaximize();
    else target.maximize();
    return target.isMaximized();
  });
  handle('window:close', (_payload, event) => {
    windowFor(event)?.close();
    return true;
  });
  handle('app:openExternal', async ({ url }) => {
    if (!isAllowedLink(url)) {
      throw Object.assign(new Error('This link is not on the allowlist'), {
        code: 'VALIDATION_ERROR',
        details: { url: String(url).slice(0, 200) },
      });
    }
    await shell.openExternal(url);
    return true;
  });
  handle('updater:getState', () => updater.getState());
  handle('updater:check', () => updater.check());
  handle('updater:install', () => updater.install());

  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
  };
}

function sendRendererEvent(name, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('cobblestone:event', { name, payload });
  }
}

/** Applies the CSP and refuses renderer-initiated permission requests. */
function hardenSession(target) {
  const csp = buildCsp({ devServerOrigin: DEV_SERVER_URL ? new URL(DEV_SERVER_URL).origin : null });

  target.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
        'X-Content-Type-Options': ['nosniff'],
      },
    });
  });

  target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  target.setPermissionCheckHandler(() => false);
  target.on('will-download', (event) => event.preventDefault());
}

/** Denies in-app navigation and popups for every WebContents in the process. */
function guardNavigation(contents) {
  const rendererOrigin = new URL(RENDERER_URL).origin;

  contents.on('will-navigate', (event, url) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      event.preventDefault();
      return;
    }
    if (target.origin !== rendererOrigin) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedLink(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createWindow() {
  const window = new BrowserWindow({
    // The renderer draws its own titlebar and window controls.
    frame: false,
    useContentSize: true,
    width: 1024,
    height: 580,
    minWidth: 940,
    minHeight: 540,
    backgroundColor: '#0f1217',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      spellcheck: false,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.loadURL(RENDERER_URL);
  return window;
}

/**
 * CI/verification hook. With COBBLESTONE_CAPTURE=<png path> the host renders the
 * window once, writes a screenshot and exits. It changes nothing in a normal run.
 */
function captureAndExit(window, destination) {
  window.webContents.once('did-finish-load', async () => {
    const settleMs = Number(process.env.COBBLESTONE_CAPTURE_DELAY || 3000);
    await new Promise((resolve) => { setTimeout(resolve, settleMs); });
    try {
      const image = await window.webContents.capturePage();
      await fsp.writeFile(destination, image.toPNG());
    } finally {
      app.quit();
    }
  });
}

let disposeHostIpc = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on('web-contents-created', (_event, contents) => guardNavigation(contents));

  app.whenReady().then(() => {
    // Left undefined so LauncherPaths uses the documented ~/.cobblestone root
    // (or COBBLESTONE_DATA_DIR), keeping the CLI and the desktop app on one
    // data directory instead of Electron's per-app userData path. The version
    // comes from package.json: app.getVersion() reports Electron's own version
    // in an unpackaged run.
    launcher = createLauncherBackend({ version: appVersion });

    protocol.handle(APP_SCHEME, serveRenderer);
    hardenSession(session.defaultSession);
    
    const { autoUpdater } = require('electron-updater');
    updaterController = createUpdaterController({ autoUpdater, app, emit: sendRendererEvent });

    disposeBackendIpc = registerElectronIpc({
      ipcMain,
      backend: launcher,
      validateSender,
      eventSink: sendRendererEvent,
    });
    disposeHostIpc = registerHostIpc(updaterController);

    mainWindow = createWindow();
    // The controller retains state if the check finishes before the renderer
    // mounts; the renderer reads that snapshot before subscribing to updates.
    updaterController.check();
    if (process.env.COBBLESTONE_CAPTURE) captureAndExit(mainWindow, process.env.COBBLESTONE_CAPTURE);

    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) mainWindow = createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', (event) => {
    if (shuttingDown) return;
    shuttingDown = true;
    event.preventDefault();
    (async () => {
      disposeHostIpc?.();
      disposeBackendIpc?.();
      updaterController?.dispose();
      await launcher?.shutdown().catch(() => undefined);
      app.exit(0);
    })();
  });
}

