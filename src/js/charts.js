// ── Canvas-Resize-Helper ───────────────────────────────────────────────────────
function syncCanvasSize(canvas, fallbackW, fallbackH) {
  const wrap = canvas.parentElement;
  const W = wrap.offsetWidth  || fallbackW;
  const H = wrap.offsetHeight || fallbackH;
  if (canvas.width === W && canvas.height === H) return false;
  canvas.width  = W;
  canvas.height = H;
  return true;
}

// ── Ping Graph ─────────────────────────────────────────────────────────────
function drawGraph() {
  const canvas = document.getElementById('graph-canvas');
  syncCanvasSize(canvas, 800, 110);
  const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,hist=graphHistory;
  ctx.clearRect(0,0,W,H);
  if (!hist.length) return;
  const valid=hist.filter(v=>v!==null);
  if (!valid.length) return;
  const maxV=Math.max(...valid,CRIT)+20,n=hist.length,step=W/Math.max(n,1),pad=8;
  const yFor=v=>H-Math.round((v/maxV)*(H-pad*2))-pad;
  const lastV=valid[valid.length-1];
  const col=lastV>=CRIT?'#ef4444':lastV>=WARN?'#f59e0b':'#22c55e';
  const rgb=lastV>=CRIT?'239,68,68':lastV>=WARN?'245,158,11':'34,197,94';
  const pts=hist.map((v,i)=>({x:i*step+step/2,y:v!==null?yFor(v):H,v}));
  // Area fill
  ctx.beginPath();ctx.moveTo(pts[0].x,H);
  pts.forEach(({x,y})=>ctx.lineTo(x,y));
  ctx.lineTo(pts[pts.length-1].x,H);ctx.closePath();
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,`rgba(${rgb},.28)`);g.addColorStop(1,`rgba(${rgb},0.02)`);
  ctx.fillStyle=g;ctx.fill();
  // Line
  ctx.beginPath();let first=true;
  pts.forEach(({x,y,v})=>{
    if(v===null){first=true;return;}
    first?ctx.moveTo(x,y):ctx.lineTo(x,y);first=false;
  });
  ctx.strokeStyle=col;ctx.lineWidth=2;ctx.setLineDash([]);ctx.stroke();
  // X-axis timestamps
  if (graphLatestTs && hist.length > 1) {
    const fmtT=ts=>new Date(ts).toLocaleTimeString('en-US');
    const leftTs=graphLatestTs-(hist.length-1)*pingIntervalMs;
    ctx.font='9px Segoe UI';ctx.fillStyle='rgba(255,255,255,0.28)';ctx.textBaseline='bottom';
    ctx.textAlign='left';  ctx.fillText(fmtT(leftTs),      3, H-1);
    ctx.textAlign='right'; ctx.fillText(fmtT(graphLatestTs),W-3,H-1);
    ctx.textBaseline='alphabetic';ctx.textAlign='left';
  }
  // Hover tooltip
  if (graphHoverIdx!==null && graphHoverIdx>=0 && graphHoverIdx<hist.length) {
    const v=hist[graphHoverIdx];
    const x=graphHoverIdx*step+step/2, y=v!==null?yFor(v):H;
    // vertical line
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);
    ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=1;ctx.setLineDash([]);ctx.stroke();
    if (v!==null) {
      // dot
      ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);
      ctx.fillStyle=col;ctx.fill();
      // tooltip box
      const ts=graphLatestTs?(graphLatestTs-(hist.length-1-graphHoverIdx)*pingIntervalMs):null;
      const label=`${v} ms${ts?' · '+new Date(ts).toLocaleTimeString('en-US'):''}`;
      ctx.font='bold 10px Segoe UI';
      const tw=ctx.measureText(label).width;
      const bw=tw+14, bh=22, bx=Math.min(Math.max(x-bw/2,2),W-bw-2), by=Math.max(y-34,4);
      ctx.fillStyle='rgba(20,20,20,.88)';
      ctx.beginPath();ctx.roundRect(bx,by,bw,bh,5);ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle='white';ctx.textAlign='left';ctx.textBaseline='middle';
      ctx.fillText(label,bx+7,by+bh/2);
      ctx.textBaseline='alphabetic';
    }
  }
}

