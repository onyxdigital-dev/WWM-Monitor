// ── World Map ──────────────────────────────────────────────────────────────
let serverLatLon=null, lastMappedIp=null, mapAnimFrame=null, mapPulse=0, worldPolygons=null;
let view={x:0,y:0,scale:1};
let isDragging=false, dragStart=null, viewAtDrag=null;
const MIN_SCALE=0.8, MAX_SCALE=12;
const MAP_W=1000, MAP_H=500;
let dashView={x:0,y:0,scale:1};
let dashDragging=false, dashDragStart=null, dashViewAtDrag=null;
let dashZoomAnim=null, dashAnimFrame=null;
let pastServers=[];
let geoCache={};
try{const s=localStorage.getItem('geoCache');if(s)geoCache=JSON.parse(s);}catch(e){}
let zoomAnim=null;

function smoothZoomTo(targetLon, targetLat, targetScale) {
  if (zoomAnim) cancelAnimationFrame(zoomAnim);
  const canvas=getCanvas(); if(!canvas) return;
  const W=canvas.width||800, H=canvas.height||220;
  const bx=(targetLon+180)/360*MAP_W, by=(90-targetLat)/180*MAP_H;
  const destX=W/2-bx*targetScale, destY=H/2-by*targetScale;
  const startX=view.x, startY=view.y, startS=view.scale;
  const startTime=performance.now(), DURATION=900;
  function step(now) {
    const t=Math.min((now-startTime)/DURATION,1);
    const e=t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
    view.scale=startS+(targetScale-startS)*e;
    view.x=startX+(destX-startX)*e;
    view.y=startY+(destY-startY)*e;
    if (t<1) zoomAnim=requestAnimationFrame(step); else zoomAnim=null;
  }
  zoomAnim=requestAnimationFrame(step);
}

function decodeTopo(topo) {
  const arcs=topo.arcs, polygons=[];
  const [sx,sy]=topo.transform.scale,[tx,ty]=topo.transform.translate;
  function decodeArc(idx) {
    const rev=idx<0,arc=arcs[rev?~idx:idx];
    let cx=0,cy=0;
    const pts=arc.map(([dx,dy])=>{cx+=dx;cy+=dy;return[cx*sx+tx,cy*sy+ty];});
    if(rev)pts.reverse();return pts;
  }
  topo.objects.countries.geometries.forEach(geo=>{
    const collect=(arcsArr)=>{const ring=[];arcsArr.forEach(idx=>decodeArc(idx).forEach(p=>ring.push(p)));polygons.push(ring);};
    if(geo.type==='Polygon')geo.arcs.forEach(collect);
    else if(geo.type==='MultiPolygon')geo.arcs.forEach(a=>a.forEach(collect));
  });
  return polygons;
}

function getCanvas(){return document.getElementById('map-canvas');}
function worldToCanvas(lon,lat){
  const bx=(lon+180)/360*MAP_W,by=(90-lat)/180*MAP_H;
  return[bx*view.scale+view.x,by*view.scale+view.y];
}

