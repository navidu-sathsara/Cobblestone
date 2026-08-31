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
  'instance:created', 'instance:updated', 'instance:deleted', 'instance:operation',
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

  instances: {
    list: () => call('instances:list'),
    create: (payload) => call('instances:create', payload),
  },

  installation: {
    status: (instanceId) => call('installation:status', { instanceId }),
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
