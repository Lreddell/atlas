const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atlasDesktop', {
  savePanorama: (payload) => ipcRenderer.invoke('panorama:save', payload),
  readPanorama: (filePath) => ipcRenderer.invoke('panorama:read', { filePath }),
  pickPanorama: () => ipcRenderer.invoke('panorama:pick'),
  deletePanorama: (filePath) => ipcRenderer.invoke('panorama:delete', { filePath }),
});
