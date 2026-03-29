# Overlay Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the always-on-top overlay from a minimal ping pill into a wide horizontal widget showing jitter, loss, sparkline, and server city — with per-column visibility toggles in Settings.

**Architecture:** Three files change. `src/index.html` expands the IPC payload sent to the overlay and adds an Overlay section to the Settings tab. `main.js` widens the overlay `BrowserWindow`. `src/overlay.html` is fully replaced with the new layout and update logic.

**Tech Stack:** Vanilla JS, Electron IPC, HTML/CSS (no build step, no frameworks)

---

## File Map

| File | Change |
|------|--------|
| `src/index.html` | Expand `sendPingData` payload (line 692–693); add Overlay settings card (after line 423); add defaults + `applySettingsToUI` wiring (lines 1154, 1156–1162) |
| `main.js` | Change overlay `BrowserWindow` width/height (line 170) |
| `src/overlay.html` | Full replacement — new layout, CSS, and JS update handler |

---

## Task 1: Expand `sendPingData` payload + add Settings overlay section

**Files:**
- Modify: `src/index.html:692-693` (IPC payload)
- Modify: `src/index.html:1154` (cfg defaults)
- Modify: `src/index.html:1156-1162` (applySettingsToUI)
- Modify: `src/index.html:423-424` (Settings HTML — insert Overlay card)

- [ ] **Step 1: Update the `sendPingData` call**

In `src/index.html`, replace lines 692–693:

```js
// Before
  if (window.electronAPI && window.electronAPI.sendPingData)
    window.electronAPI.sendPingData({ ms, status: d.status, jitter, loss });

// After
  if (window.electronAPI && window.electronAPI.sendPingData)
    window.electronAPI.sendPingData({
      ms, status: d.status, jitter, loss,
      router_ms: d.router_ms ?? null,
      geo_city: d.geo_city || '',
      geo_country: d.geo_country || '',
      history: (d.history || []).slice(-10),
      overlayColumns: {
        jitter:    cfg.overlayJitter    !== false,
        loss:      cfg.overlayLoss      !== false,
        sparkline: cfg.overlaySparkline !== false,
      }
    });
```

- [ ] **Step 2: Add overlay column defaults to `cfg`**

In `src/index.html`, replace line 1154:

```js
// Before
let cfg={startup:false,tray:true,spikeMs:150,lossPct:5,pingInterval:2,warnMs:80,critMs:150};

// After
let cfg={startup:false,tray:true,spikeMs:150,lossPct:5,pingInterval:2,warnMs:80,critMs:150,overlayJitter:true,overlayLoss:true,overlaySparkline:true};
```

- [ ] **Step 3: Wire overlay column settings into `applySettingsToUI`**

In `src/index.html`, replace lines 1156–1162:

```js
// Before
function applySettingsToUI(){
  document.getElementById('s-startup').checked=cfg.startup||false;
  document.getElementById('s-tray').checked=cfg.tray!==false;
  setInterval_(cfg.pingInterval||2, true);
  setWarn_(cfg.warnMs||80, true);
  setCrit_(cfg.critMs||150, true);
}

// After
function applySettingsToUI(){
  document.getElementById('s-startup').checked=cfg.startup||false;
  document.getElementById('s-tray').checked=cfg.tray!==false;
  setInterval_(cfg.pingInterval||2, true);
  setWarn_(cfg.warnMs||80, true);
  setCrit_(cfg.critMs||150, true);
  document.getElementById('s-overlay-jitter').checked=cfg.overlayJitter!==false;
  document.getElementById('s-overlay-loss').checked=cfg.overlayLoss!==false;
  document.getElementById('s-overlay-sparkline').checked=cfg.overlaySparkline!==false;
}
```

- [ ] **Step 4: Insert the Overlay settings card into the Settings tab HTML**

In `src/index.html`, find the closing of the MONITORING card and the start of the ABOUT card (around line 422–424). Insert the new Overlay card between them:

```html
<!-- Find this exact text: -->
          </div>
        </div>
        <div class="card" style="padding:22px 24px;">
          <div style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.1em;margin-bottom:16px;">ABOUT</div>

<!-- Replace with: -->
          </div>
        </div>
        <div class="card" style="padding:22px 24px;">
          <div style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.1em;margin-bottom:16px;">OVERLAY</div>
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div><div style="font-size:13px;color:var(--text);">Show Jitter</div><div style="font-size:11px;color:var(--muted);margin-top:2px;">Display jitter column in overlay</div></div>
              <label class="toggle no-drag"><input type="checkbox" id="s-overlay-jitter" checked onchange="saveSetting('overlayJitter',this.checked)"><span class="toggle-track"></span></label>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div><div style="font-size:13px;color:var(--text);">Show Loss</div><div style="font-size:11px;color:var(--muted);margin-top:2px;">Display packet loss column in overlay</div></div>
              <label class="toggle no-drag"><input type="checkbox" id="s-overlay-loss" checked onchange="saveSetting('overlayLoss',this.checked)"><span class="toggle-track"></span></label>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div><div style="font-size:13px;color:var(--text);">Show Sparkline</div><div style="font-size:11px;color:var(--muted);margin-top:2px;">Display recent ping history in overlay</div></div>
              <label class="toggle no-drag"><input type="checkbox" id="s-overlay-sparkline" checked onchange="saveSetting('overlaySparkline',this.checked)"><span class="toggle-track"></span></label>
            </div>
          </div>
        </div>
        <div class="card" style="padding:22px 24px;">
          <div style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.1em;margin-bottom:16px;">ABOUT</div>
```

