const {contextBridge,ipcRenderer}=require('electron')
contextBridge.exposeInMainWorld('LocalVideoSpider',{
  request:(url,options)=>ipcRenderer.sendSync('spider:request',url,options),
  storage:(action,namespace,key,value)=>ipcRenderer.sendSync('spider:storage',action,namespace,key,value),
  complete:(id,value,error)=>ipcRenderer.send('spider:complete',id,value,error)
})
