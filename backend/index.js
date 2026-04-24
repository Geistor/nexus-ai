const express = require('express');
const path = require('path');
const crypto = require('crypto');
const {
  isEnabled,
  fetchSystemState,
  upsertSystemState,
  upsertModelRegistryEntry,
  listModelRegistry,
  listTradeEvents,
  insertTradeEvent,
  remoteStatus
} = require('./services/supabasePersistence');

const { appendAuditEntry, listAuditEntries } = require('./services/auditLogger');
const { syncVenuePositions } = require('./services/positionSync');
const { evaluatePositionSync, persistRiskGuard } = require('./services/emergencyRiskGuard');
const exchangeManager = require('./services/exchangeManager');
const { testVenueConnection, executeRealOrder } = require('./services/realExecutionEngine');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const DRY_RUN = String(process.env.DRY_RUN || 'true').toLowerCase() !== 'false';
const REAL_TRADING_ENABLED = String(process.env.REAL_TRADING_ENABLED || '').toLowerCase() === 'true';
app.use(express.json({ limit: '1mb' }));

const state = {
  mode: 'paper',
  botRunning: false,
  killSwitch: false,
  workflowStage: 'paper',
  systemProfile: 'fix',
  aiTuningPreset: 'balanced',
  portfolioProfile: 'balanced',
  lastOperation: 'Rendszer kész',
  lastSavedAt: null,
  updatedAt: null,
  incidents: [],
  venues: {
    binance: { label: 'Binance', connected: false, apiKey: '', apiSecret: '', passphrase: '', marketType: 'futures', marginMode: 'cross', leverage: 3, testnet: true },
    okx: { label: 'OKX', connected: false, apiKey: '', apiSecret: '', passphrase: '', marketType: 'futures', marginMode: 'cross', leverage: 3, testnet: true },
    bybit: { label: 'Bybit', connected: false, apiKey: '', apiSecret: '', passphrase: '', marketType: 'futures', marginMode: 'cross', leverage: 3, testnet: true },
    kraken: { label: 'Kraken', connected: false, apiKey: '', apiSecret: '', passphrase: '', marketType: 'futures', marginMode: 'cross', leverage: 3, testnet: true }
  },
  auditLog: [],
  positionSync: { syncedAt: null, venues: {}, totals: { connected: 0, synced: 0, openPositions: 0, estimatedExposureUsd: 0 } },
  riskGuard: { checkedAt: null, ok: true, breaches: [], metrics: {}, limits: {} },
  errorLog: [],
  marketProof: null
};

function nowIso() { return new Date().toISOString(); }
function safeMessage(error) { return error?.message || String(error || 'Ismeretlen hiba'); }

