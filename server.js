import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const CLIENT_ID = process.env.POLAR_CLIENT_ID;
const CLIENT_SECRET = process.env.POLAR_CLIENT_SECRET;
const SYNC_SECRET = process.env.SYNC_SECRET;
const DATA_DIR = path.join(__dirname, 'data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const DATA_FILE = path.join(DATA_DIR, 'polar.json');

const SCOPES = 'training_sessions:read training_targets:read profile:read sports:read';
const AUTH_URL = 'https://auth.polar.com/oauth/authorize';
const TOKEN_URL = 'https://auth.polar.com/oauth/token';
const API_BASE = 'https://www.polaraccesslink.com/v4/data';

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return fallback; }
}
async function writeJson(file, value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, file);
}
function b64url(s) { return Buffer.from(s).toString('base64url'); }
function randomState() { return b64url(crypto.randomBytes(32)); }
function isoDate(d) { return new Date(d).toISOString().slice(0,10); }
function addDays(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate()+n); return isoDate(x); }
function monday(d) { const x = new Date(d + 'T00:00:00Z'); const day=x.getUTCDay(); x.setUTCDate(x.getUTCDate()-(day===0?6:day-1)); return isoDate(x); }

function planWeek(weekIndex) {
  const start = addDays('2026-10-05', weekIndex * 7);
  const phase = weekIndex < 8 ? 'Basis' : weekIndex < 16 ? 'Aufbau' : weekIndex < 23 ? 'Marathonspezifisch' : 'Taper';
  const longKm = [14,16,18,14,20,22,18,24,20,26,22,28,24,30,22,30,24,30,26,32,24,30,28,32,24,18,12][weekIndex];
  const quality = [
    '6×800 m @ 4:10–4:20/km, 400 m traben', '3×2 km @ 4:30–4:35/km, 3 min locker', '10×1 min schnell / 1 min locker', 'Fahrtspiel 8×2 min zügig',
    '5×1 km @ 4:15–4:25/km, 2 min traben', '4×2 km @ 4:25–4:30/km, 3 min locker', '10×400 m @ 4:00–4:10/km, 200 m traben', '3×3 km @ 4:30/km, 3 min locker',
    '6×1 km @ 4:10–4:20/km, 2 min traben', '2×4 km @ 4:30/km, 4 min locker', '8×800 m @ 4:05–4:15/km, 400 m traben', '3×3 km @ 4:25–4:30/km, 3 min locker',
    '5×1.6 km @ 4:20–4:25/km, 3 min locker', '4×2 km @ 4:20–4:25/km, 3 min locker', '6×1 km @ 4:05–4:15/km, 2 min traben', '3×4 km @ 4:25/km, 4 min locker',
    '5×2 km @ 4:20–4:25/km, 3 min locker', '4×3 km @ 4:25/km, 3 min locker', '6×1 km @ 4:05–4:15/km, 2 min traben', '2×5 km @ 4:25/km, 5 min locker',
    '4×2 km @ 4:15–4:20/km, 3 min locker', '3×3 km @ 4:20–4:25/km, 3 min locker', '10×400 m @ 3:55–4:05/km, 200 m traben', '3×3 km @ 4:20–4:25/km, 3 min locker',
    '5×1 km @ 4:10–4:15/km, 2 min traben', '3×1 km @ 4:15/km, 2 min locker', '4×400 m locker-schnell, lange Pausen'
  ][weekIndex];
  let thu = '10–12 km locker @ 5:25–5:55/km';
  if (weekIndex >= 8 && weekIndex < 16) thu = '12–14 km, darin 6–8 km @ 5:00–5:15/km';
  if (weekIndex >= 16 && weekIndex < 23) thu = '12–16 km, darin 8–10 km @ 4:45–5:00/km';
  if (weekIndex === 23) thu = '14 km, darin 10 km @ 4:30–4:35/km';
  if (weekIndex === 24) thu = '12 km locker, darin 5 km @ 4:35–4:45/km';
  if (weekIndex === 25) thu = '9 km locker, 3 km @ 4:30–4:40/km';
  if (weekIndex === 26) thu = '6 km sehr locker + 4 Steigerungen';
  let sun = `${longKm} km langer Lauf @ 5:20–5:55/km`;
  if (weekIndex === 7) sun = '24 km, letzte 5 km @ 5:00/km';
  if (weekIndex === 9) sun = '26 km, letzte 8 km @ 5:00/km';
  if (weekIndex === 11) sun = '28 km, letzte 8 km @ 4:55–5:00/km';
  if (weekIndex === 13) sun = '30 km, letzte 10 km @ 4:50–5:00/km';
  if (weekIndex === 15) sun = '30 km, 12 km @ 4:45–4:50/km im letzten Drittel';
  if (weekIndex === 17) sun = '30 km, 10 km @ 4:40–4:45/km';
  if (weekIndex === 19) sun = '32 km: 8 km @ 5:15 + 10 km @ 4:45 + 10 km @ 4:30–4:35 + 4 km locker';
  if (weekIndex === 21) sun = '30 km, 12 km @ 4:35–4:45/km';
  if (weekIndex === 23) sun = '32 km, davon 10 km @ 4:30–4:35/km';
  if (weekIndex === 24) sun = '24 km locker, letzte 5 km moderat';
  if (weekIndex === 25) sun = '18 km locker';
  if (weekIndex === 26) sun = '12 km sehr locker';
  return { week: weekIndex+1, start, end:addDays(start,6), phase, sessions:[
    {id:`w${weekIndex}-tue`, day:'Di', date:addDays(start,1), type:'quality', title:'Qualität', detail:quality},
    {id:`w${weekIndex}-thu`, day:'Do', date:addDays(start,3), type:'easy', title:'Locker / Marathon', detail:thu},
    {id:`w${weekIndex}-sun`, day:'So', date:addDays(start,6), type:'long', title:'Langer Lauf', detail:sun}
  ]};
}
const PLAN = Array.from({length:27}, (_,i)=>planWeek(i));