// ── Jitter Graph ───────────────────────────────────────────────────────────
function drawJitter() {
  const canvas = document.getElementById('jitter-canvas');
  syncCanvasSize(canvas, 800, 70);
  const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,hist=jitterHistory;
  ctx.clearRect(0,0,W,H);
  if (!hist.length) return;
  const valid=hist.filter(v=>v!=null&&v>0);
  if (!valid.length) return;
  const maxV=Math.max(...valid,30)+5,n=hist.length,step=W/Math.max(n,1),pad=4;
  const yFor=v=>H-Math.round((v/maxV)*(H-pad*2))-pad;
  const lastV=valid[valid.length-1];
  const col=lastV>=20?'#ef4444':lastV>=10?'#f59e0b':'#22c55e';
  const rgb=lastV>=20?'239,68,68':lastV>=10?'245,158,11':'34,197,94';
  const pts=hist.map((v,i)=>({x:i*step+step/2,y:v!=null?yFor(Math.max(v,0)):H,v}));
  // Area fill
  ctx.beginPath();ctx.moveTo(pts[0].x,H);
  pts.forEach(({x,y})=>ctx.lineTo(x,y));
  ctx.lineTo(pts[pts.length-1].x,H);ctx.closePath();
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,`rgba(${rgb},.28)`);g.addColorStop(1,`rgba(${rgb},0.02)`);
  ctx.fillStyle=g;ctx.fill();
  // Line
  ctx.beginPath();let first=true;
  pts.forEach(({x,y,v})=>{
    if(v==null){first=true;return;}
    first?ctx.moveTo(x,y):ctx.lineTo(x,y);first=false;
  });
  ctx.strokeStyle=col;ctx.lineWidth=2;ctx.stroke();
  // Hover tooltip
  if (jitterHoverIdx!==null && jitterHoverIdx>=0 && jitterHoverIdx<hist.length) {
    const v=hist[jitterHoverIdx];
    const x=jitterHoverIdx*step+step/2, y=v!=null&&v>0?yFor(v):H;
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);
    ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=1;ctx.stroke();
    if (v!=null&&v>0) {
      ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
      const label=`${v} ms jitter`;
      ctx.font='bold 10px Segoe UI';
      const tw=ctx.measureText(label).width;
      const bw=tw+14,bh=22,bx=Math.min(Math.max(x-bw/2,2),W-bw-2),by=Math.max(y-34,4);
      ctx.fillStyle='rgba(20,20,20,.88)';
      ctx.beginPath();ctx.roundRect(bx,by,bw,bh,5);ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle='white';ctx.textAlign='left';ctx.textBaseline='middle';
      ctx.fillText(label,bx+7,by+bh/2);
      ctx.textBaseline='alphabetic';
    }
  }
}


(()=>{
  const c=document.getElementById('graph-canvas');
  c.addEventListener('mousemove',e=>{
    const rect=c.getBoundingClientRect(), mx=(e.clientX-rect.left)*(c.width/rect.width);
    const n=graphHistory.length; if(!n) return;
    const step=c.width/Math.max(n,1);
    graphHoverIdx=Math.min(Math.max(Math.round((mx-step/2)/step),0),n-1);
    drawGraph();
  });
  c.addEventListener('mouseleave',()=>{graphHoverIdx=null;drawGraph();});
  const j=document.getElementById('jitter-canvas');
  j.addEventListener('mousemove',e=>{
    const rect=j.getBoundingClientRect(), mx=(e.clientX-rect.left)*(j.width/rect.width);
    const n=jitterHistory.length; if(!n) return;
    const step=j.width/Math.max(n,1);
    jitterHoverIdx=Math.min(Math.max(Math.round((mx-step/2)/step),0),n-1);
    drawJitter();
  });
  j.addEventListener('mouseleave',()=>{jitterHoverIdx=null;drawJitter();});
})();

