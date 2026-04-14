const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('overlayAPI', {
  onPingUpdate: (cb) => ipcRenderer.on('ping-update', (_, data) => cb(data)),
  onConfig: (cb) => ipcRenderer.on('overlay:config', (_, d) => cb(d)),
  closeOverlay: () => ipcRenderer.send('overlay-close'),
})