async function polarToken() {
  const auth = await readJson(AUTH_FILE, null);
  if (!auth?.refresh_token) return null;
  if (auth.expires_at && Date.now() < auth.expires_at - 120000) return auth.access_token;
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({ grant_type:'refresh_token', refresh_token:auth.refresh_token });
  const r = await fetch(TOKEN_URL, {method:'POST', headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'}, body});
  if (!r.ok) throw new Error(`Polar token refresh failed (${r.status})`);
  const t = await r.json();
  await writeJson(AUTH_FILE, {...auth, ...t, expires_at:Date.now()+Number(t.expires_in||0)*1000});
  return t.access_token;
}
async function polarGet(endpoint, params={}) {
  const token = await polarToken();
  if (!token) throw new Error('POLAR_NOT_CONNECTED');
  const u = new URL(`${API_BASE}${endpoint}`);
  for (const [k,v] of Object.entries(params)) if (v != null) u.searchParams.append(k, v);
  const r = await fetch(u, {headers:{Accept:'application/json', Authorization:`Bearer ${token}`}});
  if (!r.ok) throw new Error(`Polar API ${r.status}: ${await r.text()}`);
  return r.json();
}

async function syncPolar() {
  const from = '2026-09-01';
  const to = addDays(isoDate(new Date()), 1);
  const sessions = await polarGet('/training-sessions/list', {from,to});
  const targets = await polarGet('/training-target/calendar-targets', {from,to}).catch(()=>({trainingTargets:[]}));
  const data = {syncedAt:new Date().toISOString(), sessions:sessions.trainingSessions||[], targets:targets.trainingTargets||[]};
  await writeJson(DATA_FILE, data);
  return data;
}

app.get('/api/config', async (req,res)=>{
  const auth = await readJson(AUTH_FILE, null);
  res.json({connected:!!auth?.refresh_token, baseUrl:BASE_URL, raceDate:'2027-04-11'});
});
app.get('/auth/polar', async (req,res)=>{
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).send('Polar ist noch nicht konfiguriert. Bitte .env ausfüllen.');
  const state=randomState();
  await writeJson(path.join(DATA_DIR,'oauth-state.json'), {state, expiresAt: Date.now()+10*60*1000});
  const u=new URL(AUTH_URL); u.searchParams.set('client_id',CLIENT_ID); u.searchParams.set('response_type','code'); u.searchParams.set('scope',SCOPES); u.searchParams.set('redirect_uri',`${BASE_URL}/auth/polar/callback`); u.searchParams.set('state',state);
  res.redirect(u.toString());
});
// Cookie fallback without cookie-parser: state is carried in signed-ish query by comparing to short-lived file.
app.get('/auth/polar/callback', async (req,res)=>{
  try {
    if (!req.query.code) return res.status(400).send('Kein Authorization Code von Polar erhalten.');
    const savedState=await readJson(path.join(DATA_DIR,'oauth-state.json'),null);
    if(!savedState || savedState.expiresAt<Date.now() || !req.query.state || req.query.state!==savedState.state) return res.status(400).send('Ungültiger OAuth State. Bitte die Polar-Verbindung erneut starten.');
    await fs.rm(path.join(DATA_DIR,'oauth-state.json'),{force:true});
    const basic=Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const body=new URLSearchParams({grant_type:'authorization_code',code:req.query.code,redirect_uri:`${BASE_URL}/auth/polar/callback`});
    const r=await fetch(TOKEN_URL,{method:'POST',headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},body});
    if(!r.ok) return res.status(502).send(`Polar Token-Austausch fehlgeschlagen (${r.status}).`);
    const t=await r.json();
    await writeJson(AUTH_FILE,{...t,expires_at:Date.now()+Number(t.expires_in||0)*1000,connectedAt:new Date().toISOString()});
    await syncPolar();
    res.redirect('/?connected=1');
  } catch(e) { res.status(500).send(e.message); }
});
app.post('/api/sync', async (req,res)=>{
  try { const data=await syncPolar(); res.json({ok:true,syncedAt:data.syncedAt,count:data.sessions.length}); }
  catch(e) { const code=e.message==='POLAR_NOT_CONNECTED'?401:500; res.status(code).json({ok:false,error:e.message}); }
});
app.get('/api/data', async (req,res)=>{
  const data=await readJson(DATA_FILE,{syncedAt:null,sessions:[],targets:[]});
  const auth=await readJson(AUTH_FILE,null);
  res.json({...data,connected:!!auth?.refresh_token,plan:PLAN});
});
app.post('/api/settings', async (req,res)=>{
  const old=await readJson(path.join(DATA_DIR,'settings.json'),{});
  const allowed=['maxHr','restHr','goalPace','targetMarathonHours'];
  const next={...old}; for(const k of allowed) if(req.body[k]!=null) next[k]=req.body[k];
  await writeJson(path.join(DATA_DIR,'settings.json'),next); res.json(next);
});
app.get('/api/settings',async(req,res)=>res.json(await readJson(path.join(DATA_DIR,'settings.json'),{maxHr:187,restHr:55,goalPace:4.5,targetMarathonHours:3.17})));
app.get('/api/cron/sync',async(req,res)=>{
  if(!SYNC_SECRET || req.query.secret!==SYNC_SECRET) return res.status(401).send('Unauthorized');
  try { const d=await syncPolar(); res.json({ok:true,syncedAt:d.syncedAt,count:d.sessions.length}); }
  catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.use((req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`Zürich Marathon Dashboard: ${BASE_URL}`));