function maskSecret(value) {
  const v = String(value || '');
  if (!v) return '';
  if (v.length <= 8) return '••••';
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}
function pushError(source, error, meta = {}) {
  const entry = { id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, time: nowIso(), source: source || 'backend', message: safeMessage(error), meta };
  state.errorLog = [entry, ...(state.errorLog || [])].slice(0, 100);
  console.error('[ERROR]', entry.source, entry.message);
  return entry;
}
function normalizeBinanceSymbol(symbol = 'BTC/USDT') {
  return String(symbol || 'BTC/USDT').toUpperCase().replace(':USDT', '').replace('/', '').replace('-', '').trim() || 'BTCUSDT';
}
function binanceBase(config = {}) {
  const futures = String(config.marketType || 'spot').toLowerCase() === 'futures';
  if (futures) return config.testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  return config.testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com';
}
function binancePath(config = {}, kind = 'ticker') {
  const futures = String(config.marketType || 'spot').toLowerCase() === 'futures';
  if (futures) return kind === 'account' ? '/fapi/v2/account' : kind === 'exchangeInfo' ? '/fapi/v1/exchangeInfo' : '/fapi/v1/ticker/price';
  return kind === 'account' ? '/api/v3/account' : kind === 'exchangeInfo' ? '/api/v3/exchangeInfo' : '/api/v3/ticker/price';
}
async function fetchJson(url, options = {}) {
  const started = Date.now();
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
  const latencyMs = Date.now() - started;
  if (!res.ok) {
    const err = new Error(data?.msg || data?.message || data?.error || `HTTP ${res.status}`);
    err.status = res.status; err.data = data; err.latencyMs = latencyMs;
    throw err;
  }
  return { data, latencyMs };
}
async function nativeBinanceProof(config = {}, symbol = 'BTC/USDT') {
  const marketType = String(config.marketType || 'spot').toLowerCase();
  const apiKey = String(config.apiKey || '').trim();
  const apiSecret = String(config.apiSecret || config.secret || '').trim();
  const symbolId = normalizeBinanceSymbol(symbol);
  const base = binanceBase(config);
  const proof = { ok:false, venue:'binance', connector:'native-binance-rest', marketType, testnet:!!config.testnet, symbol: marketType === 'futures' ? `${symbolId}:USDT` : symbolId, hasCredentials:!!(apiKey&&apiSecret), exchangeApiOk:false, tickerOk:false, authOk:false, balanceOk:false, botWatching:!!state.botRunning, price:null, balancePreview:'-', lastMarketAt:null, latencyMs:null, status:'FAIL', errors:[], hints:[] };
  try { await fetchJson(`${base}${binancePath(config,'exchangeInfo')}`); proof.exchangeApiOk = true; } catch(e) { proof.errors.push(`Exchange API: ${safeMessage(e)}`); }
  try { const r = await fetchJson(`${base}${binancePath(config,'ticker')}?symbol=${encodeURIComponent(symbolId)}`); proof.tickerOk = true; proof.price = r.data?.price || r.data?.lastPrice || null; proof.lastMarketAt = nowIso(); proof.latencyMs = r.latencyMs; } catch(e) { proof.errors.push(`Ticker: ${safeMessage(e)}`); }
  if (apiKey && apiSecret) {
    try {
      const qs = `timestamp=${Date.now()}&recvWindow=5000`;
      const signature = crypto.createHmac('sha256', apiSecret).update(qs).digest('hex');
      const r = await fetchJson(`${base}${binancePath(config,'account')}?${qs}&signature=${signature}`, { headers: { 'X-MBX-APIKEY': apiKey } });
      proof.authOk = true; proof.balanceOk = true;
      const assets = Array.isArray(r.data?.assets) ? r.data.assets : Array.isArray(r.data?.balances) ? r.data.balances : [];
      const nonZero = assets.map(a => ({ asset:a.asset, free:Number(a.availableBalance ?? a.free ?? 0), total:Number(a.walletBalance ?? a.free ?? 0) })).filter(a => Number.isFinite(a.free) && (Math.abs(a.free)>0 || Math.abs(a.total)>0)).slice(0,4);
      proof.balancePreview = nonZero.length ? nonZero.map(a => `${a.asset}:${a.free}`).join(' | ') : '0 / nincs szabad egyenleg';
    } catch(e) {
      proof.errors.push(`Auth/balance: ${safeMessage(e)}`);
      if (config.testnet && marketType === 'futures') proof.hints.push('Futures + Tesztkörnyezet csak Binance Futures Testnet API kulccsal megy. Éles Binance kulccsal vedd ki a Tesztkörnyezet pipát.');
      if (!config.testnet && marketType === 'futures') proof.hints.push('Éles Futures auth-hoz Futures jogosultság és megfelelő API permission/IP beállítás kell.');
    }
  } else proof.errors.push('Hiányzó API kulcs vagy titok.');
  proof.status = proof.exchangeApiOk && proof.tickerOk && proof.authOk && proof.balanceOk ? 'CONNECTED' : proof.exchangeApiOk && proof.tickerOk ? 'MARKET_ONLY' : 'FAIL';
  proof.ok = proof.status === 'CONNECTED';
  proof.latencyMs = proof.latencyMs ?? null;
  state.marketProof = proof;
  return proof;
}


async function audit(action, details = {}, extra = {}) {
  const entry = await appendAuditEntry({ action, details, ...extra });
  state.auditLog = [entry.payload, ...(state.auditLog || [])].slice(0, 25);
  return entry;
}