function drawHourly(rows){
  lastHourlyData=rows||[];
  const canvas=document.getElementById('hourly-canvas');
  if(!canvas)return;
  const W=canvas.offsetWidth||800,H=canvas.offsetHeight||72;
  if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);
  const now=new Date();
  const slots=Array.from({length:24},(_,i)=>{
    const d=new Date(now-(23-i)*3600000);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:00`;
    return (rows||[]).find(r=>r.hour===key)||null;
  });
  lastHourlySlots=slots;
  const valid=slots.filter(r=>r&&r.avg_ms).map(r=>r.avg_ms);
  if(!valid.length)return;
  const maxV=Math.max(...valid,CRIT)+20,pad=6,lblH=12;
  const step=W/24;
  const yFor=v=>H-lblH-Math.round((v/maxV)*(H-pad-lblH))-pad;
  const pts=slots.map((r,i)=>({x:i*step+step/2,y:r&&r.avg_ms?yFor(r.avg_ms):null,v:r&&r.avg_ms}));
  const lastV=valid[valid.length-1];
  const col=lastV>=CRIT?'#ef4444':lastV>=WARN?'#f59e0b':'#22c55e';
  const rgb=lastV>=CRIT?'239,68,68':lastV>=WARN?'245,158,11':'34,197,94';
  ctx.beginPath();ctx.moveTo(pts[0].x,H-lblH);
  pts.forEach(({x,y})=>ctx.lineTo(x,y!==null?y:H-lblH));
  ctx.lineTo(pts[pts.length-1].x,H-lblH);ctx.closePath();
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,`rgba(${rgb},.28)`);g.addColorStop(1,`rgba(${rgb},0.02)`);
  ctx.fillStyle=g;ctx.fill();
  ctx.beginPath();let first=true;
  pts.forEach(({x,y,v})=>{if(!v){first=true;return;}first?ctx.moveTo(x,y):ctx.lineTo(x,y);first=false;});
  ctx.strokeStyle=col;ctx.lineWidth=2;ctx.setLineDash([]);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.28)';ctx.font='8px Segoe UI';
  ctx.textAlign='center';ctx.textBaseline='bottom';
  [0,6,12,18,23].forEach(i=>{const d=new Date(now-(23-i)*3600000);ctx.fillText(String(d.getHours()).padStart(2,'0')+'h',(i+0.5)*step,H);});
  ctx.textBaseline='alphabetic';ctx.textAlign='left';
  // Hover overlay
  if(hourlyHoverIdx!==null&&hourlyHoverIdx>=0&&hourlyHoverIdx<24){
    const pt=pts[hourlyHoverIdx];
    const x=pt.x;
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);
    ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=1;ctx.setLineDash([]);ctx.stroke();
    if(pt.v){
      ctx.beginPath();ctx.arc(x,pt.y,4,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
      const d=new Date(now-(23-hourlyHoverIdx)*3600000);
      const label=`${Math.round(pt.v)} ms · ${String(d.getHours()).padStart(2,'0')}:00`;
      ctx.font='bold 10px Segoe UI';
      const tw=ctx.measureText(label).width;
      const bw=tw+14,bh=22,bx=Math.min(Math.max(x-bw/2,2),W-bw-2),by=Math.max(pt.y-34,4);
      ctx.fillStyle='rgba(20,20,20,.88)';
      ctx.beginPath();ctx.roundRect(bx,by,bw,bh,5);ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle='white';ctx.textAlign='left';ctx.textBaseline='middle';
      ctx.fillText(label,bx+7,by+bh/2);
      ctx.textBaseline='alphabetic';ctx.textAlign='left';
    }
  }
}

function drawHourlyJitter(rows){
  const canvas=document.getElementById('hourly-jitter-canvas');
  if(!canvas)return;
  const W=canvas.offsetWidth||800,H=canvas.offsetHeight||72;
  if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);
  const now=new Date();
  const slots=Array.from({length:24},(_,i)=>{
    const d=new Date(now-(23-i)*3600000);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:00`;
    return (rows||[]).find(r=>r.hour===key)||null;
  });
  lastHourlyJitterSlots=slots;
  const valid=slots.filter(r=>r&&r.avg_jitter).map(r=>r.avg_jitter);
  if(!valid.length)return;
  const maxV=Math.max(...valid,30)+5,pad=6,lblH=12;
  const step=W/24;
  const yFor=v=>H-lblH-Math.round((v/maxV)*(H-pad-lblH))-pad;
  const pts=slots.map((r,i)=>({x:i*step+step/2,y:r&&r.avg_jitter?yFor(r.avg_jitter):null,v:r&&r.avg_jitter}));
  const lastV=valid[valid.length-1];
  const col=lastV>=20?'#ef4444':lastV>=10?'#f59e0b':'#22c55e';
  const rgb=lastV>=20?'239,68,68':lastV>=10?'245,158,11':'34,197,94';
  ctx.beginPath();ctx.moveTo(pts[0].x,H-lblH);
  pts.forEach(({x,y})=>ctx.lineTo(x,y!==null?y:H-lblH));
  ctx.lineTo(pts[pts.length-1].x,H-lblH);ctx.closePath();
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,`rgba(${rgb},.28)`);g.addColorStop(1,`rgba(${rgb},0.02)`);
  ctx.fillStyle=g;ctx.fill();
  ctx.beginPath();let first=true;
  pts.forEach(({x,y,v})=>{if(!v){first=true;return;}first?ctx.moveTo(x,y):ctx.lineTo(x,y);first=false;});
  ctx.strokeStyle=col;ctx.lineWidth=2;ctx.setLineDash([]);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.28)';ctx.font='8px Segoe UI';
  ctx.textAlign='center';ctx.textBaseline='bottom';
  [0,6,12,18,23].forEach(i=>{const d=new Date(now-(23-i)*3600000);ctx.fillText(String(d.getHours()).padStart(2,'0')+'h',(i+0.5)*step,H);});
  ctx.textBaseline='alphabetic';ctx.textAlign='left';
  // Hover overlay
  if(hourlyJitterHoverIdx!==null&&hourlyJitterHoverIdx>=0&&hourlyJitterHoverIdx<24){
    const pt=pts[hourlyJitterHoverIdx];
    const x=pt.x;
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);
    ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=1;ctx.setLineDash([]);ctx.stroke();
    if(pt.v){
      ctx.beginPath();ctx.arc(x,pt.y,4,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
      const d=new Date(now-(23-hourlyJitterHoverIdx)*3600000);
      const label=`${Math.round(pt.v)} ms · ${String(d.getHours()).padStart(2,'0')}:00`;
      ctx.font='bold 10px Segoe UI';
      const tw=ctx.measureText(label).width;
      const bw=tw+14,bh=22,bx=Math.min(Math.max(x-bw/2,2),W-bw-2),by=Math.max(pt.y-34,4);
      ctx.fillStyle='rgba(20,20,20,.88)';
      ctx.beginPath();ctx.roundRect(bx,by,bw,bh,5);ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle='white';ctx.textAlign='left';ctx.textBaseline='middle';
      ctx.fillText(label,bx+7,by+bh/2);
      ctx.textBaseline='alphabetic';ctx.textAlign='left';
    }
  }
}

