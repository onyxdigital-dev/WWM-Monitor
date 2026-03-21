#!/usr/bin/env python3
# pip install websockets psutil requests
import asyncio, websockets, json, threading, time, sqlite3, re, subprocess, requests, psutil
from datetime import datetime
from collections import deque

WARN_MS=80; CRIT_MS=150; INTERVAL=2; SPIKE_THRESH=10; HISTORY=50
DB_FILE="wwm_ping.db"
LOG_FILE=f"ping_wwm_{datetime.now().strftime('%Y%m%d')}.log"
GAME_EXES=["wwm.exe","wherewsindsmeet.exe","wherewındsmeet-win64-shipping.exe"]

state = {
    'running':False,'pid':None,'exe':None,'server_ip':None,
    'geo_city':'','geo_country':'','geo_isp':'',
    'count':0,'lost':0,'sum':0,'min':99999,'max':0,
    'jitter_sum':0,'jitter_count':0,'spikes':0,'streak':0,
    'history':deque(maxlen=HISTORY),'last_ms':None,
    'last_spike':None,'is_spike':False,'prev_ms':None,
    'status':'Waiting for game...','session_id':None,
}

def init_db():
    c=sqlite3.connect(DB_FILE)
    c.execute("""CREATE TABLE IF NOT EXISTS pings(
        id INTEGER PRIMARY KEY AUTOINCREMENT,ts TEXT,session_id TEXT,
        server_ip TEXT,ping_ms INTEGER,status TEXT,jitter INTEGER)""")
    c.commit();c.close()

def save_ping(sid,ip,ms,st,j):
    c=sqlite3.connect(DB_FILE)
    c.execute("INSERT INTO pings VALUES(NULL,?,?,?,?,?,?)",
        (datetime.now().isoformat(),sid,ip,ms,st,j))
    c.commit();c.close()

def get_sessions():
    try:
        c=sqlite3.connect(DB_FILE);c.row_factory=sqlite3.Row
        rows=c.execute("""SELECT session_id,server_ip,COUNT(*) as total,
            AVG(CASE WHEN ping_ms>0 THEN ping_ms END) as avg,
            MIN(CASE WHEN ping_ms>0 THEN ping_ms END) as mn,
            MAX(CASE WHEN ping_ms>0 THEN ping_ms END) as mx,
            AVG(jitter) as jitter,
            SUM(CASE WHEN status='TIMEOUT' THEN 1 ELSE 0 END) as timeouts
            FROM pings GROUP BY session_id ORDER BY MIN(id) DESC LIMIT 20""").fetchall()
        c.close();return [dict(r) for r in rows]
    except:return []

def get_total_stats():
    try:
        c=sqlite3.connect(DB_FILE);c.row_factory=sqlite3.Row
        r=c.execute("""SELECT COUNT(*) as total,
            AVG(CASE WHEN ping_ms>0 THEN ping_ms END) as avg,
            MIN(CASE WHEN ping_ms>0 THEN ping_ms END) as mn,
            MAX(CASE WHEN ping_ms>0 THEN ping_ms END) as mx,
            SUM(CASE WHEN status='TIMEOUT' THEN 1 ELSE 0 END) as timeouts,
            COUNT(DISTINCT session_id) as sessions FROM pings""").fetchone()
        c.close();return dict(r) if r else None
    except:return None

def find_game():
    for p in psutil.process_iter(['pid','name']):
        try:
            if p.info['name'] and p.info['name'].lower() in GAME_EXES:
                return p.info['pid'],p.info['name']
        except:pass
    return None,None

def find_server_ip(pid):
    try:
        for c in psutil.Process(pid).net_connections('tcp'):
            if c.status=='ESTABLISHED' and c.raddr:
                ip=c.raddr.ip
                if not any(ip.startswith(x) for x in ['127.','0.0.','192.168.','10.','172.']):
                    return ip
    except:pass
    return None

def get_geo(ip):
    try:
        r=requests.get(f"http://ip-api.com/json/{ip}?fields=country,city,isp",timeout=5).json()
        return r.get('city',''),r.get('country',''),r.get('isp','')
    except:return '','',''

