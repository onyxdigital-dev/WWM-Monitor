<div align="center">

<img src="assets/icon.png" width="100" height="100" style="border-radius:20px" />

# WWM Monitor

**Real-time network monitor for Where Winds Meet**  
Live ping, packet loss, spike detection, server tracking & more — all in one sleek overlay app.

[![Latest Release](https://img.shields.io/github/v/release/onyxdigital-dev/WWM-Monitor?style=flat-square&color=22c55e&label=Download)](https://github.com/onyxdigital-dev/WWM-Monitor/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows-blue?style=flat-square)]()
[![License](https://img.shields.io/badge/license-MIT-white?style=flat-square)](LICENSE)

</div>

---

## ⬇️ Download & Install

1. Go to [**Releases**](https://github.com/onyxdigital-dev/WWM-Monitor/releases/latest)
2. Download `WWM-Monitor-Setup-x.x.x.exe`
3. Run the installer — done. No Python, no Node.js needed.

> **Windows SmartScreen** may warn you on first launch. Click **"More info" → "Run anyway"** — the app is safe.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🟢 **Live Ping** | Real-time ms display with color-coded status |
| 📈 **Ping & Jitter Graph** | Last 50 pings visualized with spike markers |
| 🌍 **Server Map** | Interactive world map showing your game server location |
| ⚡ **Spike Alerts** | Toast notification when ping exceeds your threshold |
| 📦 **Packet Loss Tracking** | Sent / Received / Lost / Loss% counters |
| 🔀 **Server Switch History** | Logs every time WWM moves you to a new server |
| 🗺️ **Dual Ping** | Router + DNS ping side-by-side |
| 🏷️ **Event Markers** | Mark game events (round start, disconnect, etc.) |
| 📤 **CSV Export** | Export your full ping history |
| 🪟 **In-Game Overlay** | Minimal always-on-top overlay while you play |
| 🔄 **Auto Updates** | App updates itself automatically in the background |

---

## 🖥️ Requirements

- Windows 10 / 11 (64-bit)
- [Where Winds Meet](https://store.steampowered.com/app/2592770/Where_Winds_Meet/) running
- Internet connection

---

## 🚀 How It Works

WWM Monitor detects the active **Where Winds Meet** process, reads the game server IP, and pings it every second. All stats are displayed live — no configuration needed.

```
Launch WWM Monitor → Start Where Winds Meet → Done
```

The app sits in your **system tray** and keeps running in the background. It will automatically reconnect whenever you start a new game session.

---

## ⚙️ Settings

- **Start with Windows** — launch automatically on boot  
- **Minimize to Tray** — keep running in background when closed  
- **Spike Notifications** — enable/disable toast alerts  
- **Spike Threshold** — customize at what ping (ms) an alert fires  
- **Packet Loss Warning** — set your loss % threshold  

---

## 🛠️ Built With

- [Electron](https://www.electronjs.org/) — desktop app framework  
- [Python](https://www.python.org/) — backend ping engine (bundled in exe)  
- [electron-builder](https://www.electron.build/) — installer packaging  
- [electron-updater](https://www.electron.build/auto-update) — auto updates via GitHub Releases  

---

<div align="center">

Made with ❤️ by **Onyx Digital**

</div>
