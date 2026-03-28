# pip install websockets psutil requests
import asyncio, websockets, json, threading, time, sqlite3, re, subprocess, requests, psutil, socket
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from collections import deque

WARN_MS=80; CRIT_MS=150; INTERVAL=2; SPIKE_THRESH=10; HISTORY=50
DB_FILE="wwm_ping.db"
DB_RETENTION_DAYS=30
LOG_FILE=f"ping_wwm_{datetime.now().strftime('%Y%m%d')}.log"
GAME_EXES=["wwm.exe","wherewsindsmeet.exe","where winds meet-win64-shipping.exe","wherewındsmeet-win64-shipping.exe"]

# Ports that belong to the real WWM game servers (not CDN/auth/analytics)
GAME_PORTS=[4000, 9080, 7000, 7001, 7002, 8000, 8001, 9000, 9001]
# Ports to always ignore (CDN, HTTPS, analytics)
IGNORE_PORTS=[443, 80, 8080, 8443]

# find_game() cache
_game_cache = {'pid': None, 'exe': None, 'ts': 0.0}
GAME_SCAN_INTERVAL = 10  # Sekunden zwischen vollen Prozess-Scans

state = {
    'running':False,'pid':None,'exe':None,'server_ip':None,'server_port':None,
    'geo_city':'','geo_country':'','geo_isp':'',
    'count':0,'lost':0,'sum':0,'min':99999,'max':0,
    'jitter_sum':0,'jitter_count':0,'spikes':0,'streak':0,
    'history':deque(maxlen=HISTORY),'last_ms':None,
    'last_spike':None,'is_spike':False,'prev_ms':None,
    'status':'Waiting for game...','session_id':None,
    'connected_since':None,
    'router_ms':None,'dns_ms':None,'router_ip':None,
    'jitter_history':deque(maxlen=HISTORY),
    'hops':[],'hop_changed':False,
}

# --- DB ---
_db_conn = None
_db_lock = threading.Lock()

# --- State lock: protects deques and hop_changed across monitor thread / async broadcaster ---
_state_lock = threading.Lock()

# --- Thread pool for parallel router/DNS pings (avoids per-tick thread creation) ---
_ping_executor = ThreadPoolExecutor(max_workers=2)

# --- Router IP retry limit: stop calling ipconfig every tick if gateway is unreachable ---
_ROUTER_MAX_FAILS = 3
_router_fail_count = 0

def get_db():
    global _db_conn
    if _db_conn is None:
        _db_conn = sqlite3.connect(DB_FILE, check_same_thread=False)
        _db_conn.row_factory = sqlite3.Row
    return _db_conn

def init_db():
    with _db_lock:
        c = get_db()
        c.execute("""CREATE TABLE IF NOT EXISTS pings(
            id INTEGER PRIMARY KEY AUTOINCREMENT,ts TEXT,session_id TEXT,
            server_ip TEXT,ping_ms INTEGER,status TEXT,jitter INTEGER,
            router_ms INTEGER,dns_ms INTEGER)""")
        c.execute("""CREATE TABLE IF NOT EXISTS server_switches(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            switched_at TEXT,from_ip TEXT,to_ip TEXT,
            duration_seconds INTEGER,session_id TEXT)""")
        c.execute("""CREATE TABLE IF NOT EXISTS events(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT,label TEXT,session_id TEXT,ping_ms INTEGER)""")
        try:
            c.execute("ALTER TABLE pings ADD COLUMN router_ms INTEGER")
            c.execute("ALTER TABLE pings ADD COLUMN dns_ms INTEGER")
        except Exception as e:
            print(f'[db] migrate: {e}')
        # Performance-Indizes
        c.execute("CREATE INDEX IF NOT EXISTS idx_pings_ts         ON pings(ts)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_pings_session_id ON pings(session_id)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_pings_status     ON pings(status)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_events_ts        ON events(ts)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_switches_ts      ON server_switches(switched_at)")
        c.commit()

def cleanup_old_data():
    cutoff = (datetime.now() - timedelta(days=DB_RETENTION_DAYS)).isoformat()
    with _db_lock:
        db = get_db()
        db.execute("DELETE FROM pings WHERE ts < ?", (cutoff,))
        db.execute("DELETE FROM events WHERE ts < ?", (cutoff,))
        db.execute("DELETE FROM server_switches WHERE switched_at < ?", (cutoff,))
        db.commit()
    # VACUUM in a separate connection — it's a full DB rewrite and must not hold the shared lock
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.execute("VACUUM")
        conn.close()
    except Exception as e:
        print(f'[cleanup] VACUUM error: {e}')