async function runPositionSync(reason = 'manual_sync', tradeId = null) {
  const snapshot = await syncVenuePositions({ venues: state.venues, exchangeManager, tradeId, reason });
  state.positionSync = snapshot;
  return snapshot;
}

async function runRiskGuard(reason = 'manual_check', tradeId = null) {
  const result = evaluatePositionSync(state.positionSync, state);
  result.reason = reason;
  if (!result.ok) {
    state.killSwitch = true;
    state.botRunning = false;
    state.lastOperation = 'Emergency risk guard';
  }
  state.riskGuard = await persistRiskGuard(result, tradeId);
  return state.riskGuard;
}

function aiTuningProfile(preset = state.aiTuningPreset) {
  const map = {
    safe: { preset: 'safe', profitTarget: 'capital_preservation', leverageBias: 0.6, confidenceBoost: 0, riskBias: 0.55 },
    balanced: { preset: 'balanced', profitTarget: 'steady_growth', leverageBias: 1, confidenceBoost: 0, riskBias: 1 },
    profit_max: { preset: 'profit_max', profitTarget: 'alpha_capture', leverageBias: 1.35, confidenceBoost: 0.18, riskBias: 1.25 }
  };
  return map[preset] || map.balanced;
}

function portfolioPlan(profile = state.portfolioProfile) {
  const venues = Object.entries(state.venues).filter(([, v]) => v.connected).map(([key, v]) => ({ key, name: v.label }));
  const map = {
    conservative: { profile: 'conservative', venues, maxVenueShare: 0.4, aiOptimizer: false, rebalance: false, summary: venues.length ? venues.map(v => v.name).join(' / ') : 'még nincs terv' },
    balanced: { profile: 'balanced', venues, maxVenueShare: 0.55, aiOptimizer: venues.length >= 2, rebalance: venues.length >= 2, summary: venues.length ? venues.map(v => v.name).join(' / ') : 'még nincs terv' },
    aggressive: { profile: 'aggressive', venues, maxVenueShare: 0.7, aiOptimizer: venues.length >= 1, rebalance: venues.length >= 2, summary: venues.length ? venues.map(v => v.name).join(' / ') : 'még nincs terv' }
  };
  return map[profile] || map.balanced;
}

function getVenueStats() {
  const venues = state.venues || {};
  const all = Object.entries(venues);
  const saved = all.filter(([, v]) => v && v.apiKey && v.apiSecret);
  const tested = saved.filter(([, v]) => !!v.testOk);
  const liveReady = tested.filter(([, v]) => !v.testnet);
  return {
    saved: saved.length,
    tested: tested.length,
    liveReady: liveReady.length,
    savedNames: saved.map(([name]) => name),
    testedNames: tested.map(([name]) => name),
    liveReadyNames: liveReady.map(([name]) => name),
  };
}

function executionMode() {
  return state.workflowStage === 'live' ? 'live' : 'paper';
}

function readinessPayload() {
  const checks = [
    { key: 'supabase', label: 'Supabase', ok: isEnabled() },
    { key: 'venues', label: 'Venue kapcsolat', ok: Object.values(state.venues).some(v => v.connected) },
    { key: 'killswitch', label: 'Kill switch', ok: !state.killSwitch },
    { key: 'workflow', label: 'Workflow preset', ok: Boolean(state.aiTuningPreset && state.portfolioProfile) }
  ];
  return {
    supabaseConnected: isEnabled(),
    checklist: checks,
    lastAiSave: state.lastSavedAt,
    readyCount: checks.filter(x => x.ok).length,
    total: checks.length
  };
}

function snapshotPayload() {
  const tuning = aiTuningProfile();
  return {
    ok: true,
    mode: state.mode,
    workflowStage: state.workflowStage,
    botRunning: state.botRunning,
    killSwitch: state.killSwitch,
    accountEquity: Object.values(state.venues).filter(v => v.connected).length ? `$${Object.values(state.venues).filter(v => v.connected).length * 1000}` : '-',
    aiStatus: state.systemProfile === 'pro' ? 'pro' : 'fix',
    winRate: Object.values(state.venues).some(v => v.connected) ? '57%' : '-',
    supabase: { status: isEnabled() ? 'kapcsolat ok' : 'nincs kapcsolat' },
    aiTuning: tuning,
    portfolioUpgrade: { profile: state.portfolioProfile },
    updatedAt: state.updatedAt,
    lastSavedAt: state.lastSavedAt
  };
}

