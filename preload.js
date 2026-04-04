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
  setOverlayHotkey: (key) => ipcRenderer.send('set-overlay-hotkey', key),
  sendPingData:    (data) => ipcRenderer.send('ping-data', data),
  getAppVersion:   () => ipcRenderer.invoke('get-app-version'),
  notify:          (title, body) => ipcRenderer.send('notify', title, body),
  onWindowState:   (cb) => ipcRenderer.on('window-state', (_, data) => cb(data)),
  // Updater
  onUpdateStatus:  (cb) => ipcRenderer.on('update-status', (_, data) => cb(data)),
  installUpdate:   () => ipcRenderer.send('update-install-now'),
  checkForUpdates: () => ipcRenderer.send('update-check-manual'),
})
