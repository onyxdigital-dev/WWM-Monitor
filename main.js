const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, Notification } = require('electron')
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,Autofill')
const path = require('path')
const { spawn, execSync } = require('child_process')
const fs = require('fs')

let win = null
let tray = null
let backend = null
let overlay = null
let useTray = true
let isQuitting = false
let _lastRunning = null
let _autoPauseTimer = null

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
const SETTINGS_DEFAULTS = { startup: false, startMinimized: false, tray: true, spikeMs: 150, lossPct: 5, pingInterval: 2, warnMs: 80, critMs: 150, overlayHotkey: 'Alt+Shift+O', notificationsEnabled: true, notifSpike: true, notifDisconnect: true, notifReconnect: true, notifLoss: true, notifServerSwitch: true, notifSpikeCooldown: 30, notifLossCooldown: 30, notifLossThreshold: 5, spikeThreshold: 10, overlayOpacity: 100, overlayScale: 1.0, overlayTheme: 'green', autoPauseOverlay: true, historySize: 50, dataRetention: 30, discordWebhook: '', discordEnabled: false, discordSpike: true, discordDisconnect: true, discordReconnect: true, discordLoss: true, discordServerSwitch: true, discordSpikeCooldown: 60, discordLossCooldown: 60, discordLossThreshold: 5 }
let _settingsCache = null

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function loadSettings() {
  if (_settingsCache) return Object.assign({}, _settingsCache)
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8')
    _settingsCache = Object.assign({}, SETTINGS_DEFAULTS, JSON.parse(raw))
  } catch(e) {
    _settingsCache = Object.assign({}, SETTINGS_DEFAULTS)
  }
  return Object.assign({}, _settingsCache)
}

function saveSettings(cfg) {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(cfg, null, 2), 'utf-8')
    _settingsCache = Object.assign({}, cfg)
  } catch(e) {
    console.error('[settings] save error:', e.message)
  }
}

