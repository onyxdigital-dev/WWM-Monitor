const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs')

let win = null
let tray = null
let backend = null
let useTray = true
let isQuitting = false

// ─── Backend ────────────────────────────────────────────────────────────────
function startBackend() {
  const exe = app.isPackaged
    ? path.join(process.resourcesPath, 'backend.exe')
    : null
  const cmd  = (exe && fs.existsSync(exe)) ? exe : 'python'
  const args = (exe && fs.existsSync(exe)) ? [] : [path.join(__dirname, 'backend.py')]
  const cwd  = app.isPackaged ? process.resourcesPath : __dirname

  backend = spawn(cmd, args, { stdio: ['ignore','pipe','pipe'], windowsHide: true, cwd })
  backend.stdout.on('data', d => console.log('[backend]', d.toString().trim()))
  backend.stderr.on('data', d => console.error('[backend ERR]', d.toString().trim()))
  backend.on('error',  e    => console.error('[backend] spawn error:', e.message))
  backend.on('close',  code => console.log('[backend] exited', code))
}

// ─── Kill backend ────────────────────────────────────────────────────────────
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

// ─── Shape ──────────────────────────────────────────────────────────────────
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
  try {
    const [w, h] = win.getSize()
    win.setShape(buildRoundedShape(w, h, 14))
  } catch(e) {}
}

// ─── Tray ────────────────────────────────────────────────────────────────────
function getTrayIcon() {
  const base = app.isPackaged ? process.resourcesPath : __dirname
  const candidates = [
    path.join(base, 'assets', 'icon.png'),
    path.join(base, 'assets', 'icon.ico'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log('[tray] trying icon:', p)
      try {
        let img = nativeImage.createFromPath(p)
        if (!img.isEmpty()) {
          img = img.resize({ width: 16, height: 16, quality: 'best' })
          console.log('[tray] icon loaded, size:', img.getSize())
          return img
        } else {
          console.warn('[tray] icon isEmpty:', p)
        }
      } catch(e) {
        console.error('[tray] failed to load icon:', e.message)
      }
    } else {
      console.warn('[tray] not found:', p)
    }
  }
  // Fallback: generate a simple white 16x16 icon
  console.warn('[tray] using generated fallback icon')
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    buf[i * 4 + 0] = 255
    buf[i * 4 + 1] = 255
    buf[i * 4 + 2] = 255
    buf[i * 4 + 3] = 255
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
    { label: 'Beenden', click: () => {
        isQuitting = true
        killBackend()
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
    console.log('[tray] created successfully')
  } catch(e) {
    console.error('[tray] error creating tray:', e.message)
    tray = null
  }
}

// ─── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1220, height: 840,
    minWidth: 1000, minHeight: 680,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: false,
    shadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    }
  })

  win.loadFile(path.join(__dirname, 'src', 'index.html'))

  win.once('ready-to-show', () => {
    createTray()
    applyRoundedShape()
    win.show()
  })

  win.on('resize', applyRoundedShape)

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
  if (tray) { try { tray.destroy() } catch(e) {} }
  app.quit()
})

// ─── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.on('minimize', () => { if (win) win.minimize() })

ipcMain.on('close', () => {
  if (useTray && tray) {
    if (win) win.hide()
  } else {
    isQuitting = true
    killBackend()
    if (tray) { try { tray.destroy(); tray = null } catch(e) {} }
    app.exit(0)
  }
})

ipcMain.on('set-tray', (_, enable) => {
  useTray = enable
  console.log('[tray] minimize-to-tray:', enable)
})

ipcMain.on('set-startup', (_, enable) => {
  app.setLoginItemSettings({ openAtLogin: enable, path: app.getPath('exe') })
})

ipcMain.handle('get-startup', () => {
  return app.getLoginItemSettings().openAtLogin
})
