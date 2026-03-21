const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('electronAPI', {
  minimize:    () => ipcRenderer.send('minimize'),
  close:       () => ipcRenderer.send('close'),
  send:        (ch, val) => ipcRenderer.send(ch, val),
  getStartup:  () => ipcRenderer.invoke('get-startup'),
})