function registerOverlayHotkey(hotkey) {
  globalShortcut.unregisterAll()
  if (!hotkey) return
  // Reject non-ASCII or invalid keys — reset to default and bail
  if ([...hotkey].some(c => c.charCodeAt(0) > 127) || /BracketLeft|BracketRight|Semicolon|Quote|Backquote|Comma|Period|Slash|Backslash|Minus|Equal/.test(hotkey)) {
    console.error('[hotkey] invalid accelerator, resetting to default:', hotkey)
    const cfg = loadSettings()
    saveSettings({ ...cfg, overlayHotkey: SETTINGS_DEFAULTS.overlayHotkey })
    hotkey = SETTINGS_DEFAULTS.overlayHotkey
  }
  try {
    const ok = globalShortcut.register(hotkey, () => {
      if (overlay && !overlay.isDestroyed()) closeOverlay()
      else createOverlay()
    })
    if (!ok) console.error('[hotkey] registration failed (in use?):', hotkey)
  } catch(e) {
    console.error('[hotkey] failed to register:', hotkey, e.message)
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

// ─── Shutdown ─────────────────────────────────────────────────────────────────
function killBackend() {
  if (!backend) return
  try {
    if (process.platform === 'win32') {
      try { execSync(`taskkill /PID ${backend.pid} /T /F`, { windowsHide: true }) } catch(e) {}
    }
    backend.kill('SIGTERM')
  } catch(e) {}
  backend = null
}

function killBackendByName() {
  if (process.platform !== 'win32') return
  try {
    execSync('taskkill /IM wwm_service.exe /T /F', { windowsHide: true })
    writeLog('killBackendByName: wwm_service.exe terminated')
  } catch(e) {
    writeLog(`killBackendByName: ${e.message}`)
  }
}

function shutdown() {
  isQuitting = true
  killBackend()
  killBackendByName()
  closeOverlay()
  if (tray) { try { tray.destroy(); tray = null } catch(e) {} }
}

// ─── Overlay ──────────────────────────────────────────────────────────────────
function createOverlay() {
  if (overlay && !overlay.isDestroyed()) {
    overlay.show()
    overlay.focus()
    return
  }
  const cfg = loadSettings()
  overlay = new BrowserWindow({
    width: 310, height: 60,
    x: cfg.overlayX ?? undefined,
    y: cfg.overlayY ?? undefined,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  })
  overlay.loadFile(path.join(__dirname, 'src', 'overlay.html'))
  overlay.once('ready-to-show', () => {
    overlay.show()
    const startCfg = loadSettings()
    const scale = startCfg.overlayScale || 1.0
    overlay.setSize(Math.round(310 * scale), Math.round(60 * scale))
    overlay.webContents.send('overlay:config', {
      theme: startCfg.overlayTheme || 'green',
      scale,
    })
    overlay.setOpacity((startCfg.overlayOpacity ?? 100) / 100)
  })
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.on('moved', () => {
    const [x, y] = overlay.getPosition()
    const current = loadSettings()
    saveSettings({ ...current, overlayX: x, overlayY: y })
  })
  overlay.on('closed', () => { overlay = null })
}

function closeOverlay() {
  if (overlay && !overlay.isDestroyed()) {
    overlay.close()
    overlay = null
  }
}

function applyRoundedShape() {} // no-op: native roundedCorners handles this

// ─── Tray icon color by ping status ──────────────────────────────────────────
const _STATUS_COLORS = {
  OK:      [34, 197, 94],
  WARN:    [245, 158, 11],
  CRIT:    [239, 68, 68],
  TIMEOUT: [239, 68, 68],
  waiting: [120, 120, 120],
}

function createStatusIcon(status) {
  const size = 16
  const [r, g, b] = _STATUS_COLORS[status] || _STATUS_COLORS.waiting
  const buf = Buffer.alloc(size * size * 4)
  const cx = 7.5, cy = 7.5, radius = 5.5
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy
      if (dx*dx + dy*dy <= radius*radius) {
        const i = (y * size + x) * 4
        buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = 255
      }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

let _lastTrayStatus = null
function updateTrayIcon(status) {
  if (!tray || status === _lastTrayStatus) return
  _lastTrayStatus = status
  try { tray.setImage(createStatusIcon(status)) } catch(e) {}
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
    { label: 'Show',   click: () => { if (win) { win.show(); win.focus(); applyRoundedShape() } } },
    { label: 'Hide', click: () => { if (win) win.hide() } },
    { type: 'separator' },
    { label: 'Show Overlay',  click: () => createOverlay() },
    { label: 'Close Overlay', click: () => closeOverlay() },
    { type: 'separator' },
    { label: 'Quit', click: () => { shutdown(); app.exit(0) } }
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
    roundedCorners: true,
    shadow: false,
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: false,
      partition: 'nopersist',
    }
  })

  win.loadFile(path.join(__dirname, 'src', 'index.html'))

  win.once('ready-to-show', () => {
    const cfg = loadSettings()
    useTray = cfg.tray !== false
    createTray()
    registerOverlayHotkey(cfg.overlayHotkey || SETTINGS_DEFAULTS.overlayHotkey)
    if (!cfg.startMinimized) win.show()
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
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  killBackend()
  killBackendByName()
})

app.on('window-all-closed', () => {
  killBackend()
  killBackendByName()
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
    shutdown()
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
ipcMain.on('set-overlay-config', (_, cfg) => {
  if (!overlay || overlay.isDestroyed()) return
  if (cfg.opacity != null) overlay.setOpacity(cfg.opacity / 100)
  if (cfg.scale   != null) overlay.setSize(Math.round(310 * cfg.scale), Math.round(60 * cfg.scale))
  overlay.webContents.send('overlay:config', cfg)
  const current = loadSettings()
  const updates = {}
  if (cfg.opacity != null) updates.overlayOpacity = cfg.opacity
  if (cfg.scale   != null) updates.overlayScale   = cfg.scale
  if (cfg.theme   != null) updates.overlayTheme   = cfg.theme
  saveSettings({ ...current, ...updates })
})
ipcMain.on('set-overlay-hotkey', (_, hotkey) => {
  const cfg = loadSettings()
  saveSettings({ ...cfg, overlayHotkey: hotkey })
  registerOverlayHotkey(hotkey)
})

ipcMain.on('ping-data', (_, data) => {
  updateTrayIcon(data.status || 'waiting')
  if (win && !win.isDestroyed()) {
    const label = data.ms != null ? `${data.ms} ms` : 'timeout'
    win.setTitle(`WWM Monitor — ${label}`)
  }
  if (tray && !tray.isDestroyed()) {
    if (data.running === false) {
      tray.setToolTip('WWM Monitor · waiting')
    } else if (data.ms != null) {
      tray.setToolTip(`WWM Monitor · ${data.ms} ms`)
    } else {
      tray.setToolTip('WWM Monitor · timeout')
    }
  }
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send('ping-update', data)
  }
  // Auto-pause overlay
  const autoCfg = loadSettings()
  if (autoCfg.autoPauseOverlay) {
    const running = data.running !== false && data.status !== 'waiting'
    if (!running && _lastRunning === true) {
      if (!_autoPauseTimer) {
        _autoPauseTimer = setTimeout(() => {
          _autoPauseTimer = null
          if (overlay && !overlay.isDestroyed()) overlay.hide()
        }, 10000)
      }
    } else if (running && _lastRunning === false) {
      if (_autoPauseTimer) { clearTimeout(_autoPauseTimer); _autoPauseTimer = null }
      if (overlay && !overlay.isDestroyed()) overlay.show()
    }
    _lastRunning = running
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

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// ─── Updater IPC ──────────────────────────────────────────────────────────────
ipcMain.on('update-install-now', () => {
  if (!autoUpdater) return
  writeLog('update-install-now: killing backend before install...')
  shutdown()
  setTimeout(() => {
    autoUpdater.quitAndInstall(false, true)
  }, 800)
})

ipcMain.on('update-check-manual', () => {
  if (!autoUpdater) {
    sendUpdateStatus({ type: 'error', message: 'Updater not available' })
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

ipcMain.on('notify', (_, title, body) => {
  if (!Notification.isSupported()) return
  try {
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'icon.png')
      : path.join(__dirname, 'assets', 'icon.png')
    new Notification({ title, body, icon: iconPath }).show()
  } catch (e) {
    console.warn('[notify] failed to show notification:', e.message)
  }
})

ipcMain.handle('get-updater-log', () => {
  try {
    const logPath = path.join(app.getPath('userData'), 'updater.log')
    return fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8') : 'No log entries.'
  } catch(e) {
    return 'Error reading log: ' + e.message
  }
})
