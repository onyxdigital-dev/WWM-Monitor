function switchTab(tab) {
  document.querySelectorAll('.sb-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+tab).classList.add('active');
  if (tab==='dash' && ws && ws.readyState===1) {
    ws.send(JSON.stringify({type:'get_sessions'}));
    ws.send(JSON.stringify({type:'get_switches'}));
    ws.send(JSON.stringify({type:'get_hourly'}));
  }
}

function switchSettingsTab(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('stab-' + name).classList.add('active');
  if (name === 'events' && ws && ws.readyState === 1) ws.send(JSON.stringify({type:'get_events'}));
}

function minimize() { if(window.electronAPI) window.electronAPI.minimize(); }
function closeApp()  { if(window.electronAPI) window.electronAPI.close(); }

// ── Auto Updater ─────────────────────────────────────────────────────────────
let updateDownloaded = false;

function initUpdater() {
  if (!window.electronAPI || !window.electronAPI.onUpdateStatus) return;
  window.electronAPI.onUpdateStatus(data => {
    const statusEl = document.getElementById('update-status-text');
    const btn = document.getElementById('check-update-btn');
    switch(data.type) {
      case 'checking':
        if(statusEl) statusEl.textContent = 'Checking...';
        if(btn) btn.disabled = true;
        break;
      case 'not-available':
        if(statusEl) statusEl.textContent = 'Already up to date ✓';
        if(btn) btn.disabled = false;
        setTimeout(()=>{ if(statusEl) statusEl.textContent=''; },4000);
        break;
      case 'available':
        if(statusEl) statusEl.textContent = `v${data.version} available — downloading...`;
        if(btn) btn.disabled = true;
        break;
      case 'progress':
        if(statusEl) statusEl.textContent = `Downloading... ${data.percent}%`;
        break;
      case 'downloaded':
        updateDownloaded = true;
        if(statusEl) statusEl.textContent = `v${data.version} ready to install`;
        if(btn) { btn.textContent = '⬆ INSTALL NOW'; btn.disabled = false; btn.onclick = installUpdate; }
        break;
      case 'error':
        if(statusEl) statusEl.textContent = 'Update check failed';
        if(btn) btn.disabled = false;
        setTimeout(()=>{ if(statusEl) statusEl.textContent=''; },5000);
        break;
    }
  });
}

function manualCheckUpdate() {
  if(window.electronAPI && window.electronAPI.checkForUpdates)
    window.electronAPI.checkForUpdates();
}
function installUpdate() {
  if(window.electronAPI && window.electronAPI.installUpdate)
    window.electronAPI.installUpdate();
}

// ── Overlay toggle ─────────────────────────────────────────────────────────
let overlayOpen = false;
function toggleOverlay() {
  overlayOpen = !overlayOpen;
  const btn = document.getElementById('overlay-toggle-btn');
  if (overlayOpen) {
    if (window.electronAPI) window.electronAPI.openOverlay();
    btn.textContent = '⧉ OVERLAY ON';
    btn.classList.add('active');
  } else {
    if (window.electronAPI) window.electronAPI.closeOverlay();
    btn.textContent = '⧉ OVERLAY';
    btn.classList.remove('active');
  }
}

// ── Settings ───────────────────────────────────────────────────────────────
let cfg={startup:false,startMinimized:false,tray:true,spikeMs:150,lossPct:5,pingInterval:2,warnMs:80,critMs:150,spikeThreshold:10,overlayJitter:true,overlayLoss:true,overlaySparkline:true,notificationsEnabled:true,notifSpike:true,notifDisconnect:true,notifReconnect:true,notifLoss:true,notifServerSwitch:true,notifSpikeCooldown:30,notifLossCooldown:30,notifLossThreshold:5};

function applySettingsToUI(){
  document.getElementById('s-startup').checked=cfg.startup||false;
  document.getElementById('s-tray').checked=cfg.tray!==false;
  document.getElementById('s-start-minimized').checked=cfg.startMinimized===true;
  const hk=document.getElementById('s-hotkey');
  if(hk)hk.value=cfg.overlayHotkey||'Alt+Shift+O';
  setInterval_(cfg.pingInterval||2, true);
  setWarn_(cfg.warnMs||80, true);
  setCrit_(cfg.critMs||150, true);
  setSpikeThreshold_(cfg.spikeThreshold||10, true);
  document.getElementById('s-overlay-jitter').checked=cfg.overlayJitter!==false;
  document.getElementById('s-overlay-loss').checked=cfg.overlayLoss!==false;
  document.getElementById('s-overlay-sparkline').checked=cfg.overlaySparkline!==false;
  const ne = document.getElementById('s-notif-enabled');
  if (ne) ne.checked = cfg.notificationsEnabled !== false;
  const ns = document.getElementById('s-notif-spike');
  if (ns) ns.checked = cfg.notifSpike !== false;
  const nd = document.getElementById('s-notif-disconnect');
  if (nd) nd.checked = cfg.notifDisconnect !== false;
  const nr = document.getElementById('s-notif-reconnect');
  if (nr) nr.checked = cfg.notifReconnect !== false;
  const nl = document.getElementById('s-notif-loss');
  if (nl) nl.checked = cfg.notifLoss !== false;
  const nsw = document.getElementById('s-notif-server-switch');
  if (nsw) nsw.checked = cfg.notifServerSwitch !== false;
  const sc = document.getElementById('s-notif-spike-cd');
  if (sc) sc.value = cfg.notifSpikeCooldown != null ? cfg.notifSpikeCooldown : 30;
  const lc = document.getElementById('s-notif-loss-cd');
  if (lc) lc.value = cfg.notifLossCooldown != null ? cfg.notifLossCooldown : 30;
  const lt = document.getElementById('s-notif-loss-thr');
  if (lt) lt.value = cfg.notifLossThreshold != null ? cfg.notifLossThreshold : 5;
}

function saveSetting(k,v){
  cfg[k]=v;
  if(window.electronAPI&&window.electronAPI.saveSettings)window.electronAPI.saveSettings(cfg);
  if(k==='startup'&&window.electronAPI)window.electronAPI.send('set-startup',v);
  if(k==='tray'&&window.electronAPI)window.electronAPI.send('set-tray',v);
  if(k==='pingInterval'){
    pingIntervalMs=v*1000;
    if(ws&&ws.readyState===1) ws.send(JSON.stringify({type:'settings',pingInterval:v}));
  }
  if(k==='warnMs'||k==='critMs'){
    WARN=cfg.warnMs||80; CRIT=cfg.critMs||150;
    if(ws&&ws.readyState===1) ws.send(JSON.stringify({type:'settings',warnMs:cfg.warnMs,critMs:cfg.critMs}));
  }
  if(k==='spikeThreshold'){
    if(ws&&ws.readyState===1) ws.send(JSON.stringify({type:'settings',spikeThreshold:v}));
  }
}
function setWarn_(v, skipSave){
  document.querySelectorAll('[data-warn]').forEach(b=>b.classList.toggle('active',+b.dataset.warn===v));
  if(!skipSave) saveSetting('warnMs',v);
}
function setCrit_(v, skipSave){
  document.querySelectorAll('[data-crit]').forEach(b=>b.classList.toggle('active',+b.dataset.crit===v));
  if(!skipSave) saveSetting('critMs',v);
}
function setSpikeThreshold_(v, skipSave){
  document.querySelectorAll('[data-spike]').forEach(b=>b.classList.toggle('active',+b.dataset.spike===v));
  if(!skipSave) saveSetting('spikeThreshold',v);
}
function setInterval_(v, skipSave){
  document.querySelectorAll('.interval-btn[data-val]').forEach(b=>b.classList.toggle('active',+b.dataset.val===v));
  if(!skipSave) saveSetting('pingInterval',v);
}

let _hotkeyHandler=null;
function startHotkeyRecord(el){
  el.value='Press keys…';
  el.style.borderColor='rgba(255,255,255,.4)';
  _hotkeyHandler=(e)=>{
    e.preventDefault();
    if(['Control','Alt','Shift','Meta'].includes(e.key))return;
    const parts=[];
    if(e.ctrlKey)parts.push('Control');
    if(e.altKey)parts.push('Alt');
    if(e.shiftKey)parts.push('Shift');
    // Map e.code to valid Electron accelerator key names (ASCII only)
    const codeMap={Space:'Space',Enter:'Return',NumpadEnter:'Return',Backspace:'Backspace',
      Tab:'Tab',Escape:'Escape',Delete:'Delete',Insert:'Insert',Home:'Home',End:'End',
      PageUp:'PageUp',PageDown:'PageDown',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right'};
    let k=null;
    if(e.code.startsWith('Key'))k=e.code.slice(3);        // KeyA → A
    else if(e.code.startsWith('Digit'))k=e.code.slice(5); // Digit1 → 1
    else if(/^F\d{1,2}$/.test(e.code))k=e.code;           // F1-F12
    else if(codeMap[e.code])k=codeMap[e.code];
    if(!k)return; // ignore keys Electron won't accept
    parts.push(k);
    const combo=parts.join('+');
    el.value=combo;
    el.blur();
    cfg.overlayHotkey=combo;
    if(window.electronAPI&&window.electronAPI.setOverlayHotkey)window.electronAPI.setOverlayHotkey(combo);
  };
  el.addEventListener('keydown',_hotkeyHandler);
}
function stopHotkeyRecord(el){
  if(_hotkeyHandler){el.removeEventListener('keydown',_hotkeyHandler);_hotkeyHandler=null;}
  el.style.borderColor='rgba(255,255,255,.15)';
  if(el.value==='Press keys…')el.value=cfg.overlayHotkey||'Alt+Shift+O';
}
function clearAllData(){
  if(!confirm('Delete all ping history, sessions and server data? This cannot be undone.'))return;
  if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'clear_data'}));
}

function loadSettings(){
  if(window.electronAPI&&window.electronAPI.getSettings){
    window.electronAPI.getSettings().then(saved=>{
      cfg=Object.assign(cfg,saved);
      WARN=cfg.warnMs||80; CRIT=cfg.critMs||150;
      applySettingsToUI();
      window.electronAPI.send('set-tray',cfg.tray!==false);
    });
  } else { applySettingsToUI(); }
  if(window.electronAPI&&window.electronAPI.getStartup){
    window.electronAPI.getStartup().then(v=>{
      cfg.startup=v;
      document.getElementById('s-startup').checked=v;
    });
  }
}