def ping_once(ip):
    try:
        out=subprocess.check_output(['ping','-n','1','-w','2000',ip],
            stderr=subprocess.DEVNULL,creationflags=0x08000000).decode('cp850',errors='ignore')
        m=re.search(r'(?:Zeit|time)[=<](\d+)\s*ms',out,re.IGNORECASE)
        if m:return int(m.group(1))
    except:pass
    return None

def monitor_loop():
    s=state
    while True:
        s.update({'running':False,'status':'Waiting for Where Winds Meet...'})
        pid,exe=None,None
        while not pid:
            pid,exe=find_game();time.sleep(2)
        s['pid']=pid;s['exe']=exe;s['status']='Scanning connections...'
        server_ip=None
        while not server_ip:
            server_ip=find_server_ip(pid)
            if not find_game()[0]:break
            time.sleep(2)
        if not server_ip:continue
        s['server_ip']=server_ip;s['status']='Fetching location...'
        city,country,isp=get_geo(server_ip)
        s.update({'geo_city':city,'geo_country':country,'geo_isp':isp,
                  'count':0,'lost':0,'sum':0,'min':99999,'max':0,
                  'jitter_sum':0,'jitter_count':0,'spikes':0,'streak':0,
                  'history':deque(maxlen=HISTORY),'last_ms':None,'prev_ms':None,
                  'last_spike':None,'running':True})
        sid=datetime.now().strftime('%Y%m%d_%H%M%S');s['session_id']=sid
        while True:
            if not find_game()[0]:break
            if s['count']>0 and s['count']%30==0:
                nip=find_server_ip(pid)
                if nip and nip!=server_ip:
                    server_ip=nip;s['server_ip']=nip
                    city,country,isp=get_geo(nip)
                    s['geo_city']=city;s['geo_country']=country;s['geo_isp']=isp
            ms=ping_once(server_ip)
            s['count']+=1;s['is_spike']=False
            if ms is None:
                s['lost']+=1;s['streak']+=1;s['last_ms']=None
                s['history'].append(None);s['status']='TIMEOUT'
                save_ping(sid,server_ip,-1,'TIMEOUT',0)
            else:
                s['sum']+=ms;s['min']=min(s['min'],ms);s['max']=max(s['max'],ms)
                s['history'].append(ms)
                if s['prev_ms'] is not None:
                    diff=abs(ms-s['prev_ms'])
                    s['jitter_sum']+=diff;s['jitter_count']+=1
                    if diff>SPIKE_THRESH:
                        s['spikes']+=1;s['is_spike']=True
                        s['last_spike']=(ms,datetime.now().strftime('%H:%M:%S'))
                s['prev_ms']=ms
                st='CRIT' if ms>=CRIT_MS else 'WARN' if ms>=WARN_MS else 'OK'
                s['streak']=s['streak']+1 if ms>=CRIT_MS else 0
                s['status']=st
                jitter=s['jitter_sum']//s['jitter_count'] if s['jitter_count']>0 else 0
                save_ping(sid,server_ip,ms,st,jitter)
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
    finally:
        CLIENTS.discard(ws)

async def broadcaster():
    global CLIENTS
    while True:
        await asyncio.sleep(2)
        if not CLIENTS: continue
        s=state
        hist=list(s['history'])
        payload=json.dumps({'type':'state','data':{
            'running':s['running'],'server_ip':s['server_ip'],
            'geo_city':s['geo_city'],'geo_country':s['geo_country'],
            'geo_isp':s['geo_isp'],'exe':s['exe'],'pid':s['pid'],
            'status':s['status'],'last_ms':s['last_ms'],
            'count':s['count'],'lost':s['lost'],'sum':s['sum'],
            'min':s['min'],'max':s['max'],
            'jitter_sum':s['jitter_sum'],'jitter_count':s['jitter_count'],
            'spikes':s['spikes'],'streak':s['streak'],
            'is_spike':s['is_spike'],'last_spike':s['last_spike'],
            'history':hist,'session_id':s['session_id'],
            'ts':datetime.now().strftime('%d.%m.%Y  %H:%M:%S'),
        }})
        dead=set()
        for ws in list(CLIENTS):
            try:await ws.send(payload)
            except:dead.add(ws)
        CLIENTS-=dead

async def main():
    global CLIENTS
    init_db()
    threading.Thread(target=monitor_loop,daemon=True).start()
    async with websockets.serve(handler, 'localhost', 7373):
        await broadcaster()

if __name__=='__main__':
    asyncio.run(main())
