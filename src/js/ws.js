let ws;
let _notifLastAt = { spike: 0, loss: 0 };
let _discordLastAt = { spike: 0, loss: 0 };
let _prevRunning = null;
let _prevServerIp = null;
let WARN=80, CRIT=150;
let _chartPeriod = '24h';
let _lastDailyData = [];
let _hopsExpanded = false;

function sendDiscordWebhook(title, description, color) {
  const url = cfg.discordWebhook;
  if (!url || !cfg.discordEnabled) return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{ title, description, color, timestamp: new Date().toISOString() }]
    })
  }).catch(() => {});
}

function connect() {
  ws = new WebSocket('ws://localhost:7373');
  ws.onclose = () => setTimeout(connect, 2000);
  ws.onerror = () => ws.close();
  ws.onopen = () => {
    // Delay allows backfill_geo to complete for existing IPs before we request sessions
    setTimeout(()=>{
      if(ws&&ws.readyState===1){
        ws.send(JSON.stringify({type:'get_sessions'}));
        ws.send(JSON.stringify({type:'get_switches'}));
        ws.send(JSON.stringify({type:'get_events'}));
      }
    }, 3000);
  };
  ws.onmessage = ({data}) => {
    const msg = JSON.parse(data);
    if (msg.type==='state')        updateLive(msg.data);
    if (msg.type==='sessions')     { updateDash(msg.data, msg.stats); drawDashMap(); }
    if (msg.type==='switches')     updateSwitches(msg.data);
    if (msg.type==='csv_data')     downloadCSV(msg.csv);
    if (msg.type==='session_reset') onSessionReset();
    if (msg.type==='clear_data_ok') {
      geoCache={};try{localStorage.removeItem('geoCache');}catch(e){}
      sessAllRows=[];sessPage=0;renderSessPage();
      drawDashMap();
      if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'get_sessions'}));ws.send(JSON.stringify({type:'get_switches'}));}
    }
    if (msg.type==='hourly')       { drawHourly(msg.data); drawHourlyJitter(msg.data); }
    if (msg.type==='events')       updateEvents(msg.data);
    if (msg.type==='daily') {
      _lastDailyData = msg.data || [];
      drawDailyPing(_lastDailyData);
      drawDailyJitter(_lastDailyData);
    }
    if (msg.type==='session_pings') {
      const sessRow = (sessAllRows||[]).find(r => r.session_id === msg.session_id);
      if (sessRow) renderSessionModal(sessRow, msg.data || []);
    }
    if (msg.type==='note') {
      const modal = document.getElementById('session-modal')
      if (modal && modal.classList.contains('modal-visible')) {
        const noteEl = document.getElementById('modal-note')
        if (noteEl) noteEl.value = msg.note || ''
      }
    }
  };
}

function setChartPeriod(p) {
  _chartPeriod = p;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === p));
  updatePeriodLabels();
  if (p === '24h') {
    drawHourly(lastHourlyData);
    drawHourlyJitter(lastHourlyData);
  } else {
    const days = p === '7d' ? 7 : 30;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({type:'get_daily', period: days}));
  }
}

function updatePeriodLabels() {
  const labels = { '24h': 'LAST 24H', '7d': 'LAST 7 DAYS', '30d': 'LAST 30 DAYS' };
  const lbl = labels[_chartPeriod] || 'LAST 24H';
  const pingEl = document.getElementById('chart-period-label-ping');
  const jitterEl = document.getElementById('chart-period-label-jitter');
  if (pingEl) pingEl.textContent = 'PING TREND — ' + lbl;
  if (jitterEl) jitterEl.textContent = 'JITTER TREND — ' + lbl;
}

// ── Reset Session ──────────────────────────────────────────────────────────
function resetSession() {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({type:'reset_session'}));
}
function onSessionReset() {
  graphHistory=[]; jitterHistory=[]; graphLatestTs=null;
  lastGraphLen=-1; lastJitterLen=-1; lastBadgeKey='';
  drawGraph(); drawJitter();
  if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'get_sessions'}));ws.send(JSON.stringify({type:'get_switches'}));}
}

