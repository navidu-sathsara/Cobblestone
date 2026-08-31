'use strict';

const { serializeError } = require('../core/errors');

/**
 * Registers a narrow Electron main-process API. It deliberately does not
 * create a BrowserWindow or expose ipcRenderer; a future host owns its UI and
 * preload bridge. Every privileged call is validated before dispatch.
 */
function registerElectronIpc({ ipcMain, backend, validateSender, eventSink = null }) {
  if (typeof validateSender !== 'function') {
    throw new TypeError('registerElectronIpc requires an explicit validateSender function');
  }
  const registrations = [];
  const handle = (channel, operation) => {
    ipcMain.handle(channel, async (event, payload = {}) => {
      if (!validateSender(event.senderFrame)) return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'IPC sender is not trusted' } };
      try { return { ok: true, value: await operation(payload) }; }
      catch (error) { return { ok: false, error: serializeError(error) }; }
    });
    registrations.push(channel);
  };

  handle('core:status', () => backend.status());
  handle('settings:get', () => backend.settings.get());
  handle('settings:set', (payload) => backend.settings.set(payload));
  handle('accounts:list', () => backend.accounts.list());
  handle('accounts:loginMicrosoft', () => backend.accounts.loginMicrosoft());
  handle('accounts:addOffline', ({ username }) => backend.accounts.addOffline(username));
  handle('accounts:setActive', ({ id }) => backend.accounts.setActive(id));
  handle('accounts:remove', ({ id }) => backend.accounts.remove(id));
  handle('versions:list', (payload) => backend.versions.list(payload));
  handle('versions:metadata', ({ id }) => backend.versions.metadata(id));
  handle('loaders:list', ({ loader, minecraftVersion, force }) => backend.loaders.versions(loader, minecraftVersion, { force }));
  handle('instances:list', () => backend.instances.list());
  handle('instances:create', (payload) => backend.instances.create(payload));
  handle('instances:update', ({ id, patch }) => backend.instances.update(id, patch));
  handle('instances:duplicate', ({ id, name }) => backend.instances.duplicate(id, name));
  handle('instances:delete', ({ id, permanent }) => backend.instances.delete(id, { permanent }));
  handle('instances:restore', ({ id }) => backend.instances.restore(id));
  handle('instances:files', ({ id, path }) => backend.instances.listFiles(id, path));
  handle('instances:worlds', ({ id }) => backend.instances.worlds(id));
  handle('instances:deleteWorld', ({ id, worldName }) => backend.instances.deleteWorld(id, worldName));
  handle('instances:deletedWorlds', ({ id }) => backend.instances.deletedWorlds(id));
  handle('instances:restoreWorld', ({ id, trashName, targetName }) => backend.instances.restoreWorld(id, trashName, targetName));
  handle('instances:readLog', ({ id, options }) => backend.instances.readLog(id, options));
  handle('instances:crashReports', ({ id }) => backend.instances.crashReports(id));
  handle('installation:status', ({ instanceId }) => backend.installation.installed(instanceId));
  handle('installation:install', ({ instanceId }) => backend.installation.install(instanceId));
  handle('installation:repair', ({ instanceId }) => backend.installation.install(instanceId, { repair: true }));
  handle('providers:search', ({ provider, ...query }) => backend.providers.search(provider, query));
  handle('providers:curseforgeConfigured', () => backend.providers.get('curseforge').configured());
  handle('providers:setCurseforgeKey', ({ apiKey }) => backend.providers.get('curseforge').setApiKey(apiKey));
  handle('mods:list', ({ instanceId }) => backend.mods.list(instanceId));
  handle('mods:install', ({ instanceId, ...request }) => backend.mods.install(instanceId, request));
  handle('mods:importLocal', ({ instanceId, sourcePath, options }) => backend.mods.importLocal(instanceId, sourcePath, options));
  handle('mods:remove', ({ instanceId, key }) => backend.mods.remove(instanceId, key));
  handle('mods:setEnabled', ({ instanceId, key, enabled }) => backend.mods.setEnabled(instanceId, key, enabled));
  handle('mods:setPinned', ({ instanceId, key, pinned }) => backend.mods.setPinned(instanceId, key, pinned));
  handle('mods:updates', ({ instanceId }) => backend.mods.checkUpdates(instanceId));
  handle('mods:updateAll', ({ instanceId }) => backend.mods.updateAll(instanceId));
  handle('mods:verify', ({ instanceId }) => backend.mods.verify(instanceId));
  handle('modpacks:installProvider', (payload) => backend.modpacks.installFromProvider(payload));
  handle('modpacks:installArchive', ({ archivePath, options }) => backend.modpacks.installArchive(archivePath, options));
  handle('backups:create', ({ instanceId, options }) => backend.backups.create(instanceId, options));
  handle('backups:list', ({ instanceId }) => backend.backups.list(instanceId));
  handle('backups:restore', ({ filename, options }) => backend.backups.restore(filename, options));
  handle('game:launch', ({ instanceId, options }) => backend.game.launch(instanceId, options));
  handle('game:stop', ({ instanceId, options }) => backend.game.stop(instanceId, options));
  handle('game:list', () => backend.game.list());
  handle('downloads:list', () => backend.downloads.list());
  handle('downloads:pause', ({ id }) => backend.downloads.pause(id));
  handle('downloads:resume', ({ id }) => backend.downloads.resume(id));
  handle('downloads:cancel', ({ id, discardPartial }) => backend.downloads.cancel(id, { discardPartial }));
  handle('servers:ping', ({ address, options }) => backend.servers.ping(address, options));
  handle('diagnostics:doctor', (payload) => backend.diagnostics.doctor(payload));
  handle('diagnostics:storage', () => backend.diagnostics.storage());
  handle('diagnostics:verifyInstance', ({ instanceId }) => backend.diagnostics.verifyInstance(instanceId));
  handle('diagnostics:cleanup', (payload) => backend.diagnostics.cleanup(payload));

  const forwardedEvents = [
    'auth:progress', 'auth:changed', 'settings:changed', 'download:progress',
    'instance:created', 'instance:updated', 'instance:deleted', 'instance:operation',
    'content:install', 'content:removed', 'modpack:progress', 'backup:created',
    'game:install', 'game:state', 'game:progress', 'game:log', 'java:install', 'loader:install',
  ];
  const listeners = forwardedEvents.map((name) => {
    const listener = (payload) => eventSink?.(name, payload);
    backend.events.on(name, listener);
    return [name, listener];
  });

  return () => {
    for (const channel of registrations) ipcMain.removeHandler(channel);
    for (const [name, listener] of listeners) backend.events.off(name, listener);
  };
}

module.exports = { registerElectronIpc };