function drawMapCanvas() {
  const canvas=getCanvas();if(!canvas)return;
  const W=canvas.offsetWidth||800,H=canvas.offsetHeight||220;
  if(canvas.width!==W||canvas.height!==H){
    canvas.width=W;canvas.height=H;
    if(view.x===0&&view.y===0&&view.scale===1){view.scale=H/MAP_H;view.x=(W-MAP_W*view.scale)/2;view.y=0;}
  }
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#0a0a0a';ctx.fillRect(0,0,W,H);
  if(worldPolygons){
    ctx.fillStyle='rgba(255,255,255,0.08)';ctx.strokeStyle='rgba(255,255,255,0.22)';ctx.lineWidth=0.7;
    const wrapThresh=MAP_W*view.scale*0.4;
    worldPolygons.forEach(ring=>{
      if(ring.length<3)return;
      ctx.beginPath();
      let px=null,hasWrap=false;
      ring.forEach(([lon,lat])=>{
        const[x,y]=worldToCanvas(lon,lat);
        if(px===null||Math.abs(x-px)>wrapThresh){ctx.moveTo(x,y);if(px!==null)hasWrap=true;}else{ctx.lineTo(x,y);}
        px=x;
      });
      if(!hasWrap)ctx.closePath();
      ctx.fill();ctx.stroke();
    });
  }
  pastServers.forEach(ps=>{
    if(!ps.lat||!ps.lon)return;
    if(serverLatLon&&Math.abs(ps.lat-serverLatLon[0])<0.01&&Math.abs(ps.lon-serverLatLon[1])<0.01)return;
    const[px,py]=worldToCanvas(ps.lon,ps.lat);
    ctx.beginPath();ctx.arc(px,py,5,0,Math.PI*2);
    ctx.strokeStyle='rgba(255,255,255,0.25)';ctx.lineWidth=1;ctx.stroke();
    ctx.beginPath();ctx.arc(px,py,3,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.18)';ctx.fill();
    if(view.scale>1.5){
      ctx.fillStyle='rgba(255,255,255,0.35)';
      ctx.font=`${Math.min(10,8*view.scale/3)}px Segoe UI`;
      ctx.fillText(ps.label,px+7,py-4);
    }
  });
  if(serverLatLon){
    const[srvX,srvY]=worldToCanvas(serverLatLon[1],serverLatLon[0]);
    const pulse=(mapPulse%420)/420;
    ctx.beginPath();ctx.arc(srvX,srvY,7+pulse*22,0,Math.PI*2);
    ctx.strokeStyle=`rgba(255,255,255,${Math.pow(1-pulse,2)*0.7})`;ctx.lineWidth=1.5;ctx.stroke();
    ctx.shadowBlur=16;ctx.shadowColor='rgba(255,255,255,0.8)';
    ctx.beginPath();ctx.arc(srvX,srvY,6,0,Math.PI*2);ctx.fillStyle='white';ctx.fill();ctx.shadowBlur=0;
  }
  if(view.scale<=H/MAP_H*1.1){
    ctx.fillStyle='rgba(255,255,255,0.15)';ctx.font='10px Segoe UI';
    ctx.fillText('Scroll to zoom  ·  Drag to pan  ·  Dblclick → server',W/2-130,H-10);
  }
}

function animateMap(){mapPulse++;drawMapCanvas();mapAnimFrame=requestAnimationFrame(animateMap);}
function clampView(W,H){
  const mapW=W*view.scale,mapH=H*view.scale;
  view.x=Math.min(W*0.5,Math.max(W-mapW-W*0.5,view.x));
  view.y=Math.min(H*0.5,Math.max(H-mapH-H*0.5,view.y));
}

function initMapInteraction(){
  const canvas=getCanvas();if(!canvas)return;
  if(canvas.dataset.init)return;
  canvas.dataset.init='1';
  canvas.addEventListener('wheel',(e)=>{
    e.preventDefault();
    if(zoomAnim){cancelAnimationFrame(zoomAnim);zoomAnim=null;}
    const rect=canvas.getBoundingClientRect(),mx=e.clientX-rect.left,my=e.clientY-rect.top;
    const delta=e.deltaY>0?0.85:1.18;
    const newScale=Math.max(MIN_SCALE,Math.min(MAX_SCALE,view.scale*delta));
    view.x=mx-(mx-view.x)*(newScale/view.scale);
    view.y=my-(my-view.y)*(newScale/view.scale);
    view.scale=newScale;clampView(canvas.width,canvas.height);
  },{passive:false});
  canvas.addEventListener('mousedown',(e)=>{
    if(zoomAnim){cancelAnimationFrame(zoomAnim);zoomAnim=null;}
    isDragging=true;dragStart={x:e.clientX,y:e.clientY};viewAtDrag={x:view.x,y:view.y};canvas.style.cursor='grabbing';
  });
  window.addEventListener('mousemove',(e)=>{if(!isDragging)return;view.x=viewAtDrag.x+(e.clientX-dragStart.x);view.y=viewAtDrag.y+(e.clientY-dragStart.y);});
  window.addEventListener('mouseup',()=>{isDragging=false;if(getCanvas())getCanvas().style.cursor='grab';});
  canvas.addEventListener('dblclick',()=>{if(!serverLatLon)return;smoothZoomTo(serverLatLon[1],serverLatLon[0],6);});
  canvas.style.cursor='grab';
  const wrap=canvas.parentElement;
  if(!document.getElementById('zoom-in')){
    const zoomDiv=document.createElement('div');
    zoomDiv.style.cssText='position:absolute;top:10px;right:10px;z-index:10;display:flex;flex-direction:column;gap:4px;';
    zoomDiv.innerHTML=`
      <button id="zoom-in" onclick="zoomBtn(1.4)" style="width:28px;height:28px;background:rgba(20,20,20,0.85);border:1px solid rgba(255,255,255,0.15);border-radius:7px;color:white;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">+</button>
      <button id="zoom-out" onclick="zoomBtn(0.7)" style="width:28px;height:28px;background:rgba(20,20,20,0.85);border:1px solid rgba(255,255,255,0.15);border-radius:7px;color:white;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">−</button>
      <button id="zoom-rst" onclick="zoomReset()" style="width:28px;height:28px;background:rgba(20,20,20,0.85);border:1px solid rgba(255,255,255,0.15);border-radius:7px;color:rgba(255,255,255,0.6);font-size:9px;cursor:pointer;font-family:inherit;font-weight:700;">RST</button>
    `;
    wrap.appendChild(zoomDiv);
  }
}