// ── Traceroute hops expand/collapse ────────────────────────────────────────
function toggleHops() {
  _hopsExpanded = !_hopsExpanded
  const list = document.getElementById('hops-list')
  const icon = document.getElementById('hops-expand-icon')
  if (list) list.style.display = _hopsExpanded ? 'block' : 'none'
  if (icon) icon.textContent = _hopsExpanded ? '▴' : '▾'
  if (_hopsExpanded) renderHopsList(window._currentHops || [])
}

function renderHopsList(hops) {
  const list = document.getElementById('hops-list')
  if (!list) return
  list.innerHTML = hops.map((ip, i) =>
    '<div class="hop-row"><span class="hop-num">' + (i+1) + '</span><span class="hop-ip">' + ip + '</span></div>'
  ).join('')
}

// ── connected_since Timer (#4) ─────────────────────────────────────────────
// Stored once from WS state, ticked independently every second
let connectedSinceTs = null;

setInterval(() => {
  const el = document.getElementById('i-connected-since');
  if (!el) return;
  if (!connectedSinceTs) { el.textContent = ''; return; }
  const diff = Math.floor((Date.now() - connectedSinceTs) / 1000);
  const h = Math.floor(diff / 3600), m = Math.floor(diff % 3600 / 60), s = diff % 60;
  const dur = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  el.textContent = new Date(connectedSinceTs).toLocaleTimeString('de-DE') + '  +' + dur;
}, 1000);

// ── Live ───────────────────────────────────────────────────────────────────
let lastHourlyData=[];
let lastHourlySlots=[], lastHourlyJitterSlots=[];
let hourlyHoverIdx=null, hourlyJitterHoverIdx=null;
let sessAllRows=[], sessPage=0;
const SESS_PER_PAGE=5;
let graphHistory=[], jitterHistory=[];
let lastGraphLen=-1, lastJitterLen=-1;
let lastBadgeKey='';
let graphLatestTs=null, pingIntervalMs=2000, graphHoverIdx=null, jitterHoverIdx=null;

