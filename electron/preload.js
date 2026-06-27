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
  // App-quit flush handshake: main asks the renderer to save before the window
  // closes; the renderer replies when done so no final edits are lost on quit.
  onFlushRequest: (callback) => ipcRenderer.on('app:flush-request', () => callback()),
  flushComplete: () => ipcRenderer.invoke('app:flush-complete'),
  // Filesystem world saves (desktop). Chunk bytes cross as Uint8Array (never base64).
  saves: {
    list: () => ipcRenderer.invoke('saves:list'),
    readMeta: (worldId) => ipcRenderer.invoke('saves:readMeta', { worldId }),
    writeMeta: (meta) => ipcRenderer.invoke('saves:writeMeta', { meta }),
    create: (meta) => ipcRenderer.invoke('saves:create', { meta }),
    delete: (worldId) => ipcRenderer.invoke('saves:delete', { worldId }),
    rename: (worldId, name) => ipcRenderer.invoke('saves:rename', { worldId, name }),
    readChunk: (worldId, cx, cz) => ipcRenderer.invoke('saves:readChunk', { worldId, cx, cz }),
    writeChunks: (worldId, chunks) => ipcRenderer.invoke('saves:writeChunks', { worldId, chunks }),
    readChunksAll: (worldId) => ipcRenderer.invoke('saves:readChunksAll', { worldId }),
    open: (worldId) => ipcRenderer.invoke('saves:open', { worldId }),
    close: (worldId) => ipcRenderer.invoke('saves:close', { worldId }),
    openFolder: (worldId) => ipcRenderer.invoke('saves:openFolder', { worldId }),
  },
});