function zoomBtn(factor){
  if(zoomAnim){cancelAnimationFrame(zoomAnim);zoomAnim=null;}
  const canvas=getCanvas(),W=canvas.width,H=canvas.height,cx=W/2,cy=H/2;
  const newScale=Math.max(MIN_SCALE,Math.min(MAX_SCALE,view.scale*factor));
  view.x=cx-(cx-view.x)*(newScale/view.scale);
  view.y=cy-(cy-view.y)*(newScale/view.scale);
  view.scale=newScale;
}
function zoomReset(){
  if(zoomAnim){cancelAnimationFrame(zoomAnim);zoomAnim=null;}
  const canvas=getCanvas(),H=canvas?canvas.height:220;
  view.scale=H/MAP_H;view.x=(canvas.width-MAP_W*view.scale)/2;view.y=0;
}

function clampDashView(W,H){
  const mapW=MAP_W*dashView.scale,mapH=MAP_H*dashView.scale;
  dashView.x=Math.min(W*0.5,Math.max(W-mapW-W*0.5,dashView.x));
  dashView.y=Math.min(H*0.5,Math.max(H-mapH-H*0.5,dashView.y));
}
function dashZoomBtn(factor){
  if(dashZoomAnim){cancelAnimationFrame(dashZoomAnim);dashZoomAnim=null;}
  const canvas=document.getElementById('dash-map-canvas');if(!canvas)return;
  const W=canvas.width,H=canvas.height,cx=W/2,cy=H/2;
  const newScale=Math.max(MIN_SCALE,Math.min(MAX_SCALE,dashView.scale*factor));
  dashView.x=cx-(cx-dashView.x)*(newScale/dashView.scale);
  dashView.y=cy-(cy-dashView.y)*(newScale/dashView.scale);
  dashView.scale=newScale;clampDashView(W,H);drawDashMap();
}
function dashZoomReset(){
  if(dashZoomAnim){cancelAnimationFrame(dashZoomAnim);dashZoomAnim=null;}
  const canvas=document.getElementById('dash-map-canvas');if(!canvas)return;
  dashView.scale=canvas.height/MAP_H;
  dashView.x=(canvas.width-MAP_W*dashView.scale)/2;dashView.y=0;
  drawDashMap();
}
function initDashMapInteraction(){
  const canvas=document.getElementById('dash-map-canvas');if(!canvas)return;
  if(canvas.dataset.dinit)return;
  canvas.dataset.dinit='1';
  canvas.addEventListener('wheel',(e)=>{
    e.preventDefault();
    if(dashZoomAnim){cancelAnimationFrame(dashZoomAnim);dashZoomAnim=null;}
    const rect=canvas.getBoundingClientRect(),mx=e.clientX-rect.left,my=e.clientY-rect.top;
    const delta=e.deltaY>0?0.85:1.18;
    const newScale=Math.max(MIN_SCALE,Math.min(MAX_SCALE,dashView.scale*delta));
    dashView.x=mx-(mx-dashView.x)*(newScale/dashView.scale);
    dashView.y=my-(my-dashView.y)*(newScale/dashView.scale);
    dashView.scale=newScale;clampDashView(canvas.width,canvas.height);drawDashMap();
  },{passive:false});
  canvas.addEventListener('mousedown',(e)=>{
    if(dashZoomAnim){cancelAnimationFrame(dashZoomAnim);dashZoomAnim=null;}
    dashDragging=true;dashDragStart={x:e.clientX,y:e.clientY};dashViewAtDrag={x:dashView.x,y:dashView.y};canvas.style.cursor='grabbing';
    e.stopPropagation();
  });
  window.addEventListener('mousemove',(e)=>{
    if(!dashDragging)return;
    const canvas2=document.getElementById('dash-map-canvas');if(!canvas2)return;
    dashView.x=dashViewAtDrag.x+(e.clientX-dashDragStart.x);
    dashView.y=dashViewAtDrag.y+(e.clientY-dashDragStart.y);
    clampDashView(canvas2.width,canvas2.height);drawDashMap();
  });
  window.addEventListener('mouseup',()=>{
    if(!dashDragging)return;
    dashDragging=false;
    const canvas2=document.getElementById('dash-map-canvas');if(canvas2)canvas2.style.cursor='grab';
  });
  canvas.addEventListener('dblclick',()=>dashZoomReset());
  canvas.style.cursor='grab';
  const wrap=canvas.parentElement;
  if(!document.getElementById('dash-zoom-in')){
    const zd=document.createElement('div');
    zd.style.cssText='position:absolute;bottom:10px;right:10px;z-index:10;display:flex;flex-direction:column;gap:4px;';
    zd.innerHTML=`
      <button id="dash-zoom-in" onclick="dashZoomBtn(1.4)" style="width:26px;height:26px;background:rgba(20,20,20,0.85);border:1px solid rgba(255,255,255,0.15);border-radius:7px;color:white;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">+</button>
      <button id="dash-zoom-out" onclick="dashZoomBtn(0.7)" style="width:26px;height:26px;background:rgba(20,20,20,0.85);border:1px solid rgba(255,255,255,0.15);border-radius:7px;color:white;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">−</button>
      <button id="dash-zoom-rst" onclick="dashZoomReset()" style="width:26px;height:26px;background:rgba(20,20,20,0.85);border:1px solid rgba(255,255,255,0.15);border-radius:7px;color:rgba(255,255,255,0.6);font-size:8px;cursor:pointer;font-family:inherit;font-weight:700;">RST</button>
    `;
    wrap.appendChild(zd);
  }
}