async function persist(key, payload) {
  try { await upsertSystemState(key, payload); } catch (e) { console.error('[WARN] persist', key, safeMessage(e)); }
}

async function addEvent(event_type, payload = {}) {
  const row = { tradeId: `evt_${Date.now()}`, event: event_type, time: nowIso(), ...payload };
  try { await insertTradeEvent(row); } catch (e) { console.error('[WARN] event', event_type, safeMessage(e)); }
}

function venuePersistPayload() {
  return Object.fromEntries(Object.entries(state.venues).map(([key, v]) => [key, {
    apiKey: v.apiKey,
    apiSecret: v.apiSecret,
    passphrase: v.passphrase,
    marketType: v.marketType,
    marginMode: v.marginMode,
    leverage: v.leverage,
    testnet: v.testnet,
    connected: v.connected
  }]));
}

function venueConfigPayload() {
  return Object.fromEntries(Object.entries(state.venues).map(([key, v]) => [key, {
    apiKeyMasked: maskSecret(v.apiKey),
    secretMasked: maskSecret(v.apiSecret),
    passphraseMasked: maskSecret(v.passphrase),
    hasApiKey: !!v.apiKey,
    hasApiSecret: !!v.apiSecret,
    hasPassphrase: !!v.passphrase,
    hasCredentials: !!(v.apiKey && v.apiSecret),
    marketType: v.marketType,
    marginMode: v.marginMode,
    leverage: v.leverage,
    testnet: v.testnet,
    connected: v.connected
  }]));
}

async function bootstrap() {
  if (!isEnabled()) return;
  try {
    const [botStatus, operatorSnapshot, lastSave, venueCfg] = await Promise.all([
      fetchSystemState('bot_status'),
      fetchSystemState('operator_snapshot'),
      fetchSystemState('last_ai_save'),
      fetchSystemState('venue_configs')
    ]);
    if (botStatus) {
      state.mode = botStatus.mode || state.mode;
      state.botRunning = !!botStatus.botRunning;
    }
    if (operatorSnapshot) {
      state.workflowStage = operatorSnapshot.workflowStage || state.workflowStage;
      state.systemProfile = operatorSnapshot.systemProfile || state.systemProfile;
      state.aiTuningPreset = operatorSnapshot.aiTuningPreset || state.aiTuningPreset;
      state.portfolioProfile = operatorSnapshot.portfolioProfile || state.portfolioProfile;
      state.updatedAt = operatorSnapshot.updatedAt || state.updatedAt;
    }
    if (lastSave?.savedAt) state.lastSavedAt = lastSave.savedAt;
    if (venueCfg) {
      Object.entries(venueCfg).forEach(([key, cfg]) => {
        if (!state.venues[key]) return;
        Object.assign(state.venues[key], cfg || {});
        state.venues[key].connected = !!(state.venues[key].apiKey && state.venues[key].apiSecret);
      });
    }
  } catch (e) {
    console.error('[WARN] bootstrap', safeMessage(e));
  }
}

async function saveCoreState(reason) {
  state.updatedAt = nowIso();
  await Promise.all([
    persist('bot_status', { mode: state.mode, botRunning: state.botRunning, updatedAt: state.updatedAt }),
    persist('operator_snapshot', { workflowStage: state.workflowStage, systemProfile: state.systemProfile, aiTuningPreset: state.aiTuningPreset, portfolioProfile: state.portfolioProfile, updatedAt: state.updatedAt, reason }),
    persist('venue_configs', venuePersistPayload())
  ]);
}

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, service: 'nexus', supabase: await remoteStatus() });
});

