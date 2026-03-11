const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atlasDesktop', {
  savePanorama: (payload) => ipcRenderer.invoke('panorama:save', payload),
  readPanorama: (filePath) => ipcRenderer.invoke('panorama:read', { filePath }),
  pickPanorama: () => ipcRenderer.invoke('panorama:pick'),
  deletePanorama: (filePath) => ipcRenderer.invoke('panorama:delete', { filePath }),
  getDefaultPanoramaPath: () => ipcRenderer.invoke('panorama:getDefaultPath'),
  listWorldPresets: () => ipcRenderer.invoke('worldPreset:list'),
  readWorldPreset: (id) => ipcRenderer.invoke('worldPreset:read', { id }),
  saveWorldPreset: (name, config) => ipcRenderer.invoke('worldPreset:save', { name, config }),
  deleteWorldPreset: (id) => ipcRenderer.invoke('worldPreset:delete', { id }),
  scanMusicFolders: () => ipcRenderer.invoke('music:scanFolders'),
  openExternal: (url) => ipcRenderer.invoke('system:openExternal', { url }),
});