function initHourlyTooltips(){
  const c=document.getElementById('hourly-canvas');
  if(c&&!c.dataset.ttinit){
    c.dataset.ttinit='1';
    c.addEventListener('mousemove',e=>{
      const rect=c.getBoundingClientRect(),mx=(e.clientX-rect.left)*(c.width/rect.width);
      hourlyHoverIdx=Math.max(0,Math.min(23,Math.floor(mx/(c.width/24))));
      drawHourly(lastHourlyData);
    });
    c.addEventListener('mouseleave',()=>{hourlyHoverIdx=null;drawHourly(lastHourlyData);});
  }
  const j=document.getElementById('hourly-jitter-canvas');
  if(j&&!j.dataset.ttinit){
    j.dataset.ttinit='1';
    j.addEventListener('mousemove',e=>{
      const rect=j.getBoundingClientRect(),mx=(e.clientX-rect.left)*(j.width/rect.width);
      hourlyJitterHoverIdx=Math.max(0,Math.min(23,Math.floor(mx/(j.width/24))));
      drawHourlyJitter(lastHourlyData);
    });
    j.addEventListener('mouseleave',()=>{hourlyJitterHoverIdx=null;drawHourlyJitter(lastHourlyData);});
  }
}

function drawDailyPing(rows){
  const canvas=document.getElementById('hourly-canvas');
  if(!canvas)return;
  const W=canvas.offsetWidth||800,H=canvas.offsetHeight||72;
  if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);
  if(!rows||!rows.length)return;
  const valid=rows.filter(r=>r.avg_ms).map(r=>r.avg_ms);
  if(!valid.length)return;
  const n=rows.length,pad=6,lblH=12;
  const maxV=Math.max(...valid,CRIT)+20;
  const step=W/n;
  const yFor=v=>H-lblH-Math.round((v/maxV)*(H-pad-lblH))-pad;
  const pts=rows.map((r,i)=>({x:i*step+step/2,y:r.avg_ms?yFor(r.avg_ms):null,v:r.avg_ms,lbl:r.day?r.day.slice(5).split('-').reverse().join('.'):'' }));
  const lastV=valid[valid.length-1];
  const col=lastV>=CRIT?'#ef4444':lastV>=WARN?'#f59e0b':'#22c55e';
  const rgb=lastV>=CRIT?'239,68,68':lastV>=WARN?'245,158,11':'34,197,94';
  ctx.beginPath();ctx.moveTo(pts[0].x,H-lblH);
  pts.forEach(({x,y})=>ctx.lineTo(x,y!==null?y:H-lblH));
  ctx.lineTo(pts[pts.length-1].x,H-lblH);ctx.closePath();
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,`rgba(${rgb},.28)`);g.addColorStop(1,`rgba(${rgb},0.02)`);
  ctx.fillStyle=g;ctx.fill();
  ctx.beginPath();let first=true;
  pts.forEach(({x,y,v})=>{if(!v){first=true;return;}first?ctx.moveTo(x,y):ctx.lineTo(x,y);first=false;});
  ctx.strokeStyle=col;ctx.lineWidth=2;ctx.setLineDash([]);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.28)';ctx.font='8px Segoe UI';
  ctx.textAlign='center';ctx.textBaseline='bottom';
  pts.forEach(({x,lbl},i)=>{if(n<=7||i%Math.ceil(n/7)===0)ctx.fillText(lbl,x,H);});
  ctx.textBaseline='alphabetic';ctx.textAlign='left';
}