function loadWorldMap(){
  fetch('countries-110m.json')
    .then(r=>r.json()).then(topo=>{worldPolygons=decodeTopo(topo);drawMapCanvas();}).catch(e=>console.error('[map]',e));
}

// ── resolveAndZoom: nur Backend-GeoIP (#6, kein Nominatim-Fallback mehr) ──
function resolveAndZoom(lat, lon, label) {
  if (!lat || !lon) return; // kein gültiger GeoIP-Wert → Map bleibt unverändert
  serverLatLon = [lat, lon];
  smoothZoomTo(lon, lat, 5);
}

function updateMap(d) {
  document.getElementById('geo-isp').textContent     = d.geo_isp     || '—';
  document.getElementById('geo-ip').textContent      = d.server_ip   || '—';
  // geo-ping removed with geo-card (Task 3)

  if (!d.server_ip) return;
  // Same IP and already have location — nothing to do
  if (d.server_ip === lastMappedIp && serverLatLon) return;

  const isNewIp = d.server_ip !== lastMappedIp;
  if (isNewIp) {
    if (serverLatLon && lastMappedIp) {
      if (!pastServers.some(p => p.ip === lastMappedIp)) {
        pastServers.push({
          ip: lastMappedIp,
          lat: serverLatLon[0], lon: serverLatLon[1],
          label: document.getElementById('map-label').textContent
        });
        if (pastServers.length > 20) pastServers.shift();
      }
    }
    lastMappedIp = d.server_ip;
    const label = [d.geo_city, d.geo_country].filter(Boolean).join(', ') || d.server_ip;
    document.getElementById('map-label').textContent = label;
  }

  if(d.geo_lat&&d.geo_lon&&Math.abs(d.geo_lat)>0.01&&Math.abs(d.geo_lon)>0.01){
    const isNew=!geoCache[d.server_ip];
    geoCache[d.server_ip]={lat:d.geo_lat,lon:d.geo_lon,label:[d.geo_city,d.geo_country].filter(Boolean).join(', ')||d.server_ip};
    try{localStorage.setItem('geoCache',JSON.stringify(geoCache));}catch(e){}
    if(isNew)drawDashMap();
  }
  resolveAndZoom(
    d.geo_lat && Math.abs(d.geo_lat) > 0.01 ? d.geo_lat : null,
    d.geo_lon && Math.abs(d.geo_lon) > 0.01 ? d.geo_lon : null,
    [d.geo_city, d.geo_country].filter(Boolean).join(', ') || d.server_ip
  );
}

