// ── Dashboard ──────────────────────────────────────────────────────────────
function setHeroVal(id,text,color){const el=document.getElementById(id);if(!el)return;el.textContent=text;el.style.color=color;}
function setText(id,text){const el=document.getElementById(id);if(el)el.textContent=text;}
function calcCombinedScore(avg,lossPct,jitter){
  if(!avg)return 50;
  const p=Math.max(0,Math.min(100,Math.round(100-Math.max(0,avg-50)*0.4)));
  const l=Math.max(0,Math.round(100-lossPct*10));
  const j=Math.max(0,Math.min(100,Math.round(100-Math.max(0,jitter-5)*2.2)));
  return Math.round((p+l+j)/3);
}
function updateDash(rows,stats){
  if(stats&&stats.total){
    const totalLoss=stats.total?Math.round((stats.timeouts||0)*100/stats.total):0;
    const jitterRnd=stats.jitter!=null?Math.round(stats.jitter):0;
    // Stat tiles
    document.getElementById('d-total').textContent=stats.total;
    document.getElementById('d-avg').textContent=stats.avg?Math.round(stats.avg):'—';
    document.getElementById('d-min').textContent=stats.mn||'—';
    document.getElementById('d-max').textContent=stats.mx||'—';
    document.getElementById('d-loss').textContent=totalLoss+'%';
    document.getElementById('d-jitter').textContent=jitterRnd||'—';
    document.getElementById('d-sessions').textContent=stats.sessions||'—';
    document.getElementById('d-spikes').textContent=stats.spikes!=null?stats.spikes:'—';
    // Hero cards
    const combined=calcCombinedScore(stats.avg,totalLoss,jitterRnd);
    const grade=combined>=95?'A+':combined>=85?'A':combined>=70?'B':combined>=55?'C':combined>=40?'D':'F';
    const gradeCol=combined>=85?'var(--green)':combined>=70?'var(--yellow)':'var(--red)';
    setHeroVal('d-grade',grade,gradeCol);
    const avgMs=stats.avg?Math.round(stats.avg):null;
    setHeroVal('d-hero-avg',avgMs?avgMs+' ms':'—',avgMs&&avgMs>=CRIT?'var(--red)':avgMs&&avgMs>=WARN?'var(--yellow)':'var(--green)');
    setText('d-hero-avg-sub',`Best: ${stats.mn||'—'} ms · Worst: ${stats.mx||'—'} ms`);
    setHeroVal('d-hero-loss',totalLoss+'%',totalLoss>5?'var(--red)':totalLoss>0?'var(--yellow)':'var(--green)');
    setText('d-hero-loss-sub',`${stats.total||0} sent · ${stats.timeouts||0} lost`);
    setHeroVal('d-hero-jitter',jitterRnd?jitterRnd+' ms':'—',jitterRnd>=20?'var(--red)':jitterRnd>=10?'var(--yellow)':'var(--green)');
    setText('d-hero-jitter-sub',`${stats.spikes||0} spikes detected`);
    const totalSecs=(rows||[]).reduce((s,r)=>s+(r.duration_seconds||0),0);
    setHeroVal('d-hero-uptime',fmtDuration(totalSecs),'rgba(255,255,255,.82)');
    setText('d-hero-uptime-sub',`${stats.sessions||0} sessions`);
  }
  // Session cards — store all rows, reset to page 0
  sessAllRows=rows||[];
  // Populate geoCache from session geo data so the map works without live state
  let geoDirty=false;
  sessAllRows.forEach(r=>{
    if(!r.geo_lat||!r.geo_lon||Math.abs(r.geo_lat)<0.01||Math.abs(r.geo_lon)<0.01)return;
    const ips=(r.server_ip||'').split(',').map(s=>s.trim()).filter(Boolean);
    ips.forEach(ip=>{
      if(!geoCache[ip]){
        geoCache[ip]={lat:r.geo_lat,lon:r.geo_lon,label:[r.geo_city,r.geo_country].filter(Boolean).join(', ')||ip};
        geoDirty=true;
      }
    });
  });
  if(geoDirty){try{localStorage.setItem('geoCache',JSON.stringify(geoCache));}catch(e){}}
  sessPage=0;
  renderSessPage();
}

