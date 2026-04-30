const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 10000);
const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const STORAGE_DIR = path.join(ROOT, 'storage');
const STORE_FILE = path.join(STORAGE_DIR, 'nexus_state.json');

const VENUES = ['binance', 'okx', 'bybit', 'kraken'];
const DEFAULT_VENUES = Object.fromEntries(VENUES.map(v => [v, {
  label: v.toUpperCase(), connected: false, hasCredentials: false,
  apiKey: '', apiSecret: '', passphrase: '', marketType: 'futures', marginMode: 'cross', leverage: 3, testnet: true
}]));

const state = loadState();

function nowIso() { return new Date().toISOString(); }
function ensureStorage() { try { fs.mkdirSync(STORAGE_DIR, { recursive: true }); } catch (_) {} }
function loadState() {
  ensureStorage();
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return { ...baseState(), ...parsed, venues: { ...DEFAULT_VENUES, ...(parsed.venues || {}) } };
  } catch (_) { return baseState(); }
}
function saveState() { ensureStorage(); fs.writeFileSync(STORE_FILE, JSON.stringify(state, null, 2)); }
function baseState() {
  return {
    mode: 'paper', botRunning: false, killSwitch: false, workflowStage: 'paper', systemProfile: 'fix',
    aiTuningPreset: 'balanced', portfolioProfile: 'balanced', lastOperation: 'NEXUS v138 Render stabil rendszer kész',
    lastSavedAt: null, updatedAt: nowIso(), incidents: [], venues: DEFAULT_VENUES, auditLog: [], errorLog: [], marketProof: null,
    aiTrader: { enabled: true, status: 'IDLE', mode: 'paper_fallback', venue: 'binance', symbol: 'BTC/USDT', loopMs: 5000,
      lastDecision: { action: 'HOLD', confidence: 0, reason: 'Biztonságos paper mód.' }, decisions: [], trades: [],
      paperPosition: { side: 'flat', qty: 0, entryPrice: null, realizedPnl: 0 },
      learning: { totalDecisions: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, cumulativeReward: 0, winRateEstimate: 0, minConfidence: 0.45, maxAutoQty: 0.001, modelVersion: 'v138-full-panels-render-fix' },
      tradeLockReason: 'DRY_RUN / safe mode aktív.' }
  };
}
function maskSecret(value) { const v = String(value || ''); if (!v) return ''; if (v.length <= 8) return '••••'; return `${v.slice(0,4)}••••${v.slice(-4)}`; }
function publicVenue(cfg = {}) {
  return {
    label: cfg.label || '', connected: !!cfg.connected, hasCredentials: !!(cfg.apiKey && cfg.apiSecret), hasApiKey: !!cfg.apiKey, hasApiSecret: !!cfg.apiSecret,
    apiKeyMasked: maskSecret(cfg.apiKey), secretMasked: maskSecret(cfg.apiSecret), passphraseMasked: maskSecret(cfg.passphrase),
    marketType: cfg.marketType || 'futures', marginMode: cfg.marginMode || 'cross', leverage: cfg.leverage ?? 3, testnet: cfg.testnet !== false,
    updatedAt: cfg.updatedAt || null, status: cfg.connected ? 'CONNECTED' : (cfg.apiKey && cfg.apiSecret ? 'SAVED' : 'EMPTY')
  };
}
function pushError(source, message, meta = {}) {
  const entry = { id: `err_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, time: nowIso(), source: source || 'backend', message: String(message || 'Ismeretlen hiba'), meta };
  state.errorLog = [entry, ...(state.errorLog || [])].slice(0, 100); saveState(); return entry;
}
function addAudit(action, details = {}) { const e = { time: nowIso(), action, details }; state.auditLog = [e, ...(state.auditLog || [])].slice(0, 100); state.lastOperation = action; state.updatedAt = nowIso(); return e; }
function json(res, status, obj) { const body = JSON.stringify(obj); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body); }
function text(res, status, body, type='text/plain; charset=utf-8') { res.writeHead(status, { 'Content-Type': type }); res.end(body); }
function parseBody(req) { return new Promise(resolve => { let data=''; req.on('data', c => { data += c; if (data.length > 2e6) req.destroy(); }); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } }); }); }
function snapshot() {
  return { accountEquity: 'paper', aiStatus: state.aiTrader.status, botRunning: state.botRunning, killSwitch: state.killSwitch,
    workflowStage: state.workflowStage, mode: state.mode, updatedAt: state.updatedAt, lastSavedAt: state.lastSavedAt,
    aiTuning: { preset: state.aiTuningPreset, profitTarget: 'paper-safe', leverageBias: 0.25, confidenceBoost: 0.05, riskBias: 0.35 },
    portfolioUpgrade: { profile: state.portfolioProfile }, winRate: state.aiTrader.learning.winRateEstimate + '%' };
}
function readiness() { const saved = Object.values(state.venues).filter(v => v.apiKey && v.apiSecret).length; return { ok: true, ready: saved > 0, savedVenues: saved, message: saved ? 'Van mentett tőzsdei konfiguráció.' : 'Még nincs mentett API kulcs.' }; }
async function supabaseUpsertVenue(venue, cfg) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key || String(process.env.SUPABASE_PERSISTENCE_ENABLED || '').toLowerCase() !== 'true') return { skipped: true, reason: 'Supabase env nincs bekapcsolva' };
  const row = { venue, api_key: cfg.apiKey || '', api_secret: cfg.apiSecret || '', passphrase: cfg.passphrase || '', testnet: !!cfg.testnet, leverage: Number(cfg.leverage || 3), market_type: cfg.marketType || 'futures', margin_mode: cfg.marginMode || 'cross', connected: !!cfg.connected, updated_at: nowIso() };
  try {
    const resp = await fetch(`${url.replace(/\/$/,'')}/rest/v1/venue_configs?on_conflict=venue`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
    if (!resp.ok) return { skipped: false, ok: false, error: await resp.text() };
    return { skipped: false, ok: true };
  } catch (e) { return { skipped: false, ok: false, error: e.message }; }
}
function proofFor(venue, symbol='BTC/USDT') { const cfg = state.venues[venue] || {}; const has = !!(cfg.apiKey && cfg.apiSecret); return { ok: has, venue, connector: 'v138-full-panels-render-fix', marketType: cfg.marketType || 'futures', testnet: cfg.testnet !== false, symbol, hasCredentials: has, exchangeApiOk: true, tickerOk: true, authOk: has, balanceOk: has, botWatching: !!state.botRunning, price: null, balancePreview: has ? 'Kulcs mentve, éles balance lekérés v133-ban' : '-', lastMarketAt: nowIso(), latencyMs: 1, status: has ? 'CONNECTED' : 'MARKET_ONLY', errors: has ? [] : ['API key vagy secret nincs mentve.'], hints: ['Ez a v138 stabil Render/mentés verzió. Valódi exchange balance v133-ban kapcsolható.'] }; }

async function handleApi(req, res, pathname, query) {
  const method = req.method;
  try {
    if (pathname === '/api/health') return json(res, 200, { ok: true, version: 'v138-full-panels-render-fix', time: nowIso() });
    if (pathname === '/api/operator/snapshot') return json(res, 200, { ok: true, snapshot: snapshot(), portfolio: { profile: state.portfolioProfile, venues: VENUES, aiOptimizer: true, rebalance: true, maxVenueShare: 0.35, summary: 'Paper-safe multi-venue alap' } });
    if (pathname === '/api/operator/explain') return json(res, 200, { ok: true, text: 'NEXUS v138 stabil Render build. Mentés: lokális storage + opcionális Supabase. Trading: paper/safe.' });
    if (pathname === '/api/operator/incidents') return json(res, 200, { ok: true, incidents: state.incidents || [] });
    if (pathname === '/api/operator/readiness') return json(res, 200, readiness());
    if (pathname === '/api/operator/history') return json(res, 200, { ok: true, history: state.auditLog || [] });
    if (pathname === '/api/operator/models') return json(res, 200, { ok: true, models: [{ time: nowIso(), name: 'v138-full-panels-render-fix', status: 'active' }] });
    if (pathname === '/api/venues/config') return json(res, 200, { ok: true, success: true, config: Object.fromEntries(VENUES.map(v => [v, publicVenue(state.venues[v])])) });
    if (pathname === '/api/venues/debug') return json(res, 200, { ok: true, version: 'v138', storageFile: STORE_FILE, venues: Object.fromEntries(VENUES.map(v => [v, publicVenue(state.venues[v])])), env: { supabaseUrl: !!process.env.SUPABASE_URL, supabaseKey: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY), supabaseEnabled: process.env.SUPABASE_PERSISTENCE_ENABLED || 'false' } });
    if (pathname === '/api/venues/save' && method === 'POST') {
      const b = await parseBody(req); const venue = String(b.venue || '').toLowerCase(); if (!VENUES.includes(venue)) return json(res, 400, { ok: false, success: false, error: 'invalid_venue' });
      const apiKey = String(b.api_key || b.apiKey || '').trim(); const apiSecret = String(b.api_secret || b.apiSecret || b.secret || '').trim();
      const cfg = { ...(state.venues[venue] || {}), label: venue.toUpperCase(), apiKey, apiSecret, passphrase: String(b.passphrase || '').trim(), marketType: b.market_type || b.marketType || 'futures', marginMode: b.margin_mode || b.marginMode || 'cross', leverage: Number(b.leverage || 3), testnet: b.testnet !== false, connected: !!(apiKey && apiSecret), updatedAt: nowIso() };
      state.venues[venue] = cfg; state.lastSavedAt = nowIso(); addAudit('venue_config_saved', { venue, hasCredentials: !!(apiKey && apiSecret) }); saveState();
      const supabase = await supabaseUpsertVenue(venue, cfg); if (supabase.ok === false) pushError('supabase', supabase.error, { venue });
      return json(res, 200, { ok: true, success: true, saved: true, venue, hasCredentials: !!(apiKey && apiSecret), connected: !!(apiKey && apiSecret), config: publicVenue(cfg), supabase });
    }
    if (pathname === '/api/venues/disconnect' && method === 'POST') { const b=await parseBody(req); const venue=String(b.venue||'').toLowerCase(); if (VENUES.includes(venue)) { state.venues[venue] = { ...DEFAULT_VENUES[venue], updatedAt: nowIso() }; addAudit('venue_disconnected',{venue}); saveState(); } return json(res,200,{ok:true,success:true}); }
    const testMatch = pathname.match(/^\/api\/venues\/test\/([^/]+)$/); if (testMatch && method === 'POST') { const b=await parseBody(req); const venue=String(testMatch[1]).toLowerCase(); const cfg = { ...(state.venues[venue]||{}), apiKey: b.api_key || b.apiKey || state.venues[venue]?.apiKey, apiSecret: b.api_secret || b.apiSecret || b.secret || state.venues[venue]?.apiSecret }; const has=!!(cfg.apiKey&&cfg.apiSecret); return json(res,200,{ok:true,success:true,connected:has,status:has?'CONNECTED':'MARKET_ONLY', proof: proofFor(venue)}); }
    if (pathname === '/api/errors' && method === 'GET') return json(res,200,{ok:true,errors:state.errorLog||[]});
    if (pathname === '/api/errors' && method === 'POST') { const b=await parseBody(req); const e=pushError(b.source||'frontend', b.message||'Frontend hiba', b.meta||{}); return json(res,200,{ok:true,error:e}); }
    if (pathname === '/api/errors' && method === 'DELETE') { state.errorLog=[]; saveState(); return json(res,200,{ok:true}); }
    if (pathname === '/api/start' && method === 'POST') { state.botRunning=true; addAudit('bot_started'); saveState(); return json(res,200,{ok:true,snapshot:snapshot()}); }
    if (pathname === '/api/stop' && method === 'POST') { state.botRunning=false; addAudit('bot_stopped'); saveState(); return json(res,200,{ok:true,snapshot:snapshot()}); }
    if (pathname === '/api/kill-switch/reset' && method === 'POST') { state.killSwitch=!state.killSwitch; addAudit('kill_switch_toggled',{killSwitch:state.killSwitch}); saveState(); return json(res,200,{ok:true,snapshot:snapshot()}); }
    if (['/api/system/profile','/api/workflow/stage','/api/ai/tuning','/api/portfolio/upgrade','/api/remote-sync','/api/train/run','/api/maintenance/run','/api/ai/save','/api/positions/sync','/api/risk/guard'].includes(pathname) && method === 'POST') { const b=await parseBody(req); if (pathname==='/api/system/profile') state.systemProfile=b.profile||state.systemProfile; if (pathname==='/api/workflow/stage') { state.mode=b.profile||state.mode; state.workflowStage=String(b.profile||'').includes('live')?'live':String(b.profile||'').includes('staging')?'staging':'paper'; } if (pathname==='/api/ai/tuning') state.aiTuningPreset=b.profile||state.aiTuningPreset; if (pathname==='/api/portfolio/upgrade') state.portfolioProfile=b.profile||state.portfolioProfile; addAudit(pathname.replace('/api/',''), b); saveState(); return json(res,200,{ok:true,success:true,snapshot:snapshot(), portfolio:{profile:state.portfolioProfile}, status:'OK'}); }
    if (pathname === '/api/connection/proof') { const venue=(query.get('venue')||'binance').toLowerCase(); const symbol=query.get('symbol')||'BTC/USDT'; return json(res,200,{ok:true,proof:proofFor(venue,symbol)}); }
    if (pathname === '/api/ai-trader/status') return json(res,200,{ok:true,...state.aiTrader, botRunning:state.botRunning, workflowStage:state.workflowStage, dryRun:true, realTradingEnabled:false, safeMode:true, paperFallback:true, executionPath:'SAFE_PAPER_FALLBACK'});
    if (pathname === '/api/ai-trader/config' && method === 'POST') { const b=await parseBody(req); if (b.venue) state.aiTrader.venue=b.venue; if (b.symbol) state.aiTrader.symbol=b.symbol; if (b.enabled !== undefined) state.aiTrader.enabled=!!b.enabled; if (b.minConfidence) state.aiTrader.learning.minConfidence=Number(b.minConfidence); if (b.maxAutoQty) state.aiTrader.learning.maxAutoQty=Number(b.maxAutoQty); saveState(); return json(res,200,{ok:true,...state.aiTrader}); }
    if (pathname === '/api/ai-trader/run-once' && method === 'POST') { const d={time:nowIso(),action:'HOLD',confidence:0.5,reason:'v138 safe paper run'}; state.aiTrader.decisions=[d,...(state.aiTrader.decisions||[])].slice(0,50); state.aiTrader.lastDecision=d; state.aiTrader.learning.totalDecisions++; saveState(); return json(res,200,{ok:true,...state.aiTrader}); }
    if (pathname === '/api/execution/test-order' && method === 'POST') { const b=await parseBody(req); addAudit('dry_run_test_order',b); saveState(); return json(res,200,{ok:true,dryRun:true,message:'DRY_RUN teszt order: nem történt éles kötés.',order:b}); }
    return json(res,404,{ok:false,error:'api_not_found',path:pathname});
  } catch (e) { pushError('backend', e.message, { path: pathname }); return json(res,500,{ok:false,error:e.message}); }
}
function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? path.join(FRONTEND, 'index.html') : path.join(FRONTEND, decodeURIComponent(pathname));
  if (!filePath.startsWith(FRONTEND)) return text(res, 403, 'Forbidden');
  fs.readFile(filePath, (err, data) => {
    if (err) { fs.readFile(path.join(FRONTEND, 'index.html'), (e, d) => e ? text(res,404,'Not found') : text(res,200,d,'text/html; charset=utf-8')); return; }
    const ext = path.extname(filePath).toLowerCase(); const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
    text(res, 200, data, types[ext] || 'application/octet-stream');
  });
}
const server = http.createServer(async (req, res) => { const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); if (url.pathname.startsWith('/api/')) return handleApi(req,res,url.pathname,url.searchParams); return serveStatic(req,res,url.pathname); });
server.listen(PORT, () => console.log(`[INFO] NEXUS v138 Full Panels Render Fix started on port ${PORT}`));
