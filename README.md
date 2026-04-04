<div align="center">

<img src="assets/icon.png" width="100" height="100" style="border-radius:20px" />

# WWM Monitor

**Real-time network monitor for Where Winds Meet**  
Live ping, jitter, packet loss, spike detection, server tracking & geo mapping — all in one overlay app.

[![Latest Release](https://img.shields.io/github/v/release/onyxdigital-dev/WWM-Monitor?style=flat-square&color=22c55e&label=Download)](https://github.com/onyxdigital-dev/WWM-Monitor/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue?style=flat-square)]()
[![License](https://img.shields.io/badge/license-MIT-white?style=flat-square)](LICENSE)

</div>

---

## Download & Install

1. Go to [**Releases**](https://github.com/onyxdigital-dev/WWM-Monitor/releases/latest)
2. Download `WWM-Monitor-Setup-x.x.x.exe`
3. Run the installer — done. No Python or Node.js required.

> **Windows SmartScreen** may warn you on first launch. Click **"More info" → "Run anyway"** — the app is safe.

---

## Features

### Live Tab
| Feature | Details |
|---|---|
| **Live Ping** | Real-time ms display, color-coded green / yellow / red |
| **Ping & Jitter Graph** | Last 50 pings visualized with spike markers |
| **Packet Loss** | Sent / Received / Lost / Loss % counters |
| **Router & DNS Ping** | Side-by-side ICMP latency for quick local diagnostics |
| **Server Map** | Interactive world map showing your current game server location |
| **Spike Alerts** | Desktop notification when ping exceeds your threshold |

### Dashboard Tab
| Feature | Details |
|---|---|
| **Session Quality Score** | A–F grade derived from ping, jitter, and packet loss |
| **Hourly Charts** | 24-hour ping and jitter trend over the day |
| **Session History** | All past sessions with quality grade, avg ping, and duration |
| **Server Switch Log** | Every time WWM moves you to a new server, logged with timestamps |
| **CSV Export** | Download your full ping history as a spreadsheet |

### Overlay
| Feature | Details |
|---|---|
| **In-Game Overlay** | Minimal always-on-top window showing live ping while you play |
| **Configurable Hotkey** | Toggle overlay visibility with a custom keyboard shortcut |
| **Customizable Columns** | Choose which metrics appear (ping, jitter, loss, sparkline) |

---

## How It Works

WWM Monitor detects the active **Where Winds Meet** process, reads the live game server IP from your TCP connections, and pings it every 2 seconds. No configuration needed — just launch both apps.

```
Launch WWM Monitor → Start Where Winds Meet → Done
```

The app sits in your **system tray** and keeps running in the background. It reconnects automatically when you start a new session or switch servers.

---

## Requirements

- Windows 10 / 11 (64-bit)
- [Where Winds Meet](https://store.steampowered.com/app/2592770/Where_Winds_Meet/) installed
- Internet connection

---

## Settings

**App Behavior**
- **Start with Windows** — launch automatically on boot
- **Start Minimized to Tray** — launch silently to tray without showing the window
- **Minimize to Tray** — keep running in the background when the window is closed

**Monitoring**
- **Ping Interval** — how often to ping (1–5 seconds, default 2s)
- **Spike Threshold** — ping (ms) at which a spike alert fires
- **Packet Loss Warning** — loss % threshold for alerts
- **Warn / Critical Thresholds** — customize graph color bands

**Overlay**
- **Overlay Hotkey** — keyboard shortcut to show/hide the overlay
- **Show Jitter / Loss / Sparkline** — toggle individual overlay columns

---

## Built With

- [Electron](https://www.electronjs.org/) — desktop app shell
- [Python](https://www.python.org/) — ping engine and server detection (bundled, no install needed)
- [SQLite](https://www.sqlite.org/) — local session history storage
- [electron-builder](https://www.electron.build/) — NSIS installer packaging
- [electron-updater](https://www.electron.build/auto-update) — automatic updates via GitHub Releases

---

## Building from Source

```bash
git clone https://github.com/onyxdigital-dev/WWM-Monitor.git
cd WWM-Monitor
npm install
npm run build-all   # builds Python EXE + Electron NSIS installer
```

Requires Python 3.x and Node.js 18+ on the build machine.

---

<div align="center">

Made with love by **Onyx Digital**

</div>