function renderSessPage(){
  const container=document.getElementById('sess-cards');
  if(!container)return;
  container.innerHTML='';
  const total=sessAllRows.length;
  const totalPages=Math.ceil(total/SESS_PER_PAGE)||1;
  sessPage=Math.max(0,Math.min(sessPage,totalPages-1));
  const slice=sessAllRows.slice(sessPage*SESS_PER_PAGE,(sessPage+1)*SESS_PER_PAGE);
  slice.forEach(r=>{
    const loss=r.total?Math.round(r.timeouts*100/r.total):0;
    const avg=r.avg?Math.round(r.avg):0;
    const jitter=r.jitter?Math.round(r.jitter):0;
    const score=qualityScore(avg,loss,jitter,r.spikes||0,r.total);
    const grade=score==null?'—':score>=95?'A+':score>=85?'A':score>=70?'B':score>=55?'C':score>=40?'D':'F';
    const gradeCol=score==null?'var(--muted)':score>=85?'var(--green)':score>=70?'var(--yellow)':'var(--red)';
    const barCol=score==null?'rgba(255,255,255,.2)':score>=85?'var(--green)':score>=70?'var(--yellow)':'var(--red)';
    const ips=(r.server_ip||'').split(',').map(s=>s.trim()).filter(Boolean);
    const server=ips.join(', ')||'—';
    const startFmt=fmtSessionId(r.session_id);
    const durFmt=fmtDuration(r.duration_seconds);
    const avgCol=avg>=CRIT?'var(--red)':avg>=WARN?'var(--yellow)':'var(--green)';
    const lossCol=loss>5?'var(--red)':loss>0?'var(--yellow)':'var(--green)';
    const card=document.createElement('div');
    card.className='sess-card';
    card.innerHTML=`
      <div class="sess-top">
        <div class="sess-grade" style="color:${gradeCol}">${grade}</div>
        <div class="sess-time"><div class="sess-dur">${durFmt}</div><div>${startFmt}</div></div>
      </div>
      <div class="sess-server" title="${r.server_ip||''}">${server}</div>
      <div class="sess-stats">
        <div class="ss"><div class="ss-val" style="color:${avgCol}">${avg||'—'}</div><div class="ss-lbl">AVG ms</div></div>
        <div class="ss"><div class="ss-val" style="color:var(--green)">${r.mn||'—'}</div><div class="ss-lbl">MIN ms</div></div>
        <div class="ss"><div class="ss-val" style="color:var(--red)">${r.mx||'—'}</div><div class="ss-lbl">MAX ms</div></div>
        <div class="ss"><div class="ss-val" style="color:${lossCol}">${loss}%</div><div class="ss-lbl">LOSS</div></div>
        <div class="ss"><div class="ss-val" style="color:var(--purple)">${r.spikes!=null?r.spikes:'—'}</div><div class="ss-lbl">SPIKES</div></div>
      </div>
      <div class="sess-bar" style="background:linear-gradient(90deg,${barCol},rgba(0,0,0,0));"></div>
    `;
    container.appendChild(card);
  });
  // Update pager
  const pager=document.getElementById('sess-pager');
  const info=document.getElementById('sess-pager-info');
  const prev=document.getElementById('sess-prev');
  const next=document.getElementById('sess-next');
  if(!pager)return;
  if(total<=SESS_PER_PAGE){pager.style.display='none';return;}
  pager.style.display='flex';
  info.textContent=`PAGE ${sessPage+1} OF ${totalPages} · ${total} SESSIONS`;
  prev.disabled=sessPage===0;
  next.disabled=sessPage>=totalPages-1;
}

function sessPrev(){if(sessPage>0){sessPage--;renderSessPage();}}
function sessNext(){const tp=Math.ceil(sessAllRows.length/SESS_PER_PAGE);if(sessPage<tp-1){sessPage++;renderSessPage();}}

function fmtSessionId(sid){
  if(!sid)return'—';
  const m=sid.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if(!m)return sid;
  return`${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}`;
}

function qualityScore(avg, lossPct, jitter, spikes, total) {
  if (!total || avg == null) return null;
  const pingPenalty   = Math.min(Math.max(0, (avg - 80) / 220) * 40, 40);
  const lossPenalty   = Math.min(lossPct * 3, 30);
  const jitterPenalty = Math.min(Math.max(0, (jitter - 10) / 40) * 20, 20);
  const spikePenalty  = Math.min((spikes / total) * 200, 10);
  return Math.max(0, Math.round(100 - pingPenalty - lossPenalty - jitterPenalty - spikePenalty));
}

function updateDots(history) {
  const vals = (history || []).slice(-10);
  const padded = Array(10).fill(undefined);
  vals.forEach((v, i) => { padded[10 - vals.length + i] = v; });
  padded.forEach((v, i) => {
    const dot = document.getElementById('dot-' + i);
    const ms  = document.getElementById('dot-ms-' + i);
    if (!dot) return;
    if (v === undefined) { dot.className = 'dot'; ms.textContent = '—'; return; }
    if (v === null)      { dot.className = 'dot lost'; ms.textContent = '—'; return; }
    if (v >= CRIT)       { dot.className = 'dot bad'; }
    else if (v >= WARN)  { dot.className = 'dot warn'; }
    else                 { dot.className = 'dot ok'; }
    ms.textContent = v;
  });
}

