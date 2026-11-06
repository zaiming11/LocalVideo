const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('localVideoDesktop', {
  version: '1.0.1',
  pickFiles: () => ipcRenderer.invoke('media:pick-files'),
  pickDirectory: () => ipcRenderer.invoke('media:pick-directory'),
  importDroppedFiles: (files) => ipcRenderer.invoke('media:drop', files.map((file) => webUtils.getPathForFile(file)).filter(Boolean))
})