- [ ] **Step 5: Verify in DevTools**

Launch the app (`npm start`). Open DevTools (`Ctrl+Shift+I`). Go to the Settings tab — confirm the OVERLAY section appears with three toggles, all checked.

In the Console, paste this to inspect the next outgoing ping payload:

```js
const _orig = window.electronAPI.sendPingData;
window.electronAPI.sendPingData = (d) => { console.log('overlay payload', d); _orig(d); };
```

Wait 2 seconds for the next ping. Confirm the logged object contains `geo_city`, `geo_country`, `history` (array), and `overlayColumns: { jitter: true, loss: true, sparkline: true }`. Restore with a page reload.

- [ ] **Step 6: Commit**

```bash
git add src/index.html
git commit -m "feat: expand overlay IPC payload + add overlay column settings"
```

---

## Task 2: Widen the overlay `BrowserWindow`

**Files:**
- Modify: `main.js:170`

- [ ] **Step 1: Update window dimensions**

In `main.js`, replace line 170:

```js
// Before
    width: 160, height: 68,

// After
    width: 310, height: 60,
```

- [ ] **Step 2: Commit**

```bash
git add main.js
git commit -m "feat: widen overlay window to 310x60 for new layout"
```

---

## Task 3: Replace `overlay.html` with new layout

**Files:**
- Modify: `src/overlay.html` (full replacement)

- [ ] **Step 1: Replace the entire file**

