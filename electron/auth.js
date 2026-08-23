const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { BrowserWindow, WebContentsView, shell } = require('electron');
const { Auth } = require('msmc');

/**
 * Multi-account authentication (main process).
 *
 * Storage: accounts.json in userData
 *   { activeId: string|null, accounts: [{ id, name, uuid, type, refresh? }] }
 *
 * Automatically migrates the old single-account account.json on first run.
 */

let deps = null;
let mcSessions = {}; // id -> msmc mc token object
let activeAuthWindow = null;
let microsoftLoginPromise = null;

const AUTH_HEADER_HEIGHT = 58;
const appIcon = path.join(__dirname, '..', 'icon.png');
const authShell = path.join(__dirname, 'auth-window.html');
const authPreload = path.join(__dirname, 'auth-preload.js');
const NATIVE_API = process.env.NATIVE_ACCOUNT_API || 'https://nativelaunch.xyz/api';

const accountsPath = () => path.join(deps.app.getPath('userData'), 'accounts.json');
const legacyPath  = () => path.join(deps.app.getPath('userData'), 'account.json');

function readAccounts() {
  try {
    const data = JSON.parse(fs.readFileSync(accountsPath(), 'utf8'));
    if (Array.isArray(data.accounts)) return data;
  } catch { /* not yet created */ }

  // Migrate legacy single-account file
  try {
    const legacy = JSON.parse(fs.readFileSync(legacyPath(), 'utf8'));
    if (legacy?.name) {
      const id = legacy.uuid || `ms-${Date.now()}`;
      const migrated = {
        activeId: id,
        accounts: [{ id, name: legacy.name, uuid: legacy.uuid, type: 'microsoft', refresh: legacy.refresh }]
      };
      saveAccounts(migrated);
      return migrated;
    }
  } catch { /* no legacy either */ }

  return { activeId: null, accounts: [] };
}

function saveAccounts(data) {
  fs.writeFileSync(accountsPath(), JSON.stringify(data, null, 2));
}

const wait = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

function sendNativeLinkState(payload) {
  const win = deps?.getWin?.();
  if (win && !win.isDestroyed()) win.webContents.send('accounts:nativeLinkState', payload);
}

