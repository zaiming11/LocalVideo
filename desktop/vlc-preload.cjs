const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('vlc', {
  command: (action, input) => ipcRenderer.invoke('vlc:hud', action, input),
  onState: callback => ipcRenderer.on('vlc:state', (_event, state) => callback(state))
})