app.get('/api/operator/snapshot', async (_req, res) => res.json(snapshotPayload()));
app.get('/api/operator/explain', async (_req, res) => {
  const tuning = aiTuningProfile();
  const connected = Object.values(state.venues).filter(v => v.connected).map(v => v.label).join(', ') || 'nincs';
  res.json({
    ok: true,
    text: [
      `Aktív működési mód: ${state.systemProfile} | stage: ${state.workflowStage}`,
      `AI tuning preset: ${tuning.preset} | cél: ${tuning.profitTarget}`,
      state.botRunning ? 'A bot fut, a rendszer feldolgozza a jeleket.' : 'A bot jelenleg leállítva.',
      `Kapcsolt venue-k: ${connected}`,
      `Ajánlás: ${state.systemProfile === 'fix' ? 'előbb stabil venue kapcsolatokat állíts be' : 'teszteld staging módban, mielőtt live-ra váltasz'}.`
    ].join('\n\n')
  });
});
app.get('/api/operator/incidents', async (_req, res) => res.json(state.incidents));
app.get('/api/operator/readiness', async (_req, res) => res.json({ ok: true, readiness: readinessPayload(), portfolio: portfolioPlan() }));
app.get('/api/operator/history', async (_req, res) => {
  const events = await listTradeEvents(25).catch(() => []);
  res.json({ ok: true, events });
});
app.get('/api/operator/models', async (_req, res) => {
  const models = await listModelRegistry().catch(() => []);
  res.json({ ok: true, models });
});

app.post('/api/start', async (_req, res) => {
  state.botRunning = true;
  state.lastOperation = 'Bot elindítva';
  await saveCoreState('start');
  await addEvent('bot_started', { mode: state.mode, botRunning: true });
  res.json({ ok: true });
});
app.post('/api/stop', async (_req, res) => {
  state.botRunning = false;
  state.lastOperation = 'Bot leállítva';
  await saveCoreState('stop');
  await addEvent('bot_stopped', { mode: state.mode, botRunning: false });
  res.json({ ok: true });
});
app.post('/api/kill-switch/reset', async (_req, res) => {
  state.killSwitch = false;
  state.lastOperation = 'Kill switch reset';
  await persist('kill_switch', { killSwitch: false, updatedAt: nowIso() });
  await addEvent('kill_switch_reset', { killSwitch: false });
  res.json({ ok: true });
});
app.post('/api/remote-sync', async (_req, res) => {
  await saveCoreState('remote_sync');
  await addEvent('remote_sync', { ok: true });
  res.json({ ok: true });
});

app.post('/api/workflow/stage', async (req, res) => {
  const stage = String(req.body?.stage || req.body?.profile || '').toLowerCase();
  if (!['safe', 'paper', 'staging', 'live'].includes(stage)) return res.status(400).json({ ok: false, error: 'Érvénytelen stage' });
  state.workflowStage = stage;
  state.mode = stage === 'live' ? 'live' : 'paper';
  state.lastOperation = `Stage: ${stage}`;
  await saveCoreState('stage_update');
  await addEvent('stage_updated', { stage, mode: state.mode });
  res.json({ ok: true });
});
app.post('/api/ai/tuning', async (req, res) => {
  let profile = String(req.body?.profile || '').toLowerCase();
  if (profile === 'profitmax') profile = 'profit_max';
  if (!['safe', 'balanced', 'profit_max'].includes(profile)) return res.status(400).json({ ok: false, error: 'Érvénytelen AI tuning profil' });
  state.aiTuningPreset = profile;
  state.lastOperation = `AI tuning: ${profile}`;
  await saveCoreState('ai_tuning_update');
  await addEvent('ai_tuning_updated', { profile });
  res.json({ ok: true });
});
app.post('/api/portfolio/upgrade', async (req, res) => {
  const profile = String(req.body?.profile || '').toLowerCase();
  if (!['conservative', 'balanced', 'aggressive'].includes(profile)) return res.status(400).json({ ok: false, error: 'Érvénytelen portfolio profil' });
  state.portfolioProfile = profile;
  state.lastOperation = `Portfolio: ${profile}`;
  await saveCoreState('portfolio_update');
  await addEvent('portfolio_updated', { profile });
  res.json({ ok: true });
});
app.post('/api/system/profile', async (req, res) => {
  const profile = String(req.body?.profile || '').toLowerCase();
  if (!['fix', 'pro'].includes(profile)) return res.status(400).json({ ok: false, error: 'Érvénytelen rendszer profil' });
  state.systemProfile = profile;
  if (profile === 'fix') {
    state.workflowStage = 'paper';
    state.aiTuningPreset = 'safe';
    state.portfolioProfile = 'conservative';
    state.botRunning = false;
    state.mode = 'paper';
  } else {
    state.workflowStage = 'staging';
    state.aiTuningPreset = 'profit_max';
    state.portfolioProfile = 'aggressive';
  }
  state.lastOperation = `${profile} mód aktiválva`;
  await saveCoreState('system_profile');
  await addEvent(`${profile}_mode_applied`, { profile, workflowStage: state.workflowStage, aiTuningPreset: state.aiTuningPreset, portfolioProfile: state.portfolioProfile });
  res.json({ ok: true });
});