Write this as the new `src/overlay.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body {
  width:100%; height:100%;
  background:transparent !important;
  overflow:hidden;
  -webkit-app-region:drag;
  user-select:none;
  font-family:'Segoe UI',system-ui,sans-serif;
}
#wrap {
  width:100%; height:100%;
  background:rgba(8,8,8,0.78);
  backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
  border-radius:12px;
  border:1px solid rgba(255,255,255,0.10);
  box-shadow:0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07);
  display:flex; align-items:center; gap:10px;
  padding:0 14px;
  position:relative;
  overflow:hidden;
}
#accent {
  position:absolute; left:0; top:0; bottom:0; width:3px;
  border-radius:12px 0 0 12px;
  background:#22c55e;
  box-shadow:0 0 10px rgba(34,197,94,0.7);
  transition:background .3s, box-shadow .3s;
}
#info-col { display:flex; flex-direction:column; gap:3px; min-width:72px; }
#label { font-size:8px; font-weight:700; letter-spacing:.09em; color:rgba(255,255,255,.35); line-height:1; }
#city  { font-size:8px; font-weight:600; color:rgba(255,255,255,.28); line-height:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80px; }
#ping  { font-size:26px; font-weight:800; line-height:1; color:white; transition:color .3s, text-shadow .3s; min-width:46px; text-align:right; }
#unit  { font-size:10px; color:rgba(255,255,255,.35); font-weight:700; align-self:flex-end; padding-bottom:3px; }
.divider { width:1px; background:rgba(255,255,255,0.08); align-self:stretch; margin:10px 0; flex-shrink:0; }
.metric-col { display:flex; flex-direction:column; align-items:center; gap:2px; }
.metric-val { font-size:13px; font-weight:800; color:rgba(255,255,255,0.8); line-height:1; transition:color .3s; }
.metric-label { font-size:7px; font-weight:700; letter-spacing:.08em; color:rgba(255,255,255,.28); }
#spark { display:flex; align-items:flex-end; gap:2px; height:22px; }
.spark-bar { width:3px; border-radius:2px 2px 0 0; flex-shrink:0; transition:height .2s, background .2s; }
#close {
  position:absolute; top:5px; right:7px;
  font-size:10px; color:rgba(255,255,255,.25);
  cursor:pointer; -webkit-app-region:no-drag;
  line-height:1; transition:color .2s;
}
#close:hover { color:rgba(239,68,68,.8); }
</style>
</head>
<body>
<div id="wrap">
  <div id="accent"></div>
  <div id="info-col">
    <div id="label">PING</div>
    <div id="city">—</div>
  </div>
  <div id="ping">--</div>
  <div id="unit">ms</div>
  <div class="divider" id="d-jitter"></div>
  <div class="metric-col" id="jitter-col">
    <div class="metric-val" id="jitter-val">—</div>
    <div class="metric-label">JITTER</div>
  </div>
  <div class="divider" id="d-loss"></div>
  <div class="metric-col" id="loss-col">
    <div class="metric-val" id="loss-val">—</div>
    <div class="metric-label">LOSS</div>
  </div>
  <div class="divider" id="d-spark"></div>
  <div id="spark">
    <div class="spark-bar" id="sb0"></div>
    <div class="spark-bar" id="sb1"></div>
    <div class="spark-bar" id="sb2"></div>
    <div class="spark-bar" id="sb3"></div>
    <div class="spark-bar" id="sb4"></div>
    <div class="spark-bar" id="sb5"></div>
    <div class="spark-bar" id="sb6"></div>
    <div class="spark-bar" id="sb7"></div>
    <div class="spark-bar" id="sb8"></div>
    <div class="spark-bar" id="sb9"></div>
  </div>
  <div id="close" onclick="closeOverlay()">✕</div>
</div>
<script>
function closeOverlay() {
  window.overlayAPI.closeOverlay();
}

function pingColor(ms) {
  if (ms >= 150) return '#ef4444';
  if (ms >= 80)  return '#f59e0b';
  return '#22c55e';
}

function setVisible(id, visible) {
  document.getElementById(id).style.display = visible !== false ? '' : 'none';
}

window.overlayAPI.onPingUpdate((data) => {
  const ping   = document.getElementById('ping');
  const accent = document.getElementById('accent');
  const unit   = document.getElementById('unit');
  const city   = document.getElementById('city');

  // City subtitle
  const c = data.geo_city, co = data.geo_country;
  city.textContent = (c || co) ? [c, co].filter(Boolean).join(', ') : '—';

  // Ping number + accent bar
  if (data.ms === null || data.ms === undefined) {
    ping.textContent = 'OUT';
    ping.style.color = '#ef4444';
    ping.style.textShadow = '0 0 20px rgba(239,68,68,.6)';
    accent.style.background = '#ef4444';
    accent.style.boxShadow = '0 0 10px rgba(239,68,68,.7)';
    unit.style.display = 'none';
  } else {
    const col = pingColor(data.ms);
    ping.textContent = data.ms;
    ping.style.color = data.ms < 80 ? 'white' : col;
    ping.style.textShadow = data.ms < 80 ? 'none' : `0 0 20px ${col}99`;
    accent.style.background = col;
    accent.style.boxShadow = `0 0 10px ${col}b3`;
    unit.style.display = '';
  }

  // Jitter column
  const jitter = data.jitter;
  const jitterVal = document.getElementById('jitter-val');
  jitterVal.textContent = (jitter != null && jitter > 0) ? jitter : '—';
  jitterVal.style.color = (jitter > 10) ? '#f59e0b' : 'rgba(255,255,255,0.8)';

  // Loss column
  const loss = data.loss;
  const lossVal = document.getElementById('loss-val');
  lossVal.textContent = (loss != null) ? loss + '%' : '—';
  lossVal.style.color = loss > 5 ? '#ef4444' : loss > 0 ? '#f59e0b' : '#22c55e';

  // Sparkline
  const hist = data.history || [];
  const valid = hist.filter(v => v != null);
  const maxMs = valid.length ? Math.max(...valid) : 1;
  for (let i = 0; i < 10; i++) {
    const bar = document.getElementById('sb' + i);
    if (i >= hist.length) {
      bar.style.visibility = 'hidden';
      continue;
    }
    bar.style.visibility = '';
    const v = hist[i];
    if (v === null) {
      bar.style.height = '15%';
      bar.style.background = 'rgba(255,255,255,0.2)';
    } else {
      bar.style.height = Math.max(15, Math.round(v / maxMs * 100)) + '%';
      bar.style.background = pingColor(v);
    }
  }

  // Column visibility
  const cols = data.overlayColumns || {};
  setVisible('jitter-col', cols.jitter);
  setVisible('d-jitter',   cols.jitter);
  setVisible('loss-col',   cols.loss);
  setVisible('d-loss',     cols.loss);
  setVisible('spark',      cols.sparkline);
  setVisible('d-spark',    cols.sparkline);
});
</script>
</body>
</html>
```

- [ ] **Step 2: Manually verify the overlay**

Launch the app (`npm start`). Open the overlay via the toggle button on the Live tab.

Check each state:
- **Normal ping**: accent bar green, city name shown, jitter + loss + sparkline visible
- **Disable Jitter in Settings**: jitter column and its divider disappear immediately on next ping update
- **Disable Loss in Settings**: loss column and its divider disappear
- **Disable Sparkline**: sparkline and its divider disappear
- **Simulate timeout**: set `data.ms = null` — ping shows `OUT` in red, all columns remain as configured

- [ ] **Step 3: Commit**

```bash
git add src/overlay.html
git commit -m "feat: redesign overlay with jitter/loss/sparkline columns and city name"
```
