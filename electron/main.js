const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const gameLauncher = require('./launcher');
const mods = require('./mods');
const authMod = require('./auth');
const settingsMod = require('./settings');
const javaMod = require('./java');
const modpacksMod = require('./modpacks');
const updaterMod = require('./updater');
const instanceMod = require('./instance');
const newsMod = require('./news');
const serverPingMod = require('./serverPing');
const telemetryMod = require('./telemetry');

let win;
const appIcon = path.join(__dirname, '..', 'icon.png');

function createWindow() {
  win = new BrowserWindow({
    width: 1160,
    height: 750,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    icon: appIcon,
    title: 'Native',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The renderer shows the version in a few places. Passing it as an
      // argument lets preload expose it synchronously, so nothing has to
      // render a placeholder while an IPC round-trip resolves.
      additionalArguments: [`--app-version=${app.getVersion()}`]
    }
  });

  win.on('maximize', () => win.webContents.send('window:maximized', true));
  win.on('unmaximize', () => win.webContents.send('window:maximized', false));

  // Never let untrusted pages replace the renderer that owns the privileged
  // preload bridge. Web links are opened by the OS instead.
  win.webContents.on('will-navigate', (event, url) => {
    const currentUrl = win.webContents.getURL();
    if (url === currentUrl) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

const instancesPath = () => path.join(app.getPath('userData'), 'instances.json');

ipcMain.handle('instances:load', () => {
  try {
    return JSON.parse(fs.readFileSync(instancesPath(), 'utf8'));
  } catch {
    return null;
  }
});

ipcMain.handle('instances:save', (_event, data) => {
  fs.mkdirSync(path.dirname(instancesPath()), { recursive: true });
  fs.writeFileSync(instancesPath(), JSON.stringify(data, null, 2));
});

ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:maximize', () => {
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
});
ipcMain.on('window:close', () => win?.close());

ipcMain.handle('external:open', async (_event, value) => {
  const url = new URL(String(value));
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported link');
  await shell.openExternal(url.href);
});

telemetryMod.init({ app, getWin: () => win, getLinkedNativeAccount: authMod.getLinkedNativeAccount }, ipcMain);
gameLauncher.init({ app, getWin: () => win, telemetry: telemetryMod }, ipcMain);
mods.init({ app }, ipcMain);
authMod.init({ app, getWin: () => win }, ipcMain);
settingsMod.init({ app }, ipcMain);
javaMod.init({ app, getWin: () => win }, ipcMain);
modpacksMod.init({ app, getWin: () => win }, ipcMain);
updaterMod.init({ app, getWin: () => win }, ipcMain);
instanceMod.init({ app }, ipcMain);
newsMod.init({ app }, ipcMain);
serverPingMod.init({ app }, ipcMain);

app.whenReady().then(() => {
  app.setName('Native');
  telemetryMod.startSession();
  createWindow();
  win.once('ready-to-show', () => win.show());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      win.once('ready-to-show', () => win.show());
    }
  });
});

app.on('before-quit', () => telemetryMod.endSession());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