async function nativeApi(pathname, options = {}) {
  const response = await fetch(`${NATIVE_API}${pathname}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function linkNativeAccount() {
  const started = await nativeApi('/launcher/device/start', {
    method: 'POST',
    body: JSON.stringify({ deviceName: `Native Launcher ${process.platform}` })
  });
  if (!started.response.ok || !started.data.deviceCode) throw new Error(started.data.reason || 'Could not start Native account linking.');
  sendNativeLinkState({ status: 'waiting', userCode: started.data.userCode, expiresIn: started.data.expiresIn });
  await shell.openExternal(started.data.verificationUrl);

  const deadline = Date.now() + Number(started.data.expiresIn || 600) * 1000;
  const interval = Math.max(2, Number(started.data.interval || 2)) * 1000;
  while (Date.now() < deadline) {
    await wait(interval);
    const status = await nativeApi('/launcher/device/status', {
      method: 'POST',
      body: JSON.stringify({ deviceCode: started.data.deviceCode })
    });
    if (status.response.status === 202) continue;
    if (!status.response.ok || status.data.status !== 'approved') throw new Error(status.data.reason || 'Native account linking expired.');

    const profile = status.data.profile;
    const account = {
      id: `native-${profile.userId}`,
      name: profile.minecraftUsername,
      uuid: profile.minecraftUsername,
      email: profile.email,
      type: 'native',
      nativeToken: status.data.token
    };
    const saved = readAccounts();
    saved.accounts = saved.accounts.filter(item => item.id !== account.id);
    saved.accounts.push(account);
    saved.activeId = account.id;
    saveAccounts(saved);
    sendNativeLinkState({ status: 'linked', userCode: started.data.userCode, account: { name: account.name, email: account.email } });
    return account;
  }
  throw new Error('Native account linking expired. Start again from the launcher.');
}

async function refreshNativeAccounts(data) {
  let changed = false;
  for (const account of data.accounts) {
    if (account.type !== 'native' || !account.nativeToken) continue;
    try {
      const result = await nativeApi('/launcher/profile', {
        method: 'GET',
        headers: { authorization: `Bearer ${account.nativeToken}` }
      });
      if (!result.response.ok || !result.data.profile?.minecraftUsername) continue;
      const profile = result.data.profile;
      if (account.name !== profile.minecraftUsername || account.email !== profile.email) {
        account.name = profile.minecraftUsername;
        account.uuid = profile.minecraftUsername;
        account.email = profile.email;
        changed = true;
      }
    } catch { /* retain the last usable profile while offline */ }
  }
  if (changed) saveAccounts(data);
  return data;
}

function getLinkedNativeAccount() {
  const data = readAccounts();
  const active = data.accounts.find(account => account.id === data.activeId && account.type === 'native' && account.nativeToken);
  return active || [...data.accounts].reverse().find(account => account.type === 'native' && account.nativeToken) || null;
}

function microsoftAuthCode(authManager) {
  return new Promise((resolve, reject) => {
    const parent = deps?.getWin?.();
    const authWindow = new BrowserWindow({
      width: 540,
      height: 760,
      minWidth: 480,
      minHeight: 640,
      parent: parent && !parent.isDestroyed() ? parent : undefined,
      modal: Boolean(parent && !parent.isDestroyed()),
      frame: false,
      show: false,
      center: true,
      resizable: true,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: '#f4f4f4',
      icon: appIcon,
      title: 'Sign in to Microsoft — Native',
      webPreferences: {
        preload: authPreload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    const authView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        partition: 'persist:native-microsoft-auth'
      }
    });

    activeAuthWindow = authWindow;
    authWindow.contentView.addChildView(authView);

    const layoutAuthView = () => {
      if (authWindow.isDestroyed()) return;
      const [width, height] = authWindow.getContentSize();
      authView.setBounds({
        x: 0,
        y: AUTH_HEADER_HEIGHT,
        width,
        height: Math.max(0, height - AUTH_HEADER_HEIGHT)
      });
    };

    let settled = false;
    const complete = (error, code) => {
      if (settled) return false;
      settled = true;
      if (error) reject(error);
      else resolve(code);
      if (!authWindow.isDestroyed()) authWindow.close();
      return true;
    };

    const inspectRedirect = (url) => {
      if (!url?.startsWith(authManager.token.redirect)) return false;

      try {
        const callback = new URL(url);
        const code = callback.searchParams.get('code');
        if (code) return complete(null, code);

        const detail = callback.searchParams.get('error_description')
          || callback.searchParams.get('error')
          || 'Microsoft sign-in was not completed.';
        return complete(new Error(detail));
      } catch {
        return complete(new Error('Microsoft returned an invalid sign-in response.'));
      }
    };

    layoutAuthView();
    authWindow.on('resize', layoutAuthView);
    authWindow.on('closed', () => {
      if (activeAuthWindow === authWindow) activeAuthWindow = null;
      if (!settled) {
        settled = true;
        reject(new Error('Microsoft sign-in cancelled.'));
      }
    });

    authWindow.once('ready-to-show', () => {
      if (!authWindow.isDestroyed()) authWindow.show();
    });

    const contents = authView.webContents;
    let authPageLoading = true;
    const publishLoadingState = () => {
      if (!authWindow.isDestroyed()) {
        authWindow.webContents.send('auth-window:loading', authPageLoading);
      }
    };

    authWindow.webContents.on('did-finish-load', publishLoadingState);
    contents.on('did-start-loading', () => {
      authPageLoading = true;
      publishLoadingState();
    });
    contents.on('did-stop-loading', () => {
      authPageLoading = false;
      publishLoadingState();
    });
    contents.on('will-redirect', (event, url) => {
      if (inspectRedirect(url)) event.preventDefault();
    });
    contents.on('did-navigate', (_event, url) => inspectRedirect(url));
    contents.on('did-finish-load', () => inspectRedirect(contents.getURL()));
    contents.on('did-fail-load', (_event, errorCode, description, url, isMainFrame) => {
      // Chromium reports an aborted load while an OAuth redirect is being intercepted.
      if (!isMainFrame || errorCode === -3 || inspectRedirect(url)) return;
      complete(new Error(`Could not load Microsoft sign-in: ${description}`));
    });

    contents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });

    authWindow.loadFile(authShell).catch((error) => complete(error));
    contents.loadURL(authManager.createLink()).catch((error) => {
      // Redirect interception can reject loadURL after the login has already completed.
      if (!settled) complete(error);
    });
  });
}

async function performMicrosoftLogin() {
  const authManager = new Auth('select_account');
  const code = await microsoftAuthCode(authManager);
  const xbox = await authManager.login(code);
  const mc = await xbox.getMinecraft();

  const id = mc.profile?.id || `ms-${Date.now()}`;
  const profile = { name: mc.profile?.name, uuid: mc.profile?.id };

  mcSessions[id] = mc;

  const data = readAccounts();
  // Replace if same uuid already exists (re-auth)
  data.accounts = data.accounts.filter(a => a.id !== id);
  data.accounts.push({ id, name: profile.name, uuid: profile.uuid, type: 'microsoft', refresh: xbox.save() });
  data.activeId = id;
  saveAccounts(data);

  return { id, ...profile };
}

async function loginMicrosoft() {
  if (microsoftLoginPromise) {
    if (activeAuthWindow && !activeAuthWindow.isDestroyed()) {
      activeAuthWindow.show();
      activeAuthWindow.focus();
    }
    return microsoftLoginPromise;
  }

  microsoftLoginPromise = performMicrosoftLogin();
  try {
    return await microsoftLoginPromise;
  } finally {
    microsoftLoginPromise = null;
  }
}

/** MCLC-compatible auth for the current active account. Returns null if not an MS account or token expired. */
async function getMclcAuth() {
  try {
    const { accounts, activeId } = readAccounts();
    const acc = accounts.find(a => a.id === activeId);
    if (!acc || acc.type !== 'microsoft') return null;

    const cached = mcSessions[acc.id];
    if (cached && (typeof cached.validate !== 'function' || cached.validate())) {
      return cached.mclc();
    }

    if (!acc.refresh) return null;

    const authManager = new Auth('select_account');
    const xbox = await authManager.refresh(acc.refresh);
    const mc = await xbox.getMinecraft();
    mcSessions[acc.id] = mc;

    const data = readAccounts();
    const idx = data.accounts.findIndex(a => a.id === acc.id);
    if (idx >= 0) {
      data.accounts[idx].refresh = xbox.save();
      data.accounts[idx].name = mc.profile?.name;
      data.accounts[idx].uuid = mc.profile?.id;
      saveAccounts(data);
    }

    return mc.mclc();
  } catch {
    return null;
  }
}

function init(dependencies, ipcMain) {
  deps = dependencies;

  ipcMain.on('auth-window:minimize', (event) => {
    const target = BrowserWindow.fromWebContents(event.sender);
    if (target && target === activeAuthWindow) target.minimize();
  });

  ipcMain.on('auth-window:close', (event) => {
    const target = BrowserWindow.fromWebContents(event.sender);
    if (target && target === activeAuthWindow) target.close();
  });

  // ── Legacy single-account handlers (kept for backward compat) ──────────

  ipcMain.handle('auth:login', async () => {
    try {
      const profile = await loginMicrosoft();
      return { ok: true, profile };
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  });

  ipcMain.handle('auth:restore', () => {
    const { accounts, activeId } = readAccounts();
    const acc = accounts.find(a => a.id === activeId);
    return acc ? { name: acc.name, uuid: acc.uuid } : null;
  });

  ipcMain.handle('auth:logout', () => {
    const data = readAccounts();
    const id = data.activeId;
    if (id) {
      delete mcSessions[id];
      data.accounts = data.accounts.filter(a => a.id !== id);
      data.activeId = data.accounts[0]?.id ?? null;
      saveAccounts(data);
    }
    return true;
  });

  // ── Multi-account handlers ─────────────────────────────────────────────

  ipcMain.handle('accounts:list', async () => {
    const { accounts, activeId } = await refreshNativeAccounts(readAccounts());
    return {
      activeId,
      // never send Microsoft refresh tokens or Native device tokens to the renderer
      accounts: accounts.map(({ refresh: _r, nativeToken: _n, ...rest }) => rest)
    };
  });

  ipcMain.handle('accounts:addOffline', (_event, name) => {
    if (!name?.trim()) return { ok: false, error: 'Name is required' };
    const data = readAccounts();
    const id = `offline-${crypto.randomBytes(4).toString('hex')}`;
    const account = { id, name: name.trim(), uuid: null, type: 'offline' };
    data.accounts.push(account);
    if (!data.activeId) data.activeId = id;
    saveAccounts(data);
    return { ok: true, account };
  });

  ipcMain.handle('accounts:addMicrosoft', async () => {
    try {
      const profile = await loginMicrosoft();
      return { ok: true, profile };
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  });

  ipcMain.handle('accounts:addNative', async () => {
    try {
      const account = await linkNativeAccount();
      const { nativeToken: _token, ...profile } = account;
      return { ok: true, account: profile };
    } catch (err) {
      sendNativeLinkState({ status: 'error', error: String(err?.message ?? err) });
      return { ok: false, error: String(err?.message ?? err) };
    }
  });

  ipcMain.handle('accounts:getAvatar', async (_event, uuid) => {
    const avatarUuid = uuid || 'MHF_Steve';
    const avatarsDir = path.join(deps.app.getPath('userData'), 'avatars');
    const targetPath = path.join(avatarsDir, `${avatarUuid}.png`);

    if (!fs.existsSync(targetPath)) {
      try {
        fs.mkdirSync(avatarsDir, { recursive: true });
        const url = `https://mc-heads.net/avatar/${avatarUuid}/100`;
        const res = await fetch(url);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(targetPath, buffer);
        } else {
          return `https://mc-heads.net/avatar/${avatarUuid}/100`;
        }
      } catch (err) {
        return `https://mc-heads.net/avatar/${avatarUuid}/100`;
      }
    }

    try {
      const data = fs.readFileSync(targetPath);
      return `data:image/png;base64,${data.toString('base64')}`;
    } catch {
      return `https://mc-heads.net/avatar/${avatarUuid}/100`;
    }
  });

  ipcMain.handle('accounts:setActive', (_event, id) => {
    const data = readAccounts();
    if (!data.accounts.find(a => a.id === id)) return false;
    data.activeId = id;
    saveAccounts(data);
    return true;
  });

  ipcMain.handle('accounts:remove', (_event, id) => {
    const data = readAccounts();
    delete mcSessions[id];
    data.accounts = data.accounts.filter(a => a.id !== id);
    if (data.activeId === id) data.activeId = data.accounts[0]?.id ?? null;
    saveAccounts(data);
    return true;
  });
}

module.exports = { init, getMclcAuth, getLinkedNativeAccount };
