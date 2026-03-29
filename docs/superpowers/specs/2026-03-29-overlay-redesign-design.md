# Overlay Redesign — Design Spec

**Date:** 2026-03-29
**Status:** Approved

## Goal

Expand the always-on-top overlay from a minimal ping pill into a wider horizontal widget that shows jitter, loss, and a sparkline of recent pings — all at a glance while gaming.

## Visual Design

Layout: wide horizontal pill (~310 × 60 px), same dark glassmorphism style as the current overlay.

```
┌─┬──────────────┬────┬──┬────────┬──┬─────┬──┬──────────────┬──┐
│▌│ PING         │ 18 │ms│ JITTER │  │LOSS │  │ ▂▃▂▁▃▂▃▂▃▂  │✕ │
│▌│ Frankfurt,DE │    │  │   3    │  │  0% │  │ (sparkline)  │  │
└─┴──────────────┴────┴──┴────────┴──┴─────┴──┴──────────────┴──┘
```

**Accent bar + ping color thresholds** (unchanged):
- Green (`#22c55e`): ping < 80 ms
- Amber (`#f59e0b`): ping 80–149 ms
- Red (`#ef4444`): ping ≥ 150 ms or OUT (disconnected)

**Jitter color:** amber if > 10 ms, white otherwise.

**Loss color:** green at 0%, amber if > 0%, red if > 5%.

**Sparkline:** 10 div bars. Bar height = `ms / max(history)`. Each bar is individually color-coded to its own ping threshold. Null entries (timeouts) render as a gray bar at minimum height. When fewer than 10 history entries exist (e.g. on first connect), unused bars are hidden (`visibility: hidden`).

**City subtitle:** `geo_city + ', ' + geo_country` (e.g. `Frankfurt, DE`). Falls back to `'—'` when geo data is unavailable.

## Files Changed

### 1. `src/index.html` — IPC payload (line ~692)

Expand `sendPingData` call:

```js
window.electronAPI.sendPingData({
  ms,
  status: d.status,
  jitter,
  loss,
  router_ms: d.router_ms ?? null,
  geo_city: d.geo_city || '',
  geo_country: d.geo_country || '',
  history: (d.history || []).slice(-10)   // array of ms|null, last 10 pings
});
```

### 2. `main.js` — overlay window size (`createOverlay()`)

```js
// Before
width: 160, height: 68,

// After
width: 310, height: 60,
```

### 3. `src/overlay.html` — full layout + JS handler replacement

**HTML structure:**
```
#wrap
  #accent          (left color bar)
  #info-col
    #label         ("PING")
    #city          (geo_city + ', ' + geo_country)
  #ping            (big number)
  #unit            ("ms")
  .divider
  #jitter-col
    #jitter-val
    .metric-label  ("JITTER")
  .divider
  #loss-col
    #loss-val
    .metric-label  ("LOSS")
  .divider
  #spark           (10 × .spark-bar divs)
  #close
```

**JS update handler changes:**
- Read `data.geo_city`, `data.geo_country` → update `#city`
- Read `data.jitter` → update `#jitter-val`, apply amber color if > 10
- Read `data.loss` → update `#loss-val`, apply green/amber/red
- Read `data.history` (array of ms|null, up to 10) → update 10 `.spark-bar` divs: height proportional to max in window, color per threshold, gray for null
- Accent bar + ping color logic: unchanged

### 4. `overlay-preload.js` — no changes

Data passes through `ipcRenderer.on('ping-update', ...)` unchanged.

### 5. `wwm_service.py` — no changes

`history`, `router_ms`, `geo_city`, `geo_country` are already in the broadcast payload.

## Out of Scope

- Router ms column (received in payload but not displayed — keeping the layout clean)
- Compact/expanded toggle
- Configurable columns
