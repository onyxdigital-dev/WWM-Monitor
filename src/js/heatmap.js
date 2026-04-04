// heatmap.js — 24×7 ping heatmap canvas

let heatmapData = []
let _heatmapInited = false

const DOW_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
// SQLite %w: 0=Sun, 1=Mon...6=Sat → reorder to Mon-Sun for display
// DOW_ORDER[displayRow] = sqliteDow
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]

function drawHeatmap(data) {
  heatmapData = data
  const canvas = document.getElementById('heatmap-canvas')
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const COLS = 24
  const ROWS = 7
  const CELL_W = 28
  const CELL_H = 24
  const PAD_LEFT = 28
  const PAD_TOP = 20
  const W = PAD_LEFT + COLS * CELL_W + 2
  const H = PAD_TOP  + ROWS * CELL_H + 2

  canvas.width  = W * dpr
  canvas.height = H * dpr
  canvas.style.width  = W + 'px'
  canvas.style.height = H + 'px'

  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, W, H)

  // Build lookup map: "dow_hour" -> row
  const map = {}
  data.forEach(r => { map[r.dow + '_' + r.hour] = r })

  const warn = (typeof cfg !== 'undefined' && cfg.warnMs) || 80
  const crit = (typeof cfg !== 'undefined' && cfg.critMs) || 150

  // Hour labels
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.font = '8px Segoe UI, system-ui, sans-serif'
  ctx.textAlign = 'center'
  for (let h = 0; h < 24; h++) {
    if (h % 3 === 0) {
      ctx.fillText(h, PAD_LEFT + h * CELL_W + CELL_W / 2, PAD_TOP - 6)
    }
  }

  // Day labels
  ctx.textAlign = 'right'
  for (let row = 0; row < ROWS; row++) {
    ctx.fillText(DOW_LABELS[row], PAD_LEFT - 4, PAD_TOP + row * CELL_H + CELL_H / 2 + 3)
  }

  // Cells
  for (let row = 0; row < ROWS; row++) {
    const sqlDow = DOW_ORDER[row]
    for (let h = 0; h < 24; h++) {
      const key = sqlDow + '_' + h
      const cell = map[key]
      const x = PAD_LEFT + h * CELL_W
      const y = PAD_TOP  + row * CELL_H

      if (!cell || cell.avg_ms == null) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)'
      } else {
        ctx.fillStyle = heatmapColor(cell.avg_ms, warn, crit)
      }

      ctx.beginPath()
      roundRect(ctx, x + 1, y + 1, CELL_W - 2, CELL_H - 2, 3)
      ctx.fill()
    }
  }
}

function heatmapColor(ms, warn, crit) {
  if (ms >= crit) return '#ef4444'
  if (ms >= warn) return lerpColor('#f59e0b', '#ef4444', (ms - warn) / (crit - warn))
  return lerpColor('#22c55e', '#f59e0b', ms / warn)
}

function lerpColor(a, b, t) {
  const ar = parseInt(a.slice(1,3),16), ag = parseInt(a.slice(3,5),16), ab = parseInt(a.slice(5,7),16)
  const br = parseInt(b.slice(1,3),16), bg = parseInt(b.slice(3,5),16), bb = parseInt(b.slice(5,7),16)
  return 'rgb(' + Math.round(ar+(br-ar)*t) + ',' + Math.round(ag+(bg-ag)*t) + ',' + Math.round(ab+(bb-ab)*t) + ')'
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

let _heatmapTooltip = null

function initHeatmap() {
  if (_heatmapInited) return
  _heatmapInited = true

  const canvas = document.getElementById('heatmap-canvas')
  if (!canvas) return

  _heatmapTooltip = document.createElement('div')
  _heatmapTooltip.id = 'heatmap-tooltip'
  _heatmapTooltip.style.cssText = 'position:fixed;display:none;background:rgba(0,0,0,.85);color:white;font-size:11px;padding:5px 9px;border-radius:6px;pointer-events:none;z-index:9999;white-space:nowrap;border:1px solid rgba(255,255,255,.12);'
  document.body.appendChild(_heatmapTooltip)

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const PAD_LEFT = 28, PAD_TOP = 20, CELL_W = 28, CELL_H = 24
    const col = Math.floor((mx - PAD_LEFT) / CELL_W)
    const row = Math.floor((my - PAD_TOP)  / CELL_H)
    if (col < 0 || col >= 24 || row < 0 || row >= 7) {
      _heatmapTooltip.style.display = 'none'
      return
    }
    const sqlDow = DOW_ORDER[row]
    const cell = heatmapData.find(r => r.dow === sqlDow && r.hour === col)
    const dayLabel = DOW_LABELS[row]
    const hourLabel = String(col).padStart(2,'0') + ':00'
    const text = (!cell || cell.avg_ms == null)
      ? dayLabel + ' ' + hourLabel + ' · keine Daten'
      : dayLabel + ' ' + hourLabel + ' · Ø ' + Math.round(cell.avg_ms) + ' ms (' + cell.total + ' Pings)'
    _heatmapTooltip.textContent = text
    _heatmapTooltip.style.display = 'block'
    _heatmapTooltip.style.left = (e.clientX + 12) + 'px'
    _heatmapTooltip.style.top  = (e.clientY - 8)  + 'px'
  })

  canvas.addEventListener('mouseleave', () => {
    if (_heatmapTooltip) _heatmapTooltip.style.display = 'none'
  })
}
