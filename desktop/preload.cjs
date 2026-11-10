const { contextBridge, ipcRenderer, webUtils } = require('electron')

// Sandboxed preload scripts have browser encoding APIs, not Node's Buffer.
function encodeMediaSource(source) {
  const bytes = new TextEncoder().encode(JSON.stringify(source))
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

contextBridge.exposeInMainWorld('localVideoDesktop', {
  version: '1.1.0-alpha.4',
  vlcOpen: input => ipcRenderer.invoke('vlc:open', input),
  vlcCommand: (action, input) => ipcRenderer.invoke('vlc:command', action, input),
  onVlcEvent: callback => { const listener = (_event, data) => callback(data); ipcRenderer.on('vlc:event', listener); return () => ipcRenderer.removeListener('vlc:event', listener) },
  updateConfig: () => ipcRenderer.invoke('update:config'),
  saveUpdateConfig: input => ipcRenderer.invoke('update:save', input),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateProgress: callback => { const listener = (_event, progress) => callback(progress); ipcRenderer.on('update:progress', listener); return () => ipcRenderer.removeListener('update:progress', listener) },
  tvboxRequest: input => ipcRenderer.invoke('tvbox:request', input),
  pickTVBoxFolder: () => ipcRenderer.invoke('tvbox:pick-folder'),
  restoreTVBoxFolder: id => ipcRenderer.invoke('tvbox:restore-folder', id),
  tvboxMediaUrl: (url, headers = {}, allowLocal = false) => 'tvboxmedia://stream/' + encodeMediaSource({ url, headers, allowLocal: !!allowLocal }),
  pickFiles: () => ipcRenderer.invoke('media:pick-files'),
  pickDirectory: () => ipcRenderer.invoke('media:pick-directory'),
  importDroppedFiles: (files) => ipcRenderer.invoke('media:drop', files.map((file) => webUtils.getPathForFile(file)).filter(Boolean))
})