def cleanup_loop():
    while True:
        try:
            cleanup_old_data()
        except Exception as e:
            print(f'[cleanup] error: {e}')
        time.sleep(86400)

def save_ping(sid,ip,ms,st,j,router_ms=None,dns_ms=None):
    with _db_lock:
        get_db().execute("INSERT INTO pings VALUES(NULL,?,?,?,?,?,?,?,?)",
            (datetime.now().isoformat(),sid,ip,ms,st,j,router_ms,dns_ms))
        get_db().commit()

def save_switch(sid,from_ip,to_ip,duration_seconds):
    with _db_lock:
        get_db().execute("INSERT INTO server_switches VALUES(NULL,?,?,?,?,?)",
            (datetime.now().isoformat(),from_ip,to_ip,duration_seconds,sid))
        get_db().commit()

def get_sessions():
    try:
        with _db_lock:
            rows=get_db().execute("""SELECT session_id,
                GROUP_CONCAT(DISTINCT server_ip) as server_ip,
                COUNT(*) as total,
                AVG(CASE WHEN ping_ms>0 THEN ping_ms END) as avg,
                MIN(CASE WHEN ping_ms>0 THEN ping_ms END) as mn,
                MAX(CASE WHEN ping_ms>0 THEN ping_ms END) as mx,
                AVG(jitter) as jitter,
                SUM(CASE WHEN status='TIMEOUT' THEN 1 ELSE 0 END) as timeouts,
                SUM(CASE WHEN jitter > ? THEN 1 ELSE 0 END) as spikes
                FROM pings GROUP BY session_id ORDER BY MIN(id) DESC LIMIT 20""",
                (SPIKE_THRESH,)).fetchall()
        return [dict(r) for r in rows]
    except Exception as e:
        print(f'[db] get_sessions: {e}')
        return []

def get_total_stats():
    try:
        with _db_lock:
            r=get_db().execute("""SELECT COUNT(*) as total,
                AVG(CASE WHEN ping_ms>0 THEN ping_ms END) as avg,
                MIN(CASE WHEN ping_ms>0 THEN ping_ms END) as mn,
                MAX(CASE WHEN ping_ms>0 THEN ping_ms END) as mx,
                SUM(CASE WHEN status='TIMEOUT' THEN 1 ELSE 0 END) as timeouts,
                COUNT(DISTINCT session_id) as sessions,
                AVG(CASE WHEN jitter IS NOT NULL THEN jitter END) as jitter,
                SUM(CASE WHEN jitter > ? THEN 1 ELSE 0 END) as spikes
                FROM pings""", (SPIKE_THRESH,)).fetchone()
        return dict(r) if r else None
    except Exception as e:
        print(f'[db] get_total_stats: {e}')
        return None

def get_server_switches():
    try:
        with _db_lock:
            rows=get_db().execute("""SELECT switched_at,from_ip,to_ip,duration_seconds,session_id
                FROM server_switches ORDER BY id DESC LIMIT 50""").fetchall()
        return [dict(r) for r in rows]
    except Exception as e:
        print(f'[db] get_server_switches: {e}')
        return []

def get_hourly_stats():
    try:
        with _db_lock:
            rows=get_db().execute("""
                SELECT strftime('%Y-%m-%d %H:00', ts) as hour,
                    AVG(CASE WHEN ping_ms>0 THEN ping_ms END) as avg_ms,
                    COUNT(*) as total,
                    SUM(CASE WHEN status='TIMEOUT' THEN 1 ELSE 0 END) as timeouts
                FROM pings
                WHERE ts >= datetime('now','-24 hours')
                GROUP BY hour ORDER BY hour
            """).fetchall()
        return [dict(r) for r in rows]
    except Exception as e:
        print(f'[db] get_hourly_stats: {e}')
        return []

def export_csv(sid=None):
    try:
        with _db_lock:
            if sid:
                rows=get_db().execute("SELECT * FROM pings WHERE session_id=? ORDER BY id",(sid,)).fetchall()
            else:
                rows=get_db().execute("SELECT * FROM pings ORDER BY id").fetchall()
        lines=["id,ts,session_id,server_ip,ping_ms,status,jitter,router_ms,dns_ms"]
        for r in rows:
            d=dict(r)
            lines.append(f"{d['id']},{d['ts']},{d['session_id']},{d['server_ip']},{d['ping_ms']},{d['status']},{d['jitter']},{d.get('router_ms','')},{d.get('dns_ms','')}")
        return "\n".join(lines)
    except Exception as e:
        print(f'[db] export_csv: {e}')
        return ""

