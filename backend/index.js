const express = require('express');
const path = require('path');
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

const app = express();
const PORT = Number(process.env.PORT || 10000);
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
  }
};

function nowIso() { return new Date().toISOString(); }
function safeMessage(error) { return error?.message || String(error || 'Ismeretlen hiba'); }

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
  const saved = all.filter(([, v]) => v && v.apiKey && v.secret);
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
  const apiSecret = String(input.apiSecret || '').trim();
  const passphrase = String(input.passphrase || '').trim();
  const marketType = ['spot', 'futures'].includes(String(input.marketType || '').toLowerCase()) ? String(input.marketType).toLowerCase() : 'spot';
  const marginMode = ['cross', 'isolated'].includes(String(input.marginMode || '').toLowerCase()) ? String(input.marginMode).toLowerCase() : 'cross';
  const parsedLev = Number(input.leverage);
  const leverage = Number.isFinite(parsedLev) && parsedLev > 0 ? parsedLev : 1;
  return {
    apiKey,
    apiSecret,
    passphrase,
    marketType,
    marginMode,
    leverage,
    testnet: Boolean(input.testnet),
  };
}

app.post('/api/venues/config', async (req, res) => {
  const venue = String(req.body?.venue || '').toLowerCase();
  if (!state.venues[venue]) return res.status(400).json({ ok: false, error: 'Ismeretlen venue' });
  const v = state.venues[venue];
  v.apiKey = String(req.body?.apiKey || '').trim();
  v.apiSecret = String(req.body?.apiSecret || req.body?.secret || '').trim();
  v.passphrase = String(req.body?.passphrase || '').trim();
  v.marketType = String(req.body?.marketType || 'futures');
  v.marginMode = String(req.body?.marginMode || 'cross');
  v.leverage = Number(req.body?.leverage || 3);
  v.testnet = Boolean(req.body?.testnet);
  v.connected = !!(v.apiKey && v.apiSecret);
  await persist('venue_configs', venuePersistPayload());
  await addEvent('venue_config_saved', { venue, connected: v.connected });
  res.json({ ok: true, venue, connected: v.connected });
});
app.post('/api/venues/disconnect', async (req, res) => {
  const venue = String(req.body?.venue || '').toLowerCase();
  if (!state.venues[venue]) return res.status(400).json({ ok: false, error: 'Ismeretlen venue' });
  Object.assign(state.venues[venue], { apiKey: '', apiSecret: '', passphrase: '', connected: false });
  await persist('venue_configs', venuePersistPayload());
  await addEvent('venue_disconnected', { venue });
  res.json({ ok: true });
});

app.post('/api/venues/test/:venue', async (req, res) => {
  const venue = String(req.params?.venue || '').toLowerCase();
  if (!state.venues[venue]) return res.status(400).json({ ok: false, error: 'Ismeretlen venue' });
  const body = req.body || {};
  const apiKey = String(body.apiKey || '').trim() || state.venues[venue].apiKey;
  const apiSecret = String(body.apiSecret || body.secret || '').trim() || state.venues[venue].apiSecret;
  if (!apiKey || !apiSecret) return res.status(400).json({ ok: false, error: 'Hiányzó API kulcs vagy titok' });
  await addEvent('venue_tested', { venue, simulated: true });
  res.json({ ok: true, venue, simulated: true, mode: state.mode });
});

app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html')));

bootstrap().finally(() => {
  app.listen(PORT, () => console.log('[INFO] NEXUS v93 Operator Stable Pack started', { port: PORT }));
});
