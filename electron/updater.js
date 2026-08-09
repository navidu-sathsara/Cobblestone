const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Configure logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Disable auto-download - we'll prompt the user first
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow = null;
// Whether the check in flight was started by the app rather than the user.
// A background check that fails is not something the user asked about or can
// act on, so its failure stays in the log.
let silentCheck = false;

function init({ getWin }, ipcMain) {
  mainWindow = getWin;

  // Check for updates on app start (after 3 seconds)
  setTimeout(() => {
    checkForUpdates({ silent: true });
  }, 3000);

  // IPC handlers
  ipcMain.handle('updater:check', async () => {
    return await checkForUpdates();
  });

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      log.error('Download error:', error);
      return { ok: false, error: friendlyError(error) };
    }
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // Auto-updater events
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
    sendStatus({ type: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    sendStatus({ type: 'available', version: info.version, releaseNotes: info.releaseNotes });
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('No updates available');
    sendStatus({ type: 'not-available', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    log.error('Update error:', err);
    if (!silentCheck) sendStatus({ type: 'error', message: friendlyError(err) });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendStatus({
      type: 'downloading',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    sendStatus({ type: 'downloaded', version: info.version });
  });
}

async function checkForUpdates({ silent = false } = {}) {
  silentCheck = silent;
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      ok: true,
      updateAvailable: result?.updateInfo?.version !== result?.currentVersion?.version,
      currentVersion: result?.currentVersion?.version,
      latestVersion: result?.updateInfo?.version
    };
  } catch (error) {
    log.error('Check for updates error:', error);
    return { ok: false, error: friendlyError(error) };
  } finally {
    // Cleared so a later download failure is still reported, since a download
    // only ever starts because the user pressed the button.
    silentCheck = false;
  }
}

// electron-updater puts the whole HTTP response into err.message: the request
// line, every response header, and Set-Cookie. Only the first line means
// anything to a user, and the session cookie has no business on screen.
function friendlyError(error) {
  const first = String(error?.message ?? '').split('\n')[0].trim();
  return first || 'Unknown error';
}

function sendStatus(status) {
  const win = mainWindow?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send('updater:status', status);
  }
}

module.exports = { init };