def find_game():
    """
    Gibt (pid, exe) zurueck.
    Macht nur alle GAME_SCAN_INTERVAL Sekunden einen echten Prozess-Scan.
    Dazwischen wird nur geprueft ob die gecachte PID noch lebt.
    """
    global _game_cache
    now = time.monotonic()

    # Cache-Treffer: PID noch bekannt und noch am Leben
    if _game_cache['pid'] and (now - _game_cache['ts']) < GAME_SCAN_INTERVAL:
        if psutil.pid_exists(_game_cache['pid']):
            return _game_cache['pid'], _game_cache['exe']
        else:
            # Prozess gestorben -> Cache sofort invalidieren
            _game_cache = {'pid': None, 'exe': None, 'ts': 0.0}
            return None, None

    # Voller Scan
    _game_cache['ts'] = now
    for p in psutil.process_iter(['pid', 'name']):
        try:
            if p.info['name'] and p.info['name'].lower() in GAME_EXES:
                _game_cache['pid'] = p.info['pid']
                _game_cache['exe'] = p.info['name']
                return _game_cache['pid'], _game_cache['exe']
        except Exception:
            pass

    _game_cache['pid'] = None
    _game_cache['exe'] = None
    return None, None

def _is_private_ip(ip):
    return any(ip.startswith(x) for x in ['127.','0.0.','192.168.','10.','172.'])

def find_server_ip(pid):
    """
    Returns (ip, port) of the real WWM game server connection.
    Priority order:
      1. Known game ports (GAME_PORTS) — most likely the real server
      2. Any other non-private, non-ignored port
    Ignores IGNORE_PORTS (443, 80, etc.) which are CDN/auth/analytics.
    """
    try:
        conns = [
            c for c in psutil.Process(pid).net_connections('tcp')
            if c.status == 'ESTABLISHED' and c.raddr and not _is_private_ip(c.raddr.ip)
        ]

        # Pass 1: prefer known game ports
        for c in conns:
            if c.raddr.port in GAME_PORTS:
                return c.raddr.ip, c.raddr.port

        # Pass 2: fallback — any non-ignored port
        for c in conns:
            if c.raddr.port not in IGNORE_PORTS:
                return c.raddr.ip, c.raddr.port

    except Exception:
        pass
    return None, None

def get_router_ip():
    try:
        out=subprocess.check_output(['ipconfig'],creationflags=0x08000000).decode('cp850',errors='ignore')
        gw_section=re.search(r'(?:Standardgateway|Default Gateway)[^:]*:(.*?)(?:\r?\n\S|\Z)',out,re.DOTALL)
        if gw_section:
            ipv4=re.search(r'(\d{1,3}(?:\.\d{1,3}){3})',gw_section.group(1))
            if ipv4 and ipv4.group(1)!='0.0.0.0':return ipv4.group(1)
    except Exception:
        pass
    return None

def get_geo(ip):
    try:
        r=requests.get(f"http://ip-api.com/json/{ip}?fields=country,city,isp,lat,lon",timeout=5).json()
        return r.get('city',''),r.get('country',''),r.get('isp',''),r.get('lat',0),r.get('lon',0)
    except Exception:
        return '','','',0,0

def ping_tcp(ip, port, timeout=2):
    """Measure latency via TCP connect. Works even when ICMP is blocked."""
    try:
        s=socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        start=time.perf_counter()
        s.connect((ip, port))
        ms=int((time.perf_counter()-start)*1000)
        s.close()
        return ms if ms > 0 else 1
    except Exception:
        return None

def ping_icmp(ip):
    """Standard ICMP ping. Used for router and DNS latency."""
    try:
        out=subprocess.check_output(['ping','-n','1','-w','2000',ip],
            stderr=subprocess.DEVNULL,creationflags=0x08000000).decode('cp850',errors='ignore')
        m=re.search(r'(?:Zeit|time)[=<](\d+)\s*ms',out,re.IGNORECASE)
        if m:return int(m.group(1))
        if re.search(r'(?:Zeit|time)<1ms',out,re.IGNORECASE):return 1
    except Exception:
        pass
    return None

def ping_once(ip, port=None):
    """Use TCP ping for game server (port given), ICMP for router/DNS."""
    if port:
        return ping_tcp(ip, port)
    return ping_icmp(ip)

def get_hops(ip):
    hops=[]
    try:
        out=subprocess.check_output(['tracert','-h','10','-w','500',ip],
            stderr=subprocess.DEVNULL,creationflags=0x08000000,timeout=30).decode('cp850',errors='ignore')
        for line in out.splitlines():
            m=re.search(r'(\d+\.\d+\.\d+\.\d+)',line)
            if m:hops.append(m.group(1))
    except Exception:
        pass
    return hops