function updateLive(d) {
  const ms=d.last_ms, count=d.count, lost=d.lost, recv=count-lost;
  const avg=recv>0?Math.round(d.sum/recv):0;
  const jitter=d.jitter_count>0?Math.round(d.jitter_sum/d.jitter_count):0;
  const loss=count>0?Math.round(lost*100/count):0;

  const dot=document.getElementById('status-dot');
  if (dot) dot.classList.toggle('alive', !!d.running);

  document.getElementById('i-loc').textContent=d.geo_city?`${d.geo_city}, ${d.geo_country}`:'—';
  document.getElementById('i-proc').textContent=d.exe?`${d.exe} (${d.pid})`:'—';
  document.getElementById('i-sess').textContent=d.ts;

  // Only update the timestamp reference; the setInterval above handles display
  connectedSinceTs = d.connected_since ? new Date(d.connected_since).getTime() : null;

  const dpRouter=document.getElementById('dp-router');
  const dpDns=document.getElementById('dp-dns');
  dpRouter.textContent=d.router_ms!=null?d.router_ms+' ms':'— ms';
  dpDns.textContent=d.dns_ms!=null?d.dns_ms+' ms':'— ms';
  dpRouter.style.color=d.router_ms==null?'rgba(255,255,255,.4)':d.router_ms>50?'#f59e0b':'#22c55e';
  dpDns.style.color=d.dns_ms==null?'rgba(255,255,255,.4)':d.dns_ms>80?'#f59e0b':'#22c55e';

  if (d.dns_ms!=null) {
    const health=Math.max(0,100-Math.min(d.dns_ms,200)/2);
    const bar=document.getElementById('provider-bar');
    bar.style.width=health+'%';
    bar.style.background=health>70?'#22c55e':health>40?'#f59e0b':'#ef4444';
    document.getElementById('provider-health-pct').textContent=Math.round(health)+'%';
  }

  if (d.hops && d.hops.length) {
    window._currentHops = d.hops
    const icon = _hopsExpanded ? '▴' : '▾'
    const hopsEl = document.getElementById('geo-hops')
    if (hopsEl) hopsEl.innerHTML = d.hops.length + ' hops <span id="hops-expand-icon" style="font-size:9px;opacity:.5;">' + icon + '</span>'
    if (_hopsExpanded) renderHopsList(d.hops)
  }

  const pn=document.getElementById('ping-num');
  const pill=document.getElementById('status-pill');

  if (ms===null||ms===undefined) {
    pn.textContent='OUT'; pn.className='ping-num ping-crit';
    document.getElementById('ping-unit').textContent='';
    pill.textContent='● TIMEOUT';
    pill.style.cssText='color:#ef4444;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);';
  } else {
    pn.textContent=ms; document.getElementById('ping-unit').textContent='ms';
    if (ms>=CRIT) {
      pn.className='ping-num ping-crit'; pill.textContent='● CRITICAL';
      pill.style.cssText='color:#ef4444;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);';
    } else if (ms>=WARN) {
      pn.className='ping-num ping-warn'; pill.textContent='● HIGH LATENCY';
      pill.style.cssText='color:#f59e0b;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);';
    } else if (d.is_spike) {
      pn.className='ping-num ping-ok'; pill.textContent='● SPIKE';
      pill.style.cssText='color:#a855f7;background:rgba(168,85,247,.12);border:1px solid rgba(168,85,247,.3);';
    } else {
      pn.className='ping-num ping-ok'; pill.textContent='● OK';
      pill.style.cssText='color:#22c55e;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);';
    }
  }

  document.getElementById('s-sent').textContent=count;
  document.getElementById('s-recv').textContent=recv;
  document.getElementById('s-lost').textContent=lost;
  document.getElementById('s-loss').textContent=loss+'%';
  document.getElementById('s-spikes').textContent=d.spikes;
  document.getElementById('s-min').textContent=d.min<99999?d.min:0;
  document.getElementById('s-max').textContent=d.max;
  document.getElementById('s-avg').textContent=avg;
  document.getElementById('s-jitter').textContent=jitter;
  document.getElementById('s-streak').textContent=d.streak;
  updateQuality(avg > 0 ? avg : null, loss, jitter);

  const spikeEl = document.getElementById('spike-info');
  if (d.last_spike) {
    spikeEl.textContent=`Last spike: ${d.last_spike[0]} ms @ ${d.last_spike[1]}`;
    spikeEl.style.display='block';
  } else {
    spikeEl.style.display='none';
  }

  // ── Dots: update last 10 ping dots
  const newHistory = d.history||[];
  const badgeSlice = newHistory.slice(-10);
  const badgeKey = badgeSlice.join(',');
  if (badgeKey !== lastBadgeKey) {
    lastBadgeKey = badgeKey;
    updateDots(newHistory);
  }

  // ── Graphen: nur neu zeichnen wenn neue Datenpunkte dazugekommen sind
  const newGraph = d.history||[];
  const newJitter = d.jitter_history||[];
  const graphChanged  = newGraph.length  !== lastGraphLen  || (newGraph.length  > 0 && newGraph[newGraph.length-1]   !== graphHistory[graphHistory.length-1]);
  const jitterChanged = newJitter.length !== lastJitterLen || (newJitter.length > 0 && newJitter[newJitter.length-1] !== jitterHistory[jitterHistory.length-1]);

  graphHistory  = newGraph;
  jitterHistory = newJitter;
  if (graphChanged) graphLatestTs = Date.now();

  if (graphChanged)  { lastGraphLen  = graphHistory.length;  drawGraph(); }
  if (jitterChanged) { lastJitterLen = jitterHistory.length; drawJitter(); }

  updateMap(d);

  if (window.electronAPI && window.electronAPI.sendPingData)
    window.electronAPI.sendPingData({
      ms, status: d.status, jitter, loss,
      running: !!d.running,
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

  // ── Notifications ────────────────────────────────────────────────────────
  if (cfg.notificationsEnabled !== false && window.electronAPI && window.electronAPI.notify) {
    const now = Date.now();
    const loc = d.geo_city ? `${d.geo_city}, ${d.geo_country}` : '';
    const locStr = loc ? ` (${loc})` : '';

    // Disconnect / Reconnect — no cooldown, fire every transition
    if (_prevRunning !== null) {
      if (_prevRunning && !d.running && cfg.notifDisconnect !== false)
        window.electronAPI.notify('WWM Monitor — Verbindung verloren', 'Spiel-Server nicht erreichbar');
      if (!_prevRunning && d.running && cfg.notifReconnect !== false)
        window.electronAPI.notify('WWM Monitor — Verbunden', `${loc ? loc + ' · ' : ''}${ms != null ? ms + ' ms' : ''}`);
    }

    // Server-Switch notification
    if (cfg.notifServerSwitch !== false && _prevServerIp !== null && d.server_ip && d.server_ip !== _prevServerIp) {
      const loc = d.geo_city ? `${d.geo_city}, ${d.geo_country} · ` : '';
      window.electronAPI.notify('WWM Monitor — Serverwechsel', `${loc}${d.server_ip}`);
    }

    // Spike
    if (d.is_spike && ms != null && cfg.notifSpike !== false) {
      const cooldownMs = (cfg.notifSpikeCooldown != null ? cfg.notifSpikeCooldown : 30) * 1000;
      if (now - _notifLastAt.spike >= cooldownMs) {
        _notifLastAt.spike = now;
        window.electronAPI.notify('WWM Monitor — Spike', `Ping: ${ms} ms${locStr}`);
      }
    }

    // High Loss
    const lossThreshold = cfg.notifLossThreshold != null ? cfg.notifLossThreshold : 5;
    if (d.running && cfg.notifLoss !== false && loss >= lossThreshold) {
      const cooldownMs = (cfg.notifLossCooldown != null ? cfg.notifLossCooldown : 30) * 1000;
      if (now - _notifLastAt.loss >= cooldownMs) {
        _notifLastAt.loss = now;
        window.electronAPI.notify('WWM Monitor — Paketverlust', `Loss: ${loss}%${locStr}`);
      }
    }
  }

  // ── Discord webhook triggers ────────────────────────────────────────────
  if (cfg.discordEnabled && cfg.discordWebhook) {
    const _now = Date.now() / 1000;
    const _loc = d.geo_city ? ' \u00b7 ' + d.geo_city : '';
    const _ms  = ms != null ? ms : '?';

    if (_prevRunning !== null && _prevRunning && !d.running && cfg.discordDisconnect)
      sendDiscordWebhook('\ud83d\udd34 Verbindung verloren', 'WWM Server nicht erreichbar', 15158332);

    if (_prevRunning !== null && !_prevRunning && d.running && cfg.discordReconnect)
      sendDiscordWebhook('\ud83d\udfe2 Verbunden', (d.geo_city || d.geo_country || '') + ' \u00b7 ' + _ms + ' ms', 3066993);

    if (_prevServerIp !== null && d.server_ip && d.server_ip !== _prevServerIp && cfg.discordServerSwitch)
      sendDiscordWebhook('\ud83d\udd35 Serverwechsel', (d.geo_city || d.server_ip || '?') + (d.server_ip ? ' (' + d.server_ip + ')' : ''), 3447003);

    if (d.is_spike && ms != null && cfg.discordSpike) {
      const cooldown = cfg.discordSpikeCooldown ?? 60;
      if (_now - _discordLastAt.spike >= cooldown) {
        _discordLastAt.spike = _now;
        sendDiscordWebhook('\ud83d\udfe1 Ping Spike', 'Ping: ' + _ms + ' ms' + _loc, 16776960);
      }
    }

    if (d.running && cfg.discordLoss) {
      const threshold = cfg.discordLossThreshold ?? 5;
      const cooldown  = cfg.discordLossCooldown ?? 60;
      if (loss >= threshold && _now - _discordLastAt.loss >= cooldown) {
        _discordLastAt.loss = _now;
        sendDiscordWebhook('\ud83d\udd34 Paketverlust', 'Loss: ' + loss + '%' + _loc, 15158332);
      }
    }
  }

  _prevRunning = !!d.running;
  if (d.server_ip) _prevServerIp = d.server_ip;
}
