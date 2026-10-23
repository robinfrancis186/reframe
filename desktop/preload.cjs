const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('reframeDesktop', {
  importLibrary: () => ipcRenderer.invoke('reframe:import-library'),
  retryStartup: () => ipcRenderer.invoke('reframe:retry-startup'),
  openStartupLog: () => ipcRenderer.invoke('reframe:open-log'),
});
