const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs')

let win = null
let tray = null
let backend = null
let overlay = null
let useTray = true
let isQuitting = false

// ─── Simple file logger ───────────────────────────────────────────────────────
function writeLog(msg) {
  try {
    const logPath = path.join(app.getPath('userData'), 'updater.log')
    const line = `[${new Date().toISOString()}] ${msg}\n`
    fs.appendFileSync(logPath, line)
  } catch(e) {}
}

// ─── Auto Updater ─────────────────────────────────────────────────────────────
let autoUpdater = null
try {
  autoUpdater = require('electron-updater').autoUpdater
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null
} catch(e) {
  console.warn('[updater] electron-updater not available:', e.message)
}

function initUpdater() {
  if (!autoUpdater) return

  autoUpdater.on('checking-for-update', () => {
    writeLog('checking-for-update')
    sendUpdateStatus({ type: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    writeLog(`update-available: ${info.version}`)
    sendUpdateStatus({ type: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    writeLog('update-not-available')
    sendUpdateStatus({ type: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({
      type: 'progress',
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    writeLog(`update-downloaded: ${info.version}`)
    sendUpdateStatus({ type: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    writeLog(`ERROR: ${err.message}\nStack: ${err.stack}`)
    sendUpdateStatus({ type: 'error', message: err.message })
  })

  if (app.isPackaged) {
    setTimeout(() => {
      writeLog('auto-check on startup...')
      autoUpdater.checkForUpdates().catch(e => {
        writeLog(`auto-check failed: ${e.message}`)
      })
    }, 4000)
  }
}

function sendUpdateStatus(data) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('update-status', data)
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
const SETTINGS_DEFAULTS = { startup: false, tray: true, notify: true, spikeMs: 150, lossPct: 5 }

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8')
    return Object.assign({}, SETTINGS_DEFAULTS, JSON.parse(raw))
  } catch(e) {
    return Object.assign({}, SETTINGS_DEFAULTS)
  }
}

function saveSettings(cfg) {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(cfg, null, 2), 'utf-8')
  } catch(e) {
    console.error('[settings] save error:', e.message)
  }
}

// ─── Backend ──────────────────────────────────────────────────────────────────
function startBackend() {
  const exe = app.isPackaged
    ? path.join(process.resourcesPath, 'wwm_service.exe')
    : null
  const cmd  = (exe && fs.existsSync(exe)) ? exe : 'python'
  const args = (exe && fs.existsSync(exe)) ? [] : [path.join(__dirname, 'wwm_service.py')]
  const cwd  = app.isPackaged ? process.resourcesPath : __dirname

  backend = spawn(cmd, args, { stdio: ['ignore','pipe','pipe'], windowsHide: true, cwd })
  backend.stdout.on('data', d => console.log('[backend]', d.toString().trim()))
  backend.stderr.on('data', d => console.error('[backend ERR]', d.toString().trim()))
  backend.on('error',  e    => console.error('[backend] spawn error:', e.message))
  backend.on('close',  code => console.log('[backend] exited', code))
}

// ─── Kill backend ─────────────────────────────────────────────────────────────
function killBackend() {
  if (!backend) return
  try {
    if (process.platform === 'win32') {
      const { execSync } = require('child_process')
      try { execSync(`taskkill /PID ${backend.pid} /T /F`, { windowsHide: true }) } catch(e) {}
    }
    backend.kill('SIGTERM')
  } catch(e) {}
  backend = null
}

// ─── Overlay ──────────────────────────────────────────────────────────────────
function createOverlay() {
  if (overlay && !overlay.isDestroyed()) {
    overlay.show()
    overlay.focus()
    return
  }
  overlay = new BrowserWindow({
    width: 160, height: 50,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  })
  overlay.loadFile(path.join(__dirname, 'src', 'overlay.html'))
  overlay.once('ready-to-show', () => overlay.show())
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.on('closed', () => { overlay = null })
}

function closeOverlay() {
  if (overlay && !overlay.isDestroyed()) {
    overlay.close()
    overlay = null
  }
}

// ─── Shape ────────────────────────────────────────────────────────────────────
function buildRoundedShape(w, h, r) {
  const rects = [
    { x: r, y: 0, width: w - 2*r, height: h },
    { x: 0, y: r, width: w,       height: h - 2*r },
  ]
  const steps = 20
  for (let i = 0; i < steps; i++) {
    const a1 = (i / steps) * (Math.PI / 2)
    const a2 = ((i+1) / steps) * (Math.PI / 2)
    const ox = r - Math.round(r * Math.cos(a1))
    const oy = r - Math.round(r * Math.sin(a2))
    const sw = r - ox
    if (sw < 1) continue
    rects.push({ x: ox,       y: oy,       width: sw, height: 1 })
    rects.push({ x: w-ox-sw,  y: oy,       width: sw, height: 1 })
    rects.push({ x: ox,       y: h-oy-1,   width: sw, height: 1 })
    rects.push({ x: w-ox-sw,  y: h-oy-1,   width: sw, height: 1 })
  }
  return rects
}

function applyRoundedShape() {
  if (!win) return
  if (win.isMaximized()) return
  try {
    const [w, h] = win.getSize()
    win.setShape(buildRoundedShape(w, h, 14))
  } catch(e) {}
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function getTrayIcon() {
  const base = app.isPackaged ? process.resourcesPath : __dirname
  const candidates = [
    path.join(base, 'assets', 'tray_icon.png'),
    path.join(base, 'assets', 'icon.png'),
    path.join(base, 'assets', 'icon.ico'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        let img = nativeImage.createFromPath(p)
        if (!img.isEmpty()) {
          img = img.resize({ width: 16, height: 16, quality: 'best' })
          return img
        }
      } catch(e) {}
    }
  }
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    buf[i*4+0]=255; buf[i*4+1]=255; buf[i*4+2]=255; buf[i*4+3]=255
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'WWM Monitor', enabled: false },
    { type: 'separator' },
    { label: 'Anzeigen',   click: () => { if (win) { win.show(); win.focus(); applyRoundedShape() } } },
    { label: 'Verstecken', click: () => { if (win) win.hide() } },
    { type: 'separator' },
    { label: 'Overlay anzeigen',  click: () => createOverlay() },
    { label: 'Overlay schließen', click: () => closeOverlay() },
    { type: 'separator' },
    { label: 'Beenden', click: () => {
        isQuitting = true
        killBackend()
        closeOverlay()
        if (tray) { try { tray.destroy(); tray = null } catch(e) {} }
        app.exit(0)
      }
    }
  ])
}

function createTray() {
  if (tray) return
  try {
    tray = new Tray(getTrayIcon())
    tray.setToolTip('WWM Monitor')
    tray.setContextMenu(buildTrayMenu())
    tray.on('double-click', () => {
      if (win) { win.show(); win.focus(); applyRoundedShape() }
    })
  } catch(e) {
    tray = null
  }
}

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const iconPath = path.join(app.isPackaged ? process.resourcesPath : __dirname, 'assets', 'icon.png')
  win = new BrowserWindow({
    width: 1220, height: 840,
    minWidth: 1000, minHeight: 680,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: false,
    shadow: false,
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      devTools: true,
    }
  })

  win.loadFile(path.join(__dirname, 'src', 'index.html'))
  win.webContents.openDevTools({ mode: 'detach' })

  win.once('ready-to-show', () => {
    const cfg = loadSettings()
    useTray = cfg.tray !== false
    createTray()
    win.show()
    initUpdater()
  })

  win.on('resize', applyRoundedShape)
  win.on('unmaximize', applyRoundedShape)

  win.on('close', (e) => {
    if (isQuitting) return
    if (useTray && tray) {
      e.preventDefault()
      win.hide()
    }
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startBackend()
  setTimeout(createWindow, 1800)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killBackend()
  closeOverlay()
  if (tray) { try { tray.destroy() } catch(e) {} }
  app.quit()
})

// ─── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.on('minimize', () => { if (win) win.minimize() })

ipcMain.on('close', () => {
  if (useTray && tray) {
    if (win) win.hide()
  } else {
    isQuitting = true
    killBackend()
    closeOverlay()
    if (tray) { try { tray.destroy(); tray = null } catch(e) {} }
    app.exit(0)
  }
})

ipcMain.on('set-tray', (_, enable) => {
  useTray = enable
})

ipcMain.on('set-startup', (_, enable) => {
  app.setLoginItemSettings({ openAtLogin: enable, path: app.getPath('exe') })
})

ipcMain.on('overlay-open',  () => createOverlay())
ipcMain.on('overlay-close', () => closeOverlay())

ipcMain.on('ping-data', (_, data) => {
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send('ping-update', data)
  }
})

ipcMain.handle('get-startup', () => {
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.handle('get-settings', () => {
  return loadSettings()
})

ipcMain.handle('save-settings', (_, cfg) => {
  saveSettings(cfg)
  useTray = cfg.tray !== false
  return true
})

// ─── Updater IPC ──────────────────────────────────────────────────────────────
ipcMain.on('update-install-now', () => {
  if (autoUpdater) {
    isQuitting = true
    autoUpdater.quitAndInstall(false, true)
  }
})

ipcMain.on('update-check-manual', () => {
  if (!autoUpdater) {
    sendUpdateStatus({ type: 'error', message: 'Updater nicht verfügbar' })
    return
  }
  if (!app.isPackaged) {
    sendUpdateStatus({ type: 'checking' })
    setTimeout(() => sendUpdateStatus({ type: 'not-available' }), 1200)
    return
  }
  writeLog('manual check triggered')
  autoUpdater.checkForUpdates().catch(e => {
    writeLog(`manual check failed: ${e.message}\n${e.stack}`)
    sendUpdateStatus({ type: 'error', message: e.message })
  })
})

// IPC: read updater log for display in UI
ipcMain.handle('get-updater-log', () => {
  try {
    const logPath = path.join(app.getPath('userData'), 'updater.log')
    return fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8') : 'Keine Log-Einträge.'
  } catch(e) {
    return 'Fehler beim Lesen des Logs: ' + e.message
  }
})
