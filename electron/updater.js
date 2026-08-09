const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Configure logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Disable auto-download - we'll prompt the user first
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow = null;

function init({ getWin }, ipcMain) {
  mainWindow = getWin;

  // Check for updates on app start (after 3 seconds)
  setTimeout(() => {
    checkForUpdates();
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
      return { ok: false, error: error.message };
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
    sendStatus({ type: 'error', message: err.message });
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

async function checkForUpdates() {
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
    return { ok: false, error: error.message };
  }
}

function sendStatus(status) {
  const win = mainWindow?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send('updater:status', status);
  }
}

module.exports = { init };