function drawDailyJitter(rows){
  const canvas=document.getElementById('hourly-jitter-canvas');
  if(!canvas)return;
  const W=canvas.offsetWidth||800,H=canvas.offsetHeight||72;
  if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);
  if(!rows||!rows.length)return;
  const valid=rows.filter(r=>r.avg_jitter).map(r=>r.avg_jitter);
  if(!valid.length)return;
  const n=rows.length,pad=6,lblH=12;
  const maxV=Math.max(...valid,30)+5;
  const step=W/n;
  const yFor=v=>H-lblH-Math.round((v/maxV)*(H-pad-lblH))-pad;
  const pts=rows.map((r,i)=>({x:i*step+step/2,y:r.avg_jitter?yFor(r.avg_jitter):null,v:r.avg_jitter,lbl:r.day?r.day.slice(5).split('-').reverse().join('.'):'' }));
  const lastV=valid[valid.length-1];
  const col=lastV>=20?'#ef4444':lastV>=10?'#f59e0b':'#22c55e';
  const rgb=lastV>=20?'239,68,68':lastV>=10?'245,158,11':'34,197,94';
  ctx.beginPath();ctx.moveTo(pts[0].x,H-lblH);
  pts.forEach(({x,y})=>ctx.lineTo(x,y!==null?y:H-lblH));
  ctx.lineTo(pts[pts.length-1].x,H-lblH);ctx.closePath();
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,`rgba(${rgb},.28)`);g.addColorStop(1,`rgba(${rgb},0.02)`);
  ctx.fillStyle=g;ctx.fill();
  ctx.beginPath();let first=true;
  pts.forEach(({x,y,v})=>{if(!v){first=true;return;}first?ctx.moveTo(x,y):ctx.lineTo(x,y);first=false;});
  ctx.strokeStyle=col;ctx.lineWidth=2;ctx.setLineDash([]);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.28)';ctx.font='8px Segoe UI';
  ctx.textAlign='center';ctx.textBaseline='bottom';
  pts.forEach(({x,lbl},i)=>{if(n<=7||i%Math.ceil(n/7)===0)ctx.fillText(lbl,x,H);});
  ctx.textBaseline='alphabetic';ctx.textAlign='left';
}