function updateQuality(avg, lossPct, jitter) {
  if (avg == null) return;
  const pScore = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, avg - 50) * 0.4)));
  const lScore = Math.max(0, Math.round(100 - lossPct * 10));
  const jScore = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, jitter - 5) * 2.2)));
  const combined = Math.round((pScore + lScore + jScore) / 3);
  const grade = combined >= 95 ? 'A+' : combined >= 85 ? 'A' : combined >= 70 ? 'B' : combined >= 55 ? 'C' : combined >= 40 ? 'D' : 'F';
  const gradeColor = combined >= 85 ? 'var(--green)' : combined >= 70 ? 'var(--yellow)' : 'var(--red)';
  const gradeEl = document.getElementById('quality-grade');
  if (!gradeEl) return;
  gradeEl.textContent = grade;
  gradeEl.style.color = gradeColor;
  [['ping', pScore], ['loss', lScore], ['jitter', jScore]].forEach(([k, s]) => {
    const color = s >= 85 ? 'var(--green)' : s >= 70 ? 'var(--yellow)' : 'var(--red)';
    const fill = document.getElementById('qb-' + k + '-fill');
    const val  = document.getElementById('qb-' + k + '-val');
    if (fill) fill.style.cssText = `width:${s}%;background:${color}`;
    if (val)  val.textContent = s;
  });
}

function fmtDuration(secs){
  if(!secs&&secs!==0)return'—';
  const h=Math.floor(secs/3600),m=Math.floor(secs%3600/60),s=secs%60;
  if(h>0)return`${h}h ${m}m ${s}s`;
  if(m>0)return`${m}m ${s}s`;
  return`${s}s`;
}
function fmtTs(iso){
  if(!iso)return'—';
  try{const d=new Date(iso);return d.toLocaleDateString('de-DE')+' '+d.toLocaleTimeString('de-DE');}catch(e){return iso;}
}

function updateSwitches(rows){
  const el=document.getElementById('switch-list-dash');
  if(!el)return;
  el.innerHTML='';
  if(!rows||!rows.length){
    el.innerHTML='<div style="text-align:center;color:var(--muted);padding:20px;font-size:11px;">No server switches recorded yet.</div>';
    return;
  }
  rows.forEach(r=>{
    const div=document.createElement('div');
    div.className='sw-row';
    const time=(fmtTs(r.switched_at)||'').split(' ')[1]||'—';
    div.innerHTML=`
      <div class="sw-time">${time}</div>
      <div class="sw-from" title="${r.from_ip||''}">${r.from_ip||'—'}</div>
      <div class="sw-arrow">→</div>
      <div class="sw-to" title="${r.to_ip||''}">${r.to_ip||'—'}</div>
      <div class="sw-dur">${fmtDuration(r.duration_seconds)}</div>
    `;
    el.appendChild(div);
  });
}

function updateEvents(data){
  const el=document.getElementById('event-log-list');
  if(!el)return;
  el.innerHTML='';
  if(!data||!data.length){
    el.innerHTML='<div style="text-align:center;color:var(--muted);padding:20px;font-size:11px;">No events recorded yet.</div>';
    return;
  }
  data.forEach(r=>{
    const labelColors={
      'DISCONNECT':   '#ef4444',
      'RECONNECT':    '#22c55e',
      'SERVER_SWITCH':'#3b82f6',
    };
    const col=labelColors[r.label]||'rgba(255,255,255,.5)';
    const div=document.createElement('div');
    div.className='ev-row';
    const time=(fmtTs(r.ts)||'').split(' ')[1]||'—';
    const date=(fmtTs(r.ts)||'').split(' ')[0]||'—';
    const extra=r.ping_ms!=null&&r.ping_ms>0?` · ${r.ping_ms} ms`:'';
    div.innerHTML=`
      <div class="ev-time">${date} ${time}</div>
      <div class="ev-badge" style="color:${col};background:${col}1a;border:1px solid ${col}33;">${r.label.replace('_',' ')}</div>
      <div class="ev-sid">${(r.session_id||'').slice(-8)}${extra}</div>
    `;
    el.appendChild(div);
  });
}

// ── CSV Export ─────────────────────────────────────────────────────────────
function exportCSV(){
  if(!ws||ws.readyState!==1)return;
  ws.send(JSON.stringify({type:'export_csv'}));
}
function downloadCSV(csvStr){
  const blob=new Blob([csvStr],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=`wwm_export_${Date.now()}.csv`;
  document.body.appendChild(a);a.click();
  document.body.removeChild(a);URL.revokeObjectURL(url);
}
