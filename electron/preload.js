const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  getVersion: () => ipcRenderer.invoke('app-version'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('maximize-change', (_, isMaximized) => callback(isMaximized));
  },

  // Local server management for Self-Host mode
  localServer: {
    start: () => ipcRenderer.invoke('local-server:start'),
    stop: () => ipcRenderer.invoke('local-server:stop'),
    info: () => ipcRenderer.invoke('local-server:info'),
  },

  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    getStatus: () => ipcRenderer.invoke('updater:status'),
    restartAndInstall: () => ipcRenderer.invoke('updater:restart-and-install'),
    onStatus: (callback) => {
      const listener = (_, payload) => callback(payload);
      ipcRenderer.on('updater:status', listener);
      return () => ipcRenderer.removeListener('updater:status', listener);
    },
  },

  isElectron: true,
});