function drawDashMap(){
  const canvas=document.getElementById('dash-map-canvas');
  if(!canvas||!worldPolygons)return;
  const W=canvas.offsetWidth||400,H=canvas.offsetHeight||140;
  if(W<10||H<10)return;
  if(canvas.width!==W||canvas.height!==H){
    canvas.width=W;canvas.height=H;
    dashView.scale=H/MAP_H;dashView.x=(W-MAP_W*dashView.scale)/2;dashView.y=0;
  }
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#0a0a0a';ctx.fillRect(0,0,W,H);
  // Coordinate transform using dashView
  const toXY=(lon,lat)=>[
    (lon+180)/360*MAP_W*dashView.scale+dashView.x,
    (90-lat)/180*MAP_H*dashView.scale+dashView.y
  ];
  // Land polygons — clean flat fill, thin border
  ctx.fillStyle='rgba(255,255,255,0.08)';ctx.strokeStyle='rgba(255,255,255,0.22)';ctx.lineWidth=0.7;
  const dashWrapThresh=MAP_W*dashView.scale*0.4;
  worldPolygons.forEach(ring=>{
    if(ring.length<3)return;
    ctx.beginPath();
    let px=null,hasWrap=false;
    ring.forEach(([lon,lat])=>{
      const[x,y]=toXY(lon,lat);
      if(px===null||Math.abs(x-px)>dashWrapThresh){ctx.moveTo(x,y);if(px!==null)hasWrap=true;}else{ctx.lineTo(x,y);}
      px=x;
    });
    if(!hasWrap)ctx.closePath();
    ctx.fill();ctx.stroke();
  });
  // Build per-IP avg from all sessions
  const ipStats={};
  (sessAllRows||[]).forEach(r=>{
    (r.server_ip||'').split(',').forEach(ip=>{
      ip=ip.trim();if(!ip)return;
      if(!ipStats[ip])ipStats[ip]={sum:0,cnt:0};
      if(r.avg){ipStats[ip].sum+=r.avg;ipStats[ip].cnt++;}
    });
  });
  // Also include current live server even if no sessions yet
  if(serverLatLon&&Object.keys(geoCache).length){
    Object.keys(geoCache).forEach(ip=>{if(!ipStats[ip])ipStats[ip]={sum:0,cnt:0};});
  }
  // Plot each IP that has geo data
  let hasAny=false;
  Object.keys(ipStats).forEach(ip=>{
    const geo=geoCache[ip];if(!geo)return;
    hasAny=true;
    const[x,y]=toXY(geo.lon,geo.lat);
    const avg=ipStats[ip].cnt?Math.round(ipStats[ip].sum/ipStats[ip].cnt):null;
    const isCurrent=serverLatLon&&Math.abs(geo.lat-serverLatLon[0])<0.5&&Math.abs(geo.lon-serverLatLon[1])<0.5;
    const col=avg==null?'rgba(255,255,255,0.7)':avg>=CRIT?'#ef4444':avg>=WARN?'#f59e0b':'#22c55e';
    const dotR=isCurrent?5:4;
    // Glow
    ctx.shadowColor=col;ctx.shadowBlur=isCurrent?14:8;
    ctx.beginPath();ctx.arc(x,y,dotR,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
    ctx.shadowBlur=0;
    // Outer ring for current server
    if(isCurrent){
      ctx.beginPath();ctx.arc(x,y,dotR+3,0,Math.PI*2);
      ctx.strokeStyle=col.replace(')',',0.35)').replace('rgb','rgba');
      ctx.lineWidth=1;ctx.stroke();
    }
    // Label pill
    const lbl=geo.label+(avg!=null?` · ${avg}ms`:'');
    ctx.font=(isCurrent?'600 ':'')+'9px Segoe UI';
    const tw=ctx.measureText(lbl).width;
    const px=6,py=4,lx=x+dotR+6,ly=y-5;
    ctx.fillStyle='rgba(8,12,16,0.75)';
    ctx.beginPath();
    ctx.roundRect?ctx.roundRect(lx-px/2,ly-py,tw+px,14,4):ctx.rect(lx-px/2,ly-py,tw+px,14);
    ctx.fill();
    ctx.fillStyle=isCurrent?'rgba(255,255,255,0.92)':'rgba(255,255,255,0.6)';
    ctx.textAlign='left';ctx.fillText(lbl,lx,ly+7);
  });
  if(!hasAny){
    ctx.fillStyle='rgba(255,255,255,0.18)';ctx.font='11px Segoe UI';ctx.textAlign='center';
    ctx.fillText('No location data yet',W/2,H/2);ctx.textAlign='left';
  }
  // Update badge
  const lbl=document.getElementById('dash-map-label');
  if(lbl){
    const knownIps=Object.keys(ipStats).filter(ip=>geoCache[ip]);
    if(!knownIps.length){lbl.textContent='No data';}
    else{
      const curIp=knownIps.find(ip=>serverLatLon&&geoCache[ip]&&Math.abs(geoCache[ip].lat-serverLatLon[0])<0.5&&Math.abs(geoCache[ip].lon-serverLatLon[1])<0.5);
      lbl.textContent=curIp?geoCache[curIp].label:`${knownIps.length} server${knownIps.length>1?'s':''} tracked`;
    }
  }
}
