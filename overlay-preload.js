const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('overlayAPI', {
  onPingUpdate: (cb) => ipcRenderer.on('ping-update', (_, data) => cb(data)),
  closeOverlay: () => ipcRenderer.send('overlay-close'),
})