def monitor_loop():
    global _router_fail_count
    s=state
    router_ip=get_router_ip()
    s['router_ip']=router_ip
    while True:
        s.update({'running':False,'status':'Waiting for Where Winds Meet...','connected_since':None})
        pid,exe=None,None
        while not pid:
            pid,exe=find_game();time.sleep(2)
        s['pid']=pid;s['exe']=exe;s['status']='Scanning connections...'
        server_ip=None; server_port=None
        while not server_ip:
            server_ip,server_port=find_server_ip(pid)
            if not find_game()[0]:break
            time.sleep(2)
        if not server_ip:continue
        s['server_ip']=server_ip;s['server_port']=server_port
        s['status']='Fetching location...'
        city,country,isp,lat,lon=get_geo(server_ip)
        s.update({'geo_city':city,'geo_country':country,'geo_isp':isp,
            'geo_lat':lat,'geo_lon':lon,
            'count':0,'lost':0,'sum':0,'min':99999,'max':0,
            'jitter_sum':0,'jitter_count':0,'spikes':0,'streak':0,
            'history':deque(maxlen=HISTORY),'jitter_history':deque(maxlen=HISTORY),
            'last_ms':None,'prev_ms':None,'router_ms':None,'dns_ms':None,
            'last_spike':None,'running':True,'hops':[],'hop_changed':False})
        sid=datetime.now().strftime('%Y%m%d_%H%M%S');s['session_id']=sid
        s['connected_since']=datetime.now().isoformat()
        ip_connected_since=datetime.now()
        def do_tracert():
            h=get_hops(server_ip)
            s['hops']=h
        threading.Thread(target=do_tracert,daemon=True).start()
        while True:
            if not find_game()[0]:break
            if s['count']>0 and s['count']%10==0:
                nip,nport=find_server_ip(pid)
                if nip and nip!=server_ip:
                    duration=int((datetime.now()-ip_connected_since).total_seconds())
                    save_switch(sid,server_ip,nip,duration)
                    old_hops=list(s['hops'])
                    server_ip=nip;server_port=nport
                    s['server_ip']=nip;s['server_port']=nport
                    city,country,isp,lat,lon=get_geo(nip)
                    s['geo_city']=city;s['geo_country']=country;s['geo_isp']=isp
                    s['geo_lat']=lat;s['geo_lon']=lon
                    ip_connected_since=datetime.now()
                    s['connected_since']=datetime.now().isoformat()
                    def do_retracert():
                        new_hops=get_hops(nip)
                        with _state_lock:
                            s['hop_changed']=(new_hops!=old_hops)
                            s['hops']=new_hops
                    threading.Thread(target=do_retracert,daemon=True).start()

            # Router IP: stop retrying ipconfig after repeated failures
            _rip = s.get('router_ip')
            if _rip is None and _router_fail_count < _ROUTER_MAX_FAILS:
                _rip = get_router_ip()
                if _rip:
                    s['router_ip'] = _rip
                    _router_fail_count = 0
                else:
                    _router_fail_count += 1

            # Parallel router/DNS pings via thread pool (no per-tick thread creation)
            def _do_router(_ip=_rip):
                return ping_once(_ip) if _ip else None
            def _do_dns():
                return ping_once('8.8.8.8')

            fut_r = _ping_executor.submit(_do_router)
            fut_d = _ping_executor.submit(_do_dns)

            ms=ping_once(server_ip, port=server_port)

            try: r_ms=fut_r.result(timeout=3)
            except Exception: r_ms=None
            try: d_ms=fut_d.result(timeout=3)
            except Exception: d_ms=None

            s['router_ms']=r_ms;s['dns_ms']=d_ms

            s['count']+=1;s['is_spike']=False
            if ms is None:
                s['lost']+=1;s['streak']+=1;s['last_ms']=None
                with _state_lock:
                    s['history'].append(None)
                s['status']='TIMEOUT'
                save_ping(sid,server_ip,-1,'TIMEOUT',0,r_ms,d_ms)
            else:
                s['sum']+=ms;s['min']=min(s['min'],ms);s['max']=max(s['max'],ms)
                jitter=0
                if s['prev_ms'] is not None:
                    diff=abs(ms-s['prev_ms'])
                    s['jitter_sum']+=diff;s['jitter_count']+=1
                    jitter=diff
                    if diff>SPIKE_THRESH:
                        s['spikes']+=1;s['is_spike']=True
                        s['last_spike']=(ms,datetime.now().strftime('%H:%M:%S'))
                with _state_lock:
                    s['history'].append(ms)
                    s['jitter_history'].append(jitter)
                s['prev_ms']=ms
                st='CRIT' if ms>=CRIT_MS else 'WARN' if ms>=WARN_MS else 'OK'
                s['streak']=s['streak']+1 if ms>=CRIT_MS else 0
                s['status']=st
                j=s['jitter_sum']//s['jitter_count'] if s['jitter_count']>0 else 0
                save_ping(sid,server_ip,ms,st,j,r_ms,d_ms)
            s['last_ms']=ms;time.sleep(INTERVAL)

