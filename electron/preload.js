const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  onMaximizedChange: (callback) =>
    ipcRenderer.on('window:maximized', (_event, isMaximized) => callback(isMaximized)),
  instances: {
    load: () => ipcRenderer.invoke('instances:load'),
    save: (data) => ipcRenderer.invoke('instances:save', data)
  },
  auth: {
    login: () => ipcRenderer.invoke('auth:login'),
    restore: () => ipcRenderer.invoke('auth:restore'),
    logout: () => ipcRenderer.invoke('auth:logout')
  },
  accounts: {
    list:         ()     => ipcRenderer.invoke('accounts:list'),
    addOffline:   (name) => ipcRenderer.invoke('accounts:addOffline', name),
    addMicrosoft: ()     => ipcRenderer.invoke('accounts:addMicrosoft'),
    setActive:    (id)   => ipcRenderer.invoke('accounts:setActive', id),
    remove:       (id)   => ipcRenderer.invoke('accounts:remove', id)
  },
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings),
    detectJava: () => ipcRenderer.invoke('settings:detectJava'),
    dataDir: () => ipcRenderer.invoke('settings:dataDir'),
    openDataDir: () => ipcRenderer.invoke('settings:openDataDir'),
    storageInfo: () => ipcRenderer.invoke('settings:storageInfo')
  },
  java: {
    test: (javaPath) => ipcRenderer.invoke('java:test', javaPath),
    detectFor: (major) => ipcRenderer.invoke('java:detectFor', major),
    install: (major) => ipcRenderer.invoke('java:install', major),
    browse: () => ipcRenderer.invoke('java:browse'),
    onProgress: (callback) => subscribe('java:progress', callback)
  },
  mods: {
    installed: (instanceId) => ipcRenderer.invoke('mods:installed', instanceId),
    install: (payload) => ipcRenderer.invoke('mods:install', payload),
    remove: (payload) => ipcRenderer.invoke('mods:remove', payload)
  },
  modpacks: {
    install: (projectId) => ipcRenderer.invoke('modpack:install', projectId),
    onProgress: (callback) => subscribe('modpack:progress', callback)
  },
  launcher: {
    launch: (instance, account) =>
      ipcRenderer.send('launcher:launch', { instance, account }),
    kill: () => ipcRenderer.send('launcher:kill'),
    onState: (callback) => subscribe('launcher:state', callback),
    onProgress: (callback) => subscribe('launcher:progress', callback),
    onLog: (callback) => subscribe('launcher:log', callback)
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback) => subscribe('updater:status', callback)
  },
  instance: {
    listDir:     (id, sub)  => ipcRenderer.invoke('instance:listDir', id, sub),
    openFolder:  (id, sub)  => ipcRenderer.invoke('instance:openFolder', id, sub),
    worldList:   (id)       => ipcRenderer.invoke('instance:worldList', id),
    deleteWorld: (id, name) => ipcRenderer.invoke('instance:deleteWorld', id, name),
    getLogFile:  (id)       => ipcRenderer.invoke('instance:getLogFile', id),
    isInstalled: (version)  => ipcRenderer.invoke('instance:isInstalled', version),
    recentServers: ()       => ipcRenderer.invoke('instance:recentServers')
  },
  news: {
    list: (options) => ipcRenderer.invoke('news:list', options)
  }
});

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