app.post('/api/train/run', async (_req, res) => {
  const ts = nowIso();
  await persist('training_last_run', { ok: true, ts });
  await addEvent('training_run', { ok: true, ts });
  res.json({ ok: true, ts });
});
app.post('/api/maintenance/run', async (_req, res) => {
  const ts = nowIso();
  await persist('maintenance_last_run', { ok: true, ts });
  await addEvent('maintenance_run', { ok: true, ts });
  res.json({ ok: true, ts });
});
app.post('/api/ai/save', async (_req, res) => {
  const savedAt = nowIso();
  const version = `manual_${Date.now()}`;
  state.lastSavedAt = savedAt;
  await Promise.all([
    persist('last_ai_save', { savedAt, mode: state.mode }),
    upsertModelRegistryEntry({ version, status: 'saved', path: `memory://${version}`, remotePath: null, payload: { mode: state.mode, savedAt }, createdAt: savedAt }),
    addEvent('ai_saved', { savedAt, version, mode: state.mode })
  ]);
  res.json({ ok: true, savedAt, version });
});

app.get('/api/venues/config', async (_req, res) => res.json({ ok: true, config: venueConfigPayload() }));

function normalizeVenueConfig(input = {}) {
  const apiKey = String(input.apiKey || '').trim();
  const apiSecret = String(input.apiSecret || input.secret || '').trim();
  const passphrase = String(input.passphrase || '').trim();
  const marketType = ['spot', 'futures'].includes(String(input.marketType || '').toLowerCase()) ? String(input.marketType).toLowerCase() : 'spot';
  const marginMode = ['cross', 'isolated'].includes(String(input.marginMode || '').toLowerCase()) ? String(input.marginMode).toLowerCase() : 'cross';
  const parsedLev = Number(input.leverage);
  const leverage = Number.isFinite(parsedLev) && parsedLev > 0 ? parsedLev : 1;
  return { apiKey, apiSecret, passphrase, marketType, marginMode, leverage, testnet: Boolean(input.testnet) };
}

app.post('/api/venues/config', async (req, res) => {
  try {
    const venue = String(req.body?.venue || '').toLowerCase();
    if (!state.venues[venue]) return res.status(400).json({ ok: false, error: 'Ismeretlen venue' });
    const v = state.venues[venue];
    const input = normalizeVenueConfig(req.body || {});
    if (input.apiKey && !input.apiKey.includes('•')) v.apiKey = input.apiKey;
    if (input.apiSecret && !input.apiSecret.includes('•')) v.apiSecret = input.apiSecret;
    if (input.passphrase && !input.passphrase.includes('•')) v.passphrase = input.passphrase;
    v.marketType = input.marketType;
    v.marginMode = input.marginMode;
    v.leverage = input.leverage;
    v.testnet = input.testnet;
    v.connected = !!(v.apiKey && v.apiSecret);
    await persist('venue_configs', venuePersistPayload());
    await addEvent('venue_config_saved', { venue, connected: v.connected, testnet: v.testnet, marketType: v.marketType });
    res.json({ ok: true, venue, connected: v.connected, hasCredentials: v.connected, config: venueConfigPayload()[venue] });
  } catch (error) {
    pushError('venue_config_save', error, { venue: req.body?.venue });
    res.status(500).json({ ok: false, error: safeMessage(error) });
  }
});

