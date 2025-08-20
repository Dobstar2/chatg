const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('appApi', {
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  saveScene: (obj) => ipcRenderer.invoke('save-scene', obj),
  exportSceneAs: (obj) => ipcRenderer.invoke('export-scene-as', obj)
});
