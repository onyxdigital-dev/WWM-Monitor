const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('electronAPI', {
  minimize:        () => ipcRenderer.send('minimize'),
  close:           () => ipcRenderer.send('close'),
  send:            (ch, val) => ipcRenderer.send(ch, val),
  getStartup:      () => ipcRenderer.invoke('get-startup'),
  getSettings:     () => ipcRenderer.invoke('get-settings'),
  saveSettings:    (cfg) => ipcRenderer.invoke('save-settings', cfg),
  openOverlay:     () => ipcRenderer.send('overlay-open'),
  closeOverlay:    () => ipcRenderer.send('overlay-close'),
  sendPingData:    (data) => ipcRenderer.send('ping-data', data),
  // Updater
  onUpdateStatus:  (cb) => ipcRenderer.on('update-status', (_, data) => cb(data)),
  installUpdate:   () => ipcRenderer.send('update-install-now'),
  checkForUpdates: () => ipcRenderer.send('update-check-manual'),
})
