'use strict';

/**
 * Narrow preload bridge.
 *
 * The renderer never receives `ipcRenderer`. Each operation the home page needs
 * is exposed as its own function, backend event delivery is filtered against an
 * allowlist, and the `{ ok, value | error }` envelope used by the backend
 * adapter is unwrapped into ordinary promise resolution/rejection.
 */

const { contextBridge, ipcRenderer } = require('electron');

/** Backend events the renderer is allowed to observe. */
const EVENT_NAMES = new Set([
  'auth:progress', 'auth:changed', 'settings:changed', 'download:progress',
  'instance:created', 'instance:updated', 'instance:deleted', 'instance:restored', 'instance:operation',
  'content:install', 'content:removed', 'modpack:progress', 'backup:created',
  'game:install', 'game:state', 'game:progress', 'game:log', 'java:install', 'loader:install',
  'updater:state',
]);

const listeners = new Map();

ipcRenderer.on('cobblestone:event', (_event, message) => {
  for (const listener of listeners.get(message?.name) || []) {
    try {
      listener(message.payload);
    } catch {
      // A faulty renderer callback must not break event delivery to the others.
    }
  }
});

async function call(channel, payload = {}) {
  const envelope = await ipcRenderer.invoke(channel, payload);
  if (envelope?.ok) return envelope.value;
  const error = new Error(envelope?.error?.message || 'The launcher did not respond');
  error.code = envelope?.error?.code || 'UNEXPECTED_ERROR';
  error.details = envelope?.error?.details;
  throw error;
}

function subscribe(name, listener) {
  if (!EVENT_NAMES.has(name) || typeof listener !== 'function') return () => {};
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(listener);
  return () => { listeners.get(name)?.delete(listener); };
}

contextBridge.exposeInMainWorld('cobblestone', {
  isDesktop: true,

  status: () => call('core:status'),

  settings: {
    get: () => call('settings:get'),
  },

  accounts: {
    list: () => call('accounts:list'),
    loginMicrosoft: () => call('accounts:loginMicrosoft'),
    addOffline: (username) => call('accounts:addOffline', { username }),
    setActive: (id) => call('accounts:setActive', { id }),
    remove: (id) => call('accounts:remove', { id }),
  },

  versions: {
    list: (options) => call('versions:list', options),
  },

  loaders: {
    list: (loader, minecraftVersion, force = false) => (
      call('loaders:list', { loader, minecraftVersion, force })
    ),
  },

  instances: {
    list: () => call('instances:list'),
    create: (payload) => call('instances:create', payload),
    update: (id, patch) => call('instances:update', { id, patch }),
    duplicate: (id, name) => call('instances:duplicate', { id, name }),
    delete: (id, permanent = false) => call('instances:delete', { id, permanent }),
    deleted: () => call('instances:deleted'),
    restore: (id) => call('instances:restore', { id }),
    openFolder: (id) => call('instances:openFolder', { id }),
    worlds: (id) => call('instances:worlds', { id }),
    readLog: (id, options) => call('instances:readLog', { id, options }),
    crashReports: (id) => call('instances:crashReports', { id }),
  },

  installation: {
    status: (instanceId) => call('installation:status', { instanceId }),
    install: (instanceId) => call('installation:install', { instanceId }),
    repair: (instanceId) => call('installation:repair', { instanceId }),
  },

  providers: {
    search: (provider, query) => call('providers:search', { provider, ...query }),
  },

  mods: {
    list: (instanceId) => call('mods:list', { instanceId }),
    install: (instanceId, request) => call('mods:install', { instanceId, ...request }),
    importLocal: (instanceId, sourcePath, options) => (
      call('mods:importLocal', { instanceId, sourcePath, options })
    ),
    remove: (instanceId, key) => call('mods:remove', { instanceId, key }),
    setEnabled: (instanceId, key, enabled) => (
      call('mods:setEnabled', { instanceId, key, enabled })
    ),
    setPinned: (instanceId, key, pinned) => (
      call('mods:setPinned', { instanceId, key, pinned })
    ),
    updates: (instanceId) => call('mods:updates', { instanceId }),
    updateAll: (instanceId) => call('mods:updateAll', { instanceId }),
    verify: (instanceId) => call('mods:verify', { instanceId }),
  },

  modpacks: {
    installProvider: (payload) => call('modpacks:installProvider', payload),
    installArchive: (archivePath, options) => (
      call('modpacks:installArchive', { archivePath, options })
    ),
  },

  backups: {
    create: (instanceId, options) => call('backups:create', { instanceId, options }),
    list: (instanceId) => call('backups:list', { instanceId }),
    restore: (filename, options) => call('backups:restore', { filename, options }),
  },

  files: {
    pickContent: (folder) => call('app:pickContentFile', { folder }),
    pickModpack: () => call('app:pickModpackFile'),
  },

  game: {
    launch: (instanceId, options) => call('game:launch', { instanceId, options }),
    stop: (instanceId) => call('game:stop', { instanceId }),
    list: () => call('game:list'),
  },

  servers: {
    ping: (address) => call('servers:ping', { address }),
  },

  window: {
    minimize: () => call('window:minimize'),
    maximize: () => call('window:maximize'),
    close: () => call('window:close'),
  },

  openExternal: (url) => call('app:openExternal', { url }),

  updater: {
    getState: () => call('updater:getState'),
    check: () => call('updater:check'),
    install: () => call('updater:install'),
  },

  on: subscribe,
});