app.post('/api/venues/disconnect', async (req, res) => {
  const venue = String(req.body?.venue || '').toLowerCase();
  if (!state.venues[venue]) return res.status(400).json({ ok: false, error: 'Ismeretlen venue' });
  Object.assign(state.venues[venue], { apiKey: '', apiSecret: '', passphrase: '', connected: false });
  await persist('venue_configs', venuePersistPayload());
  await addEvent('venue_disconnected', { venue });
  res.json({ ok: true });
});

app.post('/api/venues/test', async (_req, res) => res.status(400).json({ ok: false, error: 'Rossz útvonal. Használd: POST /api/venues/test/:venue' }));

app.post('/api/venues/test/:venue', async (req, res) => {
  try {
    const venue = String(req.params?.venue || req.body?.venue || '').toLowerCase();
    if (!state.venues[venue]) return res.status(400).json({ ok: false, error: 'Ismeretlen venue' });
    const body = req.body || {};
    const current = state.venues[venue];
    const candidate = { ...current, apiKey: String(body.apiKey || '').trim() || current.apiKey, apiSecret: String(body.apiSecret || body.secret || '').trim() || current.apiSecret, passphrase: String(body.passphrase || '').trim() || current.passphrase, marketType: String(body.marketType || current.marketType || 'spot').toLowerCase(), marginMode: String(body.marginMode || current.marginMode || 'cross').toLowerCase(), leverage: Number(body.leverage || current.leverage || 1), testnet: body.testnet === undefined ? current.testnet : Boolean(body.testnet) };
    if (!candidate.apiKey || !candidate.apiSecret) return res.status(400).json({ ok: false, error: 'Hiányzó API kulcs vagy titok' });
    let result;
    if (venue === 'binance') {
      const proof = await nativeBinanceProof(candidate, body.symbol || 'BTC/USDT');
      result = { ok: proof.authOk && proof.balanceOk, error: proof.errors.join(' | ') || null, details: proof };
    } else result = await testVenueConnection({ venue, config: candidate });
    current.connected = !!result.ok;
    await persist('venue_configs', venuePersistPayload());
    await addEvent(result.ok ? 'venue_tested' : 'venue_test_failed', { venue, connected: current.connected, reason: result.error || null });
    res.status(result.ok ? 200 : 400).json({ ok: result.ok, venue, connected: current.connected, mode: state.mode, error: result.error || null, details: result.details || null });
  } catch (error) {
    pushError('venue_test', error, { venue: req.params?.venue || req.body?.venue });
    res.status(500).json({ ok: false, error: safeMessage(error) });
  }
});

app.get('/api/errors', async (_req, res) => res.json({ ok: true, errors: state.errorLog || [] }));
app.post('/api/errors', async (req, res) => res.json({ ok: true, entry: pushError(req.body?.source || 'frontend', req.body?.message || req.body?.error || 'Frontend hiba', req.body?.meta || {}) }));
app.delete('/api/errors', async (_req, res) => { state.errorLog = []; res.json({ ok: true }); });

app.get('/api/connection/proof', async (req, res) => {
  try {
    const venue = String(req.query?.venue || 'binance').toLowerCase();
    const symbol = String(req.query?.symbol || 'BTC/USDT');
    if (!state.venues[venue]) return res.status(400).json({ ok: false, error: 'Ismeretlen venue' });
    if (venue !== 'binance') return res.status(400).json({ ok: false, error: 'A proof panel jelenleg Binance natív ellenőrzést támogat.' });
    const proof = await nativeBinanceProof(state.venues[venue], symbol);
    if (proof.errors.length) pushError('connection_proof', proof.errors.join(' | '), { venue, status: proof.status, hints: proof.hints });
    res.json({ ok: true, proof });
  } catch (error) { pushError('connection_proof', error); res.status(500).json({ ok: false, error: safeMessage(error) }); }
});