CLIENTS=set()

async def handler(ws):
    global CLIENTS
    CLIENTS.add(ws)
    try:
        async for msg in ws:
            data=json.loads(msg)
            if data.get('type')=='get_sessions':
                await ws.send(json.dumps({'type':'sessions','data':get_sessions(),'stats':get_total_stats()}))
            if data.get('type')=='get_switches':
                await ws.send(json.dumps({'type':'switches','data':get_server_switches()}))
            if data.get('type')=='export_csv':
                csv=export_csv(data.get('session_id'))
                await ws.send(json.dumps({'type':'csv_data','csv':csv}))
            if data.get('type')=='settings':
                global INTERVAL, WARN_MS, CRIT_MS
                pi=data.get('pingInterval')
                if pi in (1,2,5):
                    INTERVAL=int(pi)
                wm=data.get('warnMs')
                if wm and 20<=int(wm)<=500:
                    WARN_MS=int(wm)
                cm=data.get('critMs')
                if cm and 20<=int(cm)<=1000:
                    CRIT_MS=int(cm)
            if data.get('type')=='get_hourly':
                await ws.send(json.dumps({'type':'hourly','data':get_hourly_stats()}))
            if data.get('type')=='reset_session':
                s=state
                if s.get('running') and s.get('server_ip'):
                    with _state_lock:
                        s.update({
                            'count':0,'lost':0,'sum':0,'min':99999,'max':0,
                            'jitter_sum':0,'jitter_count':0,'spikes':0,'streak':0,
                            'history':deque(maxlen=HISTORY),'jitter_history':deque(maxlen=HISTORY),
                            'last_ms':None,'prev_ms':None,
                            'last_spike':None,'is_spike':False,
                        })
                    s['session_id']=datetime.now().strftime('%Y%m%d_%H%M%S')
                    s['connected_since']=datetime.now().isoformat()
                await ws.send(json.dumps({'type':'session_reset'}))
    finally:
        CLIENTS.discard(ws)

async def broadcaster():
    global CLIENTS
    while True:
        await asyncio.sleep(2)
        if not CLIENTS:continue
        s=state
        # Snapshot deques and reset hop_changed atomically under the state lock
        with _state_lock:
            hist=list(s['history'])
            jitter_hist=list(s['jitter_history'])
            hop_changed=s['hop_changed']
            s['hop_changed']=False
        payload=json.dumps({'type':'state','data':{
            'running':s['running'],'server_ip':s['server_ip'],
            'geo_city':s['geo_city'],'geo_country':s['geo_country'],
            'geo_isp':s['geo_isp'],'geo_lat':s.get('geo_lat',0),'geo_lon':s.get('geo_lon',0),
            'exe':s['exe'],'pid':s['pid'],
            'status':s['status'],'last_ms':s['last_ms'],
            'router_ms':s['router_ms'],'dns_ms':s['dns_ms'],'router_ip':s.get('router_ip'),
            'count':s['count'],'lost':s['lost'],'sum':s['sum'],
            'min':s['min'],'max':s['max'],
            'jitter_sum':s['jitter_sum'],'jitter_count':s['jitter_count'],
            'spikes':s['spikes'],'streak':s['streak'],
            'is_spike':s['is_spike'],'last_spike':s['last_spike'],
            'history':hist,'jitter_history':jitter_hist,
            'session_id':s['session_id'],'connected_since':s['connected_since'],
            'hops':s['hops'],'hop_changed':hop_changed,
            'ts':datetime.now().strftime('%d.%m.%Y %H:%M:%S'),
        }})
        dead=set()
        for ws in list(CLIENTS):
            try:await ws.send(payload)
            except Exception:dead.add(ws)
        CLIENTS-=dead

async def main():
    global CLIENTS
    init_db()
    threading.Thread(target=cleanup_loop, daemon=True).start()
    threading.Thread(target=monitor_loop, daemon=True).start()
    async with websockets.serve(handler,'localhost',7373):
        await broadcaster()

if __name__=='__main__':
    asyncio.run(main()
)
