'use strict';

/**
 * Owns electron-updater's lifecycle and converts its event stream into a small,
 * serializable state object suitable for the sandboxed renderer.
 */
function createUpdaterController({ autoUpdater, app, emit }) {
  let state = {
    status: app.isPackaged ? 'idle' : 'disabled',
    version: null,
    percent: null,
    transferred: null,
    total: null,
    bytesPerSecond: null,
    message: app.isPackaged ? null : 'Updates are available in installed builds only',
  };

  const listeners = [];
  const publish = (patch) => {
    state = { ...state, ...patch };
    emit?.('updater:state', { ...state });
    return { ...state };
  };
  const on = (name, listener) => {
    autoUpdater.on(name, listener);
    listeners.push([name, listener]);
  };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  on('checking-for-update', () => publish({
    status: 'checking', message: 'Checking for updates…', percent: null,
  }));
  on('update-available', (info) => publish({
    status: 'available', version: info?.version || null,
    message: info?.version ? `Version ${info.version} is available` : 'An update is available',
    percent: 0,
  }));
  on('update-not-available', (info) => publish({
    status: 'current', version: info?.version || app.getVersion(),
    message: 'Cobblestone is up to date', percent: null,
  }));
  on('download-progress', (progress) => publish({
    status: 'downloading',
    percent: Number.isFinite(progress?.percent) ? Math.max(0, Math.min(100, progress.percent)) : null,
    transferred: Number.isFinite(progress?.transferred) ? progress.transferred : null,
    total: Number.isFinite(progress?.total) ? progress.total : null,
    bytesPerSecond: Number.isFinite(progress?.bytesPerSecond) ? progress.bytesPerSecond : null,
    message: 'Downloading update…',
  }));
  on('update-downloaded', (info) => publish({
    status: 'downloaded', version: info?.version || state.version,
    percent: 100, message: 'Update ready to install',
  }));
  on('error', (error) => publish({
    status: 'error',
    message: String(error?.message || 'Update failed').slice(0, 300),
  }));

  async function check() {
    if (!app.isPackaged) return { ...state };
    publish({ status: 'checking', message: 'Checking for updates…', percent: null });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      if (state.status !== 'error') publish({
        status: 'error', message: String(error?.message || 'Update check failed').slice(0, 300),
      });
    }
    return { ...state };
  }

  function install() {
    if (state.status !== 'downloaded') return false;
    publish({ status: 'installing', message: 'Restarting to install…' });
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return true;
  }

  return {
    getState: () => ({ ...state }),
    check,
    install,
    dispose: () => {
      for (const [name, listener] of listeners) autoUpdater.off(name, listener);
    },
  };
}

module.exports = { createUpdaterController };