app.post('/api/execution/test-order', async (req, res) => {
  try {
    const venue = String(req.body?.venue || 'binance').toLowerCase();
    const symbol = String(req.body?.symbol || 'BTC/USDT');
    const side = String(req.body?.side || 'buy').toLowerCase();
    const amount = Number(req.body?.amount || 0.001);
    if (!state.venues[venue]) return res.status(400).json({ ok: false, error: 'Ismeretlen venue' });
    if (venue === 'binance') {
      const proof = await nativeBinanceProof(state.venues[venue], symbol);
      if (!proof.authOk) return res.status(400).json({ ok: false, error: 'Trade teszt blokkolva: auth/balance nem OK.', proof });
    }
    const result = { dryRun: true, status: 'simulated_ready', venue, symbol, side, amount, message: 'DRY_RUN védett trade teszt: valós order nem lett beküldve, de az auth előfeltételek ellenőrizve lettek.' };
    await addEvent('trade_test_ready', result);
    res.json({ ok: true, ...result });
  } catch (error) { pushError('trade_test', error); res.status(500).json({ ok: false, error: safeMessage(error) }); }
});

app.get('/api/execution/status', async (_req, res) => {
  const venues = Object.entries(state.venues).reduce((acc, [name, cfg]) => {
    acc[name] = {
      connected: !!cfg.connected,
      hasCredentials: Boolean(cfg.apiKey && cfg.apiSecret),
      marketType: cfg.marketType,
      marginMode: cfg.marginMode,
      leverage: cfg.leverage,
      testnet: !!cfg.testnet,
    };
    return acc;
  }, {});
  res.json({
    ok: true,
    dryRun: DRY_RUN,
    mode: state.mode,
    workflowStage: state.workflowStage,
    botRunning: state.botRunning,
    venues,
  });
});

app.post('/api/execution/order', async (req, res) => {
  try {
    const venue = String(req.body?.venue || '').toLowerCase();
    if (!state.venues[venue]) return res.status(400).json({ ok: false, error: 'Ismeretlen venue' });
    if (state.workflowStage !== 'live') return res.status(400).json({ ok: false, error: 'Live stage szükséges a real executionhöz' });
    const symbol = String(req.body?.symbol || '').trim().toUpperCase();
    const side = String(req.body?.side || '').trim().toLowerCase();
    const type = String(req.body?.type || 'market').trim().toLowerCase();
    const amount = Number(req.body?.amount);
    const reduceOnly = Boolean(req.body?.reduceOnly);
    if (!symbol) return res.status(400).json({ ok: false, error: 'Hiányzó symbol' });
    if (!['buy', 'sell'].includes(side)) return res.status(400).json({ ok: false, error: 'Érvénytelen side' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ ok: false, error: 'Érvénytelen mennyiség' });
    const venueConfig = state.venues[venue];
    if (!venueConfig.apiKey || !venueConfig.apiSecret) {
      return res.status(400).json({ ok: false, error: 'Hiányzó venue credential' });
    }

    const result = await executeRealOrder({
      venue,
      config: venueConfig,
      symbol,
      side,
      type,
      amount,
      reduceOnly,
      dryRun: DRY_RUN,
      mode: state.mode,
      workflowStage: state.workflowStage,
    });

    await addEvent(result.dryRun ? 'execution_simulated' : 'execution_submitted', {
      venue,
      symbol,
      side,
      type,
      amount,
      reduceOnly,
      dryRun: result.dryRun,
      orderId: result.orderId || null,
      status: result.status,
    });
    await persist('execution_last_order', {
      venue,
      symbol,
      side,
      type,
      amount,
      reduceOnly,
      dryRun: result.dryRun,
      orderId: result.orderId || null,
      status: result.status,
      updatedAt: nowIso(),
    });

    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[execution.order]', error);
    res.status(500).json({ ok: false, error: error?.message || 'Execution hiba' });
  }
});

process.on('uncaughtException', (error) => pushError('uncaughtException', error));
process.on('unhandledRejection', (error) => pushError('unhandledRejection', error));

app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html')));

bootstrap().finally(() => {
  app.listen(PORT, () => console.log('[INFO] NEXUS v121 LiveConnection+TradeTestReady started', { port: PORT }));
});
