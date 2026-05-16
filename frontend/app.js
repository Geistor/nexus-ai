const $ = (id) => document.getElementById(id);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const els = {
  startBtn: $('startBtn'),
  stopBtn: $('stopBtn'),
  emergencyBtn: $('emergencyBtn'),
  fixModeBtn: $('fixModeBtn'),
  proModeBtn: $('proModeBtn'),
  syncBtn: $('syncBtn'),
  trainBtn: $('trainBtn'),
  maintBtn: $('maintBtn'),
  saveAiBtn: $('saveAiBtn'),
  positionSyncBtn: $('positionSyncBtn'),
  riskGuardBtn: $('riskGuardBtn'),
  logBtn: $('logBtn'),
  refreshExplainBtn: $('refreshExplainBtn'),
  refreshLogsBtn: $('refreshLogsBtn'),
  refreshHistoryBtn: $('refreshHistoryBtn'),
  refreshModelsBtn: $('refreshModelsBtn'),
  equityVal: $('equityVal'),
  equitySub: $('equitySub'),
  modelVal: $('modelVal'),
  modelSub: $('modelSub'),
  botVal: $('botVal'),
  botSub: $('botSub'),
  hitVal: $('hitVal'),
  hitSub: $('hitSub'),
  aiTuningPanel: $('aiTuningPanel'),
  portfolioPanel: $('portfolioPanel'),
  portfolioGrid: $('portfolioGrid'),
  aiExplainPanel: $('aiExplainPanel'),
  incidentPanel: $('incidentPanel'),
  historyPanel: $('historyPanel'),
  modelsPanel: $('modelsPanel'),
  aiPresetPill: $('aiPresetPill'),
  portfolioProfilePill: $('portfolioProfilePill'),
  lastActionVal: $('lastActionVal'),
  supabaseVal: $('supabaseVal'),
  readinessVal: $('readinessVal'),
  lastSaveVal: $('lastSaveVal'),
  toast: $('toast'),
  proofVenue: $('proofVenue'),
  proofSymbol: $('proofSymbol'),
  proofRefreshBtn: $('proofRefreshBtn'),
  proofPanel: $('proofPanel'),
  aiTraderPanel: $('aiTraderPanel'),
  aiTraderVenue: $('aiTraderVenue'),
  aiTraderSymbol: $('aiTraderSymbol'),
  aiTraderToggleBtn: $('aiTraderToggleBtn'),
  aiTraderRunOnceBtn: $('aiTraderRunOnceBtn'),
  aiTraderRefreshBtn: $('aiTraderRefreshBtn'),
  aiTraderMinConfidence: $('aiTraderMinConfidence'),
  aiTraderMaxQty: $('aiTraderMaxQty'),
  tradeTestBtn: $('tradeTestBtn'),
  tradeTestOutput: $('tradeTestOutput'),
  refreshErrorsBtn: $('refreshErrorsBtn'),
  copyErrorsBtn: $('copyErrorsBtn'),
  clearErrorsBtn: $('clearErrorsBtn'),
  errorCopyArea: $('errorCopyArea'),
  errorPanel: $('errorPanel'),
  marketLivePanel: $('marketLivePanel'),
  marketLiveStartBtn: $('marketLiveStartBtn'),
  marketLiveStopBtn: $('marketLiveStopBtn'),
  marketLiveRefreshBtn: $('marketLiveRefreshBtn'),
  portfolioAiPanel: $('portfolioAiPanel'),
  portfolioAiRefreshBtn: $('portfolioAiRefreshBtn'),
  controlCenterPanel: $('controlCenterPanel'),
  controlCenterRefreshBtn: $('controlCenterRefreshBtn'),
  learningLabPanel: $('learningLabPanel'),
  learningRefreshBtn: $('learningRefreshBtn'),
  learningTrainBtn: $('learningTrainBtn'),
  backtestRunBtn: $('backtestRunBtn'),
  modelSnapshotBtn: $('modelSnapshotBtn'),
  orchestratorPanel: $('orchestratorPanel'),
  orchestratorRefreshBtn: $('orchestratorRefreshBtn'),
  orchestratorTickBtn: $('orchestratorTickBtn'),
  persistenceSaveBtn: $('persistenceSaveBtn'),
  operatorPanel: $('operatorPanel'),
  operatorRefreshBtn: $('operatorRefreshBtn'),
  memoryPanel: $('memoryPanel'),
  memoryRefreshBtn: $('memoryRefreshBtn'),
  memorySyncBtn: $('memorySyncBtn'),
  memorySnapshotBtn: $('memorySnapshotBtn'),
  autonomousPanel: $('autonomousPanel'),
  microPanel: $('microPanel'),
  microRefreshBtn: $('microRefreshBtn'),
  microTickBtn: $('microTickBtn'),
  autoStartBtn: $('autoStartBtn'),
  autoTickBtn: $('autoTickBtn'),
  autoStopBtn: $('autoStopBtn'),
  autoRefreshBtn: $('autoRefreshBtn'),
};

const modeButtons = $$('[data-mode]');
const tuningButtons = $$('[data-tuning]');
const portfolioButtons = $$('[data-profile]');

const state = { snapshot: {}, explain: {}, incidents: [], readiness: {}, portfolio: {}, venues: {}, aiTrader: {}, marketLive: {}, portfolioAi: {}, controlCenter: {}, learningLab: {}, orchestrator: {}, persistence: {}, aiBrain: {}, realtimeState: {}, aiMemory: {}, autonomous: {}, microstructure: {}, lastAction: '-' };
const VENUES = ['binance', 'okx', 'bybit', 'kraken'];

const VENUE_BADGE_LABELS = {
  empty: 'nincs mentve',
  incomplete: 'hiányos',
  saved: 'mentve',
  connected: 'kapcsolódva',
  error: 'teszt hiba',
};

function badgeStateForVenue(cfg = {}, status = {}) {
  const raw = status.status || (cfg.connected ? 'connected' : (cfg.apiKey || cfg.apiSecret ? 'saved' : 'empty'));
  return { state: raw, label: VENUE_BADGE_LABELS[raw] || raw };
}


function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function readableError(error) {
  const raw = error?.message || String(error || 'Ismeretlen hiba');
  if (raw.includes('<!doctype') || raw.includes('<html') || raw.includes('<svg') || raw.length > 800) {
    return 'A szerver nem JSON választ adott vissza. Rossz API útvonal vagy frontend/backend verzió eltérés lehet.';
  }
  return raw;
}

async function postFrontendError(message, source = 'frontend', meta = {}) {
  try {
    await fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, message: readableError(message), meta }),
    });
  } catch (_) {}
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { ok: false, error: text }; }
  if (!res.ok) {
    const message = readableError(payload?.error || payload?.message || text || `HTTP ${res.status}`);
    const err = new Error(message);
    err.payload = payload;
    err.status = res.status;
    throw err;
  }
  return payload;
}

function showToast(message, error = false) {
  if (!els.toast) return;
  const msg = readableError(message);
  els.toast.textContent = msg;
  els.toast.className = `toast${error ? ' error' : ''}`;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.add('hidden'), error ? 6500 : 2600);
  if (error) {
    const local = JSON.parse(localStorage.getItem('nexus_error_log') || '[]');
    local.unshift({ time: new Date().toISOString(), source: 'toast', message: msg });
    localStorage.setItem('nexus_error_log', JSON.stringify(local.slice(0, 100)));
    postFrontendError(msg, 'toast').then(refreshErrors).catch(() => {});
  }
}

window.addEventListener('error', (e) => showToast(e.message || 'Frontend hiba', true));
window.addEventListener('unhandledrejection', (e) => showToast(e.reason?.message || e.reason || 'Promise hiba', true));

function fmtTs(ts) {
  if (!ts) return '-';
  try { return new Date(ts).toLocaleString('hu-HU'); } catch { return ts; }
}

function setActive(btns, attr, value) {
  btns.forEach((b) => b.classList.toggle('active', b.dataset[attr] === value));
}

function kv(items) {
  return items.map(([k,v]) => `<div class="kv"><span>${k}</span><strong>${v}</strong></div>`).join('');
}

function renderSnapshot() {
  const s = state.snapshot || {};
  els.equityVal.textContent = s.accountEquity ?? '-';
  els.equitySub.textContent = 'Összesített account equity';
  els.modelVal.textContent = String(s.aiStatus || '-').toUpperCase();
  els.modelSub.textContent = `Aktív tuning preset: ${s.aiTuning?.preset || '-'}`;
  els.botVal.textContent = s.botRunning ? 'ON' : 'OFF';
  els.botSub.textContent = `Védelem: ${s.killSwitch ? 'ARMED' : 'DISARMED'} | stage: ${s.workflowStage || '-'}`;
  els.hitVal.textContent = s.winRate ?? '-';
  els.hitSub.textContent = 'AI confidence / winrate';

  els.aiTuningPanel.innerHTML = kv([
    ['PRESET', s.aiTuning?.preset || '-'],
    ['PROFIT CÉL', s.aiTuning?.profitTarget || '-'],
    ['LEVERAGE BIAS', Number(s.aiTuning?.leverageBias || 0).toFixed(2)],
    ['CONFIDENCE BOOST', `${Math.round((s.aiTuning?.confidenceBoost || 0) * 100)}%`],
    ['RISK BIAS', Number(s.aiTuning?.riskBias || 0).toFixed(2)],
    ['UTOLSÓ VÁLTÁS', fmtTs(s.updatedAt)],
  ]);

  const p = state.portfolio || {};
  els.portfolioPanel.innerHTML = kv([
    ['PROFIL', p.profile || s.portfolioUpgrade?.profile || '-'],
    ['VENUE DB', p.venues?.length ?? 0],
    ['MAX VENUE SHARE', `${Math.round((p.maxVenueShare || 0) * 100)}%`],
    ['AI OPTIMIZER', p.aiOptimizer ? 'ON' : 'OFF'],
    ['REBALANCE', p.rebalance ? 'ON' : 'OFF'],
    ['JAVASOLT VENUE MIX', p.summary || 'még nincs terv'],
  ]);

  els.aiPresetPill.textContent = s.aiTuning?.preset || 'balanced';
  els.portfolioProfilePill.textContent = p.profile || s.portfolioUpgrade?.profile || 'balanced';
  setActive(modeButtons, 'mode', s.mode || 'paper');
  setActive(tuningButtons, 'tuning', s.aiTuning?.preset || 'balanced');
  setActive(portfolioButtons, 'profile', p.profile || s.portfolioUpgrade?.profile || 'balanced');
}

function renderExplain() {
  const text = state.explain?.text || 'Nincs még AI magyarázat.';
  els.aiExplainPanel.innerHTML = text.split('\n').filter(Boolean).map((x) => `<p>${x}</p>`).join('');
}

function renderIncidents() {
  const rows = state.incidents || [];
  els.incidentPanel.innerHTML = rows.length
    ? rows.map((x) => `<div class="log-entry"><div class="top"><strong>${x.title || x.type || 'Incident'}</strong><span>${fmtTs(x.ts || x.created_at)}</span></div><div>${x.message || JSON.stringify(x)}</div></div>`).join('')
    : '<p>Nincs még esemény.</p>';
}

function renderHistory(events) {
  els.historyPanel.innerHTML = events.length
    ? events.map((e) => `<div class="log-entry"><div class="top"><span class="tag">${e.event_type}</span><span>${fmtTs(e.created_at)}</span></div><div>${e.trade_id || '-'}</div><pre>${JSON.stringify(e.payload || {}, null, 2)}</pre></div>`).join('')
    : '<p>Nincs még akció előzmény.</p>';
}

function renderModels(models) {
  els.modelsPanel.innerHTML = models.length
    ? models.map((m) => `<div class="log-entry"><div class="top"><span class="tag">${m.status || 'saved'}</span><span>${fmtTs(m.created_at)}</span></div><div><strong>${m.version || '-'}</strong></div><div>${m.path || '-'}</div><pre>${JSON.stringify(m.payload || {}, null, 2)}</pre></div>`).join('')
    : '<p>Nincs még AI mentés.</p>';
}

function renderReadiness() {
  const r = state.readiness || {};
  els.lastActionVal.textContent = state.lastAction;
  els.supabaseVal.textContent = r.supabaseConnected ? 'kapcsolódva' : 'nincs kapcsolat';
  const okCount = (r.checklist || []).filter((x) => x.ok).length;
  els.readinessVal.textContent = `${okCount}/${(r.checklist || []).length || 0} OK`;
  els.lastSaveVal.textContent = fmtTs(r.lastAiSave);
}

function normalizeSnapshot(payload = {}) {
  return payload.snapshot || payload.data || payload;
}
function normalizeIncidents(payload = {}) {
  if (Array.isArray(payload)) return payload;
  return payload.incidents || payload.items || [];
}
function normalizeReadiness(payload = {}) {
  return payload.readiness || payload;
}
function normalizePortfolio(payload = {}, fallback = {}) {
  return payload.portfolio || fallback.portfolio || state.portfolio || {};
}
function normalizeHistory(payload = {}) {
  const rows = payload.events || payload.history || payload.auditLog || [];
  return rows.map((e) => ({
    event_type: e.event_type || e.action || e.type || 'event',
    created_at: e.created_at || e.time || e.ts || e.createdAt,
    trade_id: e.trade_id || e.tradeId || e.id || '-',
    payload: e.payload || e.details || e.meta || e,
  }));
}
function normalizeModels(payload = {}) {
  const rows = payload.models || payload.snapshots || [];
  return rows.map((m) => ({
    status: m.status || 'saved',
    created_at: m.created_at || m.time || m.ts || m.createdAt,
    version: m.version || m.name || m.modelVersion || '-',
    path: m.path || m.file || m.id || '-',
    payload: m.payload || m.metrics || m,
  }));
}

async function refreshCore() {
  const [snapshotPayload, explainPayload, incidentsPayload, readinessPayload] = await Promise.all([
    api('/api/operator/snapshot'),
    api('/api/operator/explain'),
    api('/api/operator/incidents'),
    api('/api/operator/readiness'),
  ]);
  state.snapshot = normalizeSnapshot(snapshotPayload);
  state.explain = explainPayload;
  state.incidents = normalizeIncidents(incidentsPayload);
  state.readiness = normalizeReadiness(readinessPayload);
  state.portfolio = normalizePortfolio(readinessPayload, snapshotPayload);
  renderSnapshot();
  renderExplain();
  renderIncidents();
  renderReadiness();
}

async function refreshHistory() {
  const data = await api('/api/operator/history');
  renderHistory(normalizeHistory(data));
}

async function refreshModels() {
  const data = await api('/api/operator/models');
  renderModels(normalizeModels(data));
}

async function action(label, url, body) {
  try {
    state.lastAction = `${label}...`;
    renderReadiness();
    const result = await api(url, { method: 'POST', body });
    if (result?.snapshot) {
      state.snapshot = normalizeSnapshot(result);
      renderSnapshot();
    }
    if (result?.portfolio) {
      state.portfolio = result.portfolio;
      renderSnapshot();
    }
    state.lastAction = `${label} kész`;
    renderReadiness();
    showToast(`${label} kész`);
    await Promise.allSettled([refreshCore(), refreshHistory(), refreshModels(), refreshPortfolioAi(), refreshControlCenter(), refreshLearningLab(), refreshOperator()]);
    return result;
  } catch (e) {
    console.error(e);
    state.lastAction = `${label} hiba`;
    renderReadiness();
    showToast(`${label} hiba: ${readableError(e)}`, true);
  }
}

els.startBtn?.addEventListener('click', () => action('Indítás', '/api/start'));
els.stopBtn?.addEventListener('click', () => action('Leállítás', '/api/stop'));
els.emergencyBtn?.addEventListener('click', () => action('Vész stop reset', '/api/kill-switch/reset'));
els.fixModeBtn?.addEventListener('click', () => action('Fix mód', '/api/system/profile', { profile: 'fix' }));
els.proModeBtn?.addEventListener('click', () => action('Pro mód', '/api/system/profile', { profile: 'pro' }));
els.syncBtn?.addEventListener('click', () => action('Távoli sync', '/api/remote-sync'));
els.trainBtn?.addEventListener('click', () => action('Tanítás futtatása', '/api/train/run'));
els.maintBtn?.addEventListener('click', () => action('Adatkarbantartás', '/api/maintenance/run'));
els.saveAiBtn?.addEventListener('click', () => action('AI mentés', '/api/ai/save'));
els.positionSyncBtn?.addEventListener('click', async () => { const result = await action('Pozíció sync', '/api/positions/sync'); if (result?.snapshot?.totals) showToast(`Pozíció sync kész: ${result.snapshot.totals.openPositions} pozíció`); });
els.riskGuardBtn?.addEventListener('click', async () => { const result = await action('Risk guard', '/api/risk/guard'); showToast(result?.ok ? 'Risk guard OK' : 'Risk guard blokkolt'); });
els.logBtn?.addEventListener('click', () => refreshHistory().then(() => showToast('Trade napló frissítve')));
els.refreshExplainBtn?.addEventListener('click', () => refreshCore().then(() => showToast('AI panel frissítve')));
els.refreshLogsBtn?.addEventListener('click', () => refreshCore().then(() => showToast('Incident center frissítve')));
els.refreshHistoryBtn?.addEventListener('click', () => refreshHistory().then(() => showToast('Akció előzmény frissítve')));
els.refreshModelsBtn?.addEventListener('click', () => refreshModels().then(() => showToast('Mentések frissítve')));
els.orchestratorRefreshBtn?.addEventListener('click', () => refreshOrchestrator().then(() => showToast('Orchestrator frissítve')).catch(e => showToast(readableError(e), true)));
els.orchestratorTickBtn?.addEventListener('click', () => runOrchestratorTick().catch(e => showToast(readableError(e), true)));
els.persistenceSaveBtn?.addEventListener('click', () => savePersistenceSnapshot().catch(e => showToast(readableError(e), true)));

modeButtons.forEach((btn) => btn.addEventListener('click', () => action(`Mód: ${btn.dataset.mode}`, '/api/workflow/stage', { profile: btn.dataset.mode })));
tuningButtons.forEach((btn) => btn.addEventListener('click', () => action(`AI tuning: ${btn.dataset.tuning}`, '/api/ai/tuning', { profile: btn.dataset.tuning })));
portfolioButtons.forEach((btn) => btn.addEventListener('click', () => action(`Portfolio: ${btn.dataset.profile}`, '/api/portfolio/upgrade', { profile: btn.dataset.profile })));


function renderOrchestrator() {
  if (!els.orchestratorPanel) return;
  const o = state.orchestrator?.orchestrator || state.orchestrator || {};
  const p = state.persistence || {};
  const health = o.engineHealth || {};
  const queue = o.queue || [];
  const bus = (state.realtimeState?.events || o.stateBus || []);
  const rt = state.realtimeState || {};
  const ss = rt.singleSource || {};
  const con = rt.consistency || {};
  els.orchestratorPanel.innerHTML = `
    <div class="proof-grid">
      <div class="proof-item"><span>Central state</span><strong>${htmlEscape(o.centralState || con.source || '-')}</strong></div>
      <div class="proof-item"><span>Cycle / Seq</span><strong>${htmlEscape((o.cycle ?? 0) + ' / ' + (rt.sequence ?? 0))}</strong></div>
      <div class="proof-item"><span>Utolsó sync</span><strong>${htmlEscape(fmtTs(rt.lastSyncAt || o.lastTickAt))}</strong></div>
      <div class="proof-item"><span>Persistence</span><strong>${htmlEscape(p.status || health.persistence || '-')}</strong></div>
      <div class="proof-item"><span>Market</span><strong>${htmlEscape(health.market || '-')}</strong></div>
      <div class="proof-item"><span>AI</span><strong>${htmlEscape(health.ai || '-')}</strong></div>
      <div class="proof-item"><span>Trading</span><strong>${htmlEscape(health.trading || '-')}</strong></div>
      <div class="proof-item"><span>Risk</span><strong>${htmlEscape(health.risk || ss.portfolio?.risk?.status || '-')}</strong></div>
      <div class="proof-item"><span>State health</span><strong>${htmlEscape(con.healthy ? 'HEALTHY' : 'WATCH')}</strong></div>
      <div class="proof-item"><span>Subscribers</span><strong>${htmlEscape((con.subscribers || []).length)}</strong></div>
    </div>
    <div class="mini-section"><strong>Engine queue</strong>${queue.map(x => `<div class="kv"><span>${htmlEscape(x.task)}</span><strong>${htmlEscape(x.status)}</strong></div>`).join('') || '<p>Nincs queue.</p>'}</div>
    <div class="mini-section"><strong>Unified state snapshot</strong><pre>${htmlEscape(JSON.stringify({market:ss.market?.tick, ai:ss.ai?.brain, execution:ss.execution?.metrics, portfolio:ss.portfolio?.risk}, null, 2))}</pre></div>
    <div class="mini-section"><strong>State bus</strong>${bus.slice(0,8).map(x => `<div class="log-entry"><div class="top"><span class="tag">${htmlEscape(x.channel)}</span><span>${htmlEscape(fmtTs(x.ts))}</span></div><div>${htmlEscape(x.event)}</div><pre>${htmlEscape(JSON.stringify(x.payload || {}, null, 2))}</pre></div>`).join('') || '<p>Még nincs bus event. Nyomj Engine tick-et.</p>'}</div>
    <div class="mini-section"><strong>Következő ajánlott lépés</strong><p>${htmlEscape(o.nextRecommendedAction || '-')}</p></div>
  `;
}


function renderMemoryPanel(data = {}) {
  if (!els.memoryPanel) return;
  const s = data.summary || {};
  const storage = data.storage || {};
  const strategies = data.strategyMemory || [];
  const trades = data.tradeMemory || [];
  const lessons = data.lessons || [];
  const rows = [
    ['Storage', storage.type || '-'],
    ['Supabase ready', storage.supabaseReady ? 'IGEN' : 'NEM'],
    ['Utolsó memory save', fmtTs(storage.lastSavedAt)],
    ['Trade memória', s.tradeMemoryCount ?? 0],
    ['Strategy memória', s.strategyCount ?? 0],
    ['Snapshotok', s.snapshotCount ?? 0],
    ['Aktív regime', s.activeRegime || '-'],
    ['Brain döntés', s.activeBrainDecision || '-'],
  ];
  const strategyHtml = strategies.map(x => `<div class="kv"><span>${htmlEscape(x.strategy)}</span><strong>${htmlEscape((x.winrate ?? 0) + '% / score ' + (x.score ?? 0))}</strong></div>`).join('') || '<p>Még nincs strategy memória.</p>';
  const tradeHtml = trades.slice(0,8).map(x => `<div class="log-entry"><div class="top"><span class="tag">${htmlEscape(x.state || 'MEM')}</span><span>${htmlEscape(fmtTs(x.time))}</span></div><div>${htmlEscape(`${x.venue || '-'} ${x.symbol || '-'} ${x.side || '-'} | slippage ${x.slippageBps ?? 0}bps | latency ${x.latencyMs ?? 0}ms`)}</div><div class="muted">${htmlEscape(x.aiReason || '')}</div></div>`).join('') || '<p>Még nincs trade memória.</p>';
  const lessonHtml = lessons.slice(0,8).map(x => `<div class="log-entry"><div class="top"><span class="tag">LESSON</span><span>${htmlEscape(fmtTs(x.time))}</span></div><div>${htmlEscape(x.text || x.lesson || '')}</div></div>`).join('') || '<p>Még nincs tanulási lecke.</p>';
  els.memoryPanel.innerHTML = rows.map(([k,v]) => `<div class="proof-row ${proofRowClass(k,v)}"><span>${htmlEscape(k)}</span><strong>${htmlEscape(v)}</strong></div>`).join('')
    + `<div class="proof-row proof-details neutral-row"><span>Strategy memória</span><div>${strategyHtml}</div></div>`
    + `<div class="proof-row proof-details neutral-row"><span>Trade memória</span><div>${tradeHtml}</div></div>`
    + `<div class="proof-row proof-details neutral-row"><span>AI tanulságok</span><div>${lessonHtml}</div></div>`
    + `<div class="operator-summary"><div class="operator-main">${htmlEscape(data.recommendation || 'Paper memória gyűjtése ajánlott.')}</div></div>`;
}
async function refreshMemoryPanel() {
  if (!els.memoryPanel) return;
  const data = await api('/api/memory/status');
  state.aiMemory = data;
  renderMemoryPanel(data);
}
async function syncMemory() {
  const data = await api('/api/memory/sync', { method: 'POST', body: { source: 'ui' } });
  state.aiMemory = data;
  renderMemoryPanel(data);
  await Promise.allSettled([refreshOrchestrator(), refreshHistory(), refreshModels()]);
  showToast('AI memória szinkron kész');
}
async function saveMemorySnapshotUi() {
  const data = await api('/api/memory/snapshot', { method: 'POST', body: { label: 'ui_manual' } });
  state.aiMemory = data.memory || data;
  renderMemoryPanel(state.aiMemory);
  await Promise.allSettled([refreshOrchestrator(), refreshLearningLab(), refreshModels(), refreshHistory()]);
  showToast('AI memory snapshot mentve');
}

async function refreshOrchestrator() {
  const [o, p, rt] = await Promise.all([api('/api/orchestrator/status'), api('/api/persistence/status'), api('/api/state/realtime')]);
  state.orchestrator = o;
  state.persistence = p;
  state.realtimeState = rt;
  renderOrchestrator();
}
async function runOrchestratorTick() {
  const [o, rt] = await Promise.all([api('/api/orchestrator/tick', { method: 'POST', body: { source: 'ui' } }), api('/api/state/tick', { method: 'POST', body: { source: 'ui' } })]);
  state.orchestrator = o;
  state.realtimeState = rt;
  state.persistence = await api('/api/persistence/status');
  renderOrchestrator();
  showToast('Orchestrator tick kész');
  await Promise.allSettled([refreshCore(), refreshControlCenter(), refreshLearningLab(), refreshHistory()]);
}
async function savePersistenceSnapshot() {
  const data = await api('/api/persistence/save', { method: 'POST', body: { target: 'ui_manual' } });
  state.persistence = data.persistence || await api('/api/persistence/status');
  await Promise.allSettled([refreshOrchestrator(), refreshLearningLab(), refreshModels(), refreshHistory()]);
  showToast('Learning/model state mentve');
}


function renderAutonomous(data = {}) {
  if (!els.autonomousPanel) return;
  const op = data.operator || {};
  const action = data.currentAction || {};
  const metrics = data.realMetrics || {};
  const brain = data.brain || {};
  const flags = data.safetyFlags || [];
  const recs = data.recommendations || [];
  const actions = (op.actions || []).slice(0, 8);
  const rows = [
    ['Állapot', op.enabled ? 'AUTONÓM AKTÍV' : 'STANDBY'],
    ['Ciklus', op.cycle ?? 0],
    ['Objective', data.objective || op.objective || '-'],
    ['Adaptáció', data.adaptationState || op.adaptationState || '-'],
    ['Utolsó akció', op.lastAction || action.recommended || '-'],
    ['AI döntés', brain.decision || '-'],
    ['Confidence', `${Math.round(Number(metrics.confidence || action.confidence || 0) * 100)}%`],
    ['Safety', flags.length ? flags.join(', ') : 'OK / paper-safe'],
  ];
  const actionList = actions.map(a => `<div class="auto-action"><div class="top"><span>${htmlEscape(a.recommended || '-')}</span><span>${htmlEscape(fmtTs(a.time))}</span></div><div class="muted">${htmlEscape(a.reason || '')}</div></div>`).join('') || '<p>Még nincs autonóm ciklus. Nyomj egy „1 autonóm ciklus” gombot.</p>';
  els.autonomousPanel.innerHTML = '<div class="proof-grid">' + rows.map(([k,v]) => `<div class="proof-item"><span>${htmlEscape(k)}</span><strong>${htmlEscape(v)}</strong></div>`).join('') + '</div>'
    + `<div class="operator-summary"><div class="operator-main">${htmlEscape(action.reason || recs[0] || 'Autonóm operátor készen áll paper-safe módban.')}</div><div class="operator-sub">${htmlEscape(recs.slice(1).join(' • ') || 'Éles kereskedés nincs engedélyezve.')}</div></div>`
    + `<div class="proof-row proof-details neutral-row"><span>Autonóm ciklusnapló</span><div class="auto-action-list">${actionList}</div></div>`;
}
function renderMicrostructure(data = {}) {
  if (!els.microPanel) return;
  const of = data.orderflow || {};
  const liq = data.liquidityMap || {};
  const lat = data.latencyEngine || {};
  const an = data.anomalyDetection || {};
  const instinct = data.aiMarketInstinct || {};
  const rows = [
    ['Orderflow pressure', of.pressure || '-'],
    ['Aggressor buy/sell', `${of.aggressorBuy ?? 0}% / ${of.aggressorSell ?? 0}%`],
    ['Imbalance', of.imbalance ?? '-'],
    ['Liquidity', `${liq.state || '-'} / score ${liq.score ?? 0}`],
    ['Spread', liq.spread ?? '-'],
    ['Micro latency', `${lat.microLatencyMs ?? 0}ms / ${lat.feedCadence || '-'}`],
    ['Anomaly score', `${an.score ?? 0}/100`],
    ['AI instinct', instinct.recommended || '-'],
  ];
  const zones = (liq.zones || []).map(z => `<div class="kv"><span>${htmlEscape(z.label)} ${htmlEscape(z.side)}</span><strong>${htmlEscape((z.price ?? '-') + ' / depth ' + (z.depth ?? 0))}</strong></div>`).join('') || '<p>Nincs liquidity zone.</p>';
  const flags = (an.flags || []).join(', ') || 'nincs aktív mikrostruktúra riasztás';
  els.microPanel.innerHTML = '<div class="proof-grid">' + rows.map(([k,v]) => `<div class="proof-item"><span>${htmlEscape(k)}</span><strong>${htmlEscape(v)}</strong></div>`).join('') + '</div>'
    + `<div class="operator-summary"><div class="operator-main">${htmlEscape(instinct.reason || 'Microstructure AI készen áll.')}</div><div class="operator-sub">Bias: ${htmlEscape(instinct.tradeBias || '-')} • Confidence adj: ${htmlEscape(instinct.confidenceAdj ?? 0)} • Flags: ${htmlEscape(flags)}</div></div>`
    + `<div class="proof-row proof-details neutral-row"><span>Liquidity map</span><div>${zones}</div></div>`;
}
async function refreshMicrostructure(tick = false) {
  if (!els.microPanel) return;
  try {
    const data = await api(tick ? '/api/market/microstructure/tick' : '/api/market/microstructure', tick ? { method: 'POST', body: { source: 'ui' } } : {});
    state.microstructure = data;
    renderMicrostructure(data);
  } catch (e) {
    els.microPanel.innerHTML = `<div class="proof-row bad-row"><span>Microstructure hiba</span><strong>${htmlEscape(readableError(e))}</strong></div>`;
  }
}

async function refreshAutonomous() {
  if (!els.autonomousPanel) return;
  try {
    const data = await api('/api/autonomous/status');
    state.autonomous = data;
    renderAutonomous(data);
  } catch (e) {
    els.autonomousPanel.innerHTML = `<div class="proof-row bad-row"><span>Autonomous operator hiba</span><strong>${htmlEscape(readableError(e))}</strong></div>`;
  }
}
async function autonomousCommand(url, label) {
  const data = await api(url, { method: 'POST', body: { source: 'ui' } });
  state.autonomous = data;
  renderAutonomous(data);
  await Promise.allSettled([refreshCore(), refreshControlCenter(), refreshOperator(), refreshOrchestrator(), refreshHistory(), refreshMemoryPanel()]);
  showToast(label);
}

(async function init() {
  wireVenueForms();
  await Promise.allSettled([refreshCore(), refreshHistory(), refreshModels(), refreshVenues(), refreshErrors(), refreshProof(), refreshAiTrader(), refreshMarketLive(), refreshPortfolioAi(), refreshControlCenter(), refreshLearningLab(), refreshMemoryPanel(), refreshAutonomous(), refreshMicrostructure()]);
  setInterval(() => refreshCore().catch(console.error), 10000);
  setInterval(() => refreshHistory().catch(console.error), 15000);
  setInterval(() => refreshVenues().catch(console.error), 20000);
  setInterval(() => refreshProof().catch(console.error), 30000);
  setInterval(() => refreshAiTrader().catch(console.error), 7000);
  setInterval(() => refreshMarketLive().catch(console.error), 5000);
  setInterval(() => refreshPortfolioAi().catch(console.error), 12000);
  setInterval(() => refreshControlCenter().catch(console.error), 6000);
  setInterval(() => refreshLearningLab().catch(console.error), 15000);
  setInterval(() => refreshMarketLive().catch(console.error), 3000);
  setInterval(() => refreshPortfolioAi().catch(console.error), 9000);
  setInterval(() => refreshControlCenter().catch(console.error), 2500);
  setInterval(() => refreshLearningLab().catch(console.error), 8000);
  setInterval(() => refreshOperator().catch(console.error), 4000);
  setInterval(() => refreshMemoryPanel().catch(console.error), 9000);
  setInterval(() => refreshAutonomous().catch(console.error), 6000);
  setInterval(() => refreshMicrostructure().catch(console.error), 3500);
})();


function wireVenueForms() {
  const getCard = (venue) => document.querySelector(`.venue-card[data-venue-card="${venue}"]`);
  const ensureVenueStatus = (venue) => {
    const card = getCard(venue);
    if (!card) return null;
    let line = card.querySelector(`[data-venue-save-status="${venue}"]`);
    if (!line) {
      line = document.createElement('div');
      line.dataset.venueSaveStatus = venue;
      line.className = 'venue-save-status';
      line.textContent = 'Kész a mentésre.';
      const actions = card.querySelector('.venue-actions') || card;
      actions.insertAdjacentElement('afterend', line);
    }
    return line;
  };
  const setVenueStatus = (venue, message, type = 'info') => {
    const line = ensureVenueStatus(venue);
    if (line) { line.textContent = message; line.dataset.state = type; }
  };
  const ensureVenueResult = (venue) => {
    const card = getCard(venue);
    if (!card) return null;
    let box = card.querySelector(`[data-venue-test-result="${venue}"]`);
    if (!box) {
      box = document.createElement('pre');
      box.dataset.venueTestResult = venue;
      box.className = 'venue-test-result';
      box.textContent = 'Teszt eredmény itt fog megjelenni.';
      const statusLine = ensureVenueStatus(venue);
      (statusLine || card).insertAdjacentElement('afterend', box);
    }
    return box;
  };
  const setVenueResult = (venue, data) => {
    const box = ensureVenueResult(venue);
    if (!box) return;
    const payload = data?.proof || data || {};
    box.textContent = JSON.stringify(payload, null, 2);
  };
  const setBusy = (venue, busy) => {
    const card = getCard(venue);
    card?.querySelectorAll(`[data-venue-save="${venue}"], [data-venue-test="${venue}"], [data-venue-clear="${venue}"]`).forEach((btn) => {
      btn.disabled = !!busy;
      btn.classList.toggle('busy', !!busy);
    });
  };
  const readBody = (venue) => {
    const card = getCard(venue);
    const field = (name) => card?.querySelector(`[data-venue-field="${name}"]`);
    const apiKey = field('apiKey')?.value || '';
    const apiSecret = field('apiSecret')?.value || field('secret')?.value || '';
    const passphrase = field('passphrase')?.value || '';
    return {
      venue, apiKey, apiSecret, api_key: apiKey, api_secret: apiSecret, secret: apiSecret, passphrase,
      marketType: field('marketType')?.value || 'futures',
      marginMode: field('marginMode')?.value || 'cross',
      leverage: Number(field('leverage')?.value || 3),
      testnet: !!field('testnet')?.checked,
    };
  };
  VENUES.forEach((venue) => {
    ensureVenueStatus(venue);
    const saveBtn = document.querySelector(`[data-venue-save="${venue}"]`);
    const testBtn = document.querySelector(`[data-venue-test="${venue}"]`);
    const clearBtn = document.querySelector(`[data-venue-clear="${venue}"]`);
    saveBtn?.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        setBusy(venue, true);
        setVenueStatus(venue, 'Mentés folyamatban...', 'info');
        showToast(`${venue.toUpperCase()} mentés folyamatban...`);
        const result = await api('/api/venues/save', { method: 'POST', body: readBody(venue) });
        if (!result.ok && !result.success) throw new Error(result.error || 'A mentés nem sikerült.');
        setVenueStatus(venue, result.hasCredentials ? 'MENTVE ✅' : 'MENTVE, DE HIÁNYOS KULCS ⚠️', result.hasCredentials ? 'ok' : 'warn');
        showToast(result.hasCredentials ? `${venue.toUpperCase()} mentve ✅` : `${venue.toUpperCase()} mentve, de hiányos kulcs ⚠️`);
        await Promise.allSettled([refreshCore(), refreshVenues(), refreshErrors()]);
      } catch (error) {
        const msg = readableError(error);
        console.error(error);
        setVenueStatus(venue, `HIBA ❌ ${msg}`, 'error');
        showToast(`${venue.toUpperCase()} mentési hiba: ${msg}`, true);
      } finally { setBusy(venue, false); }
    });
    testBtn?.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        setBusy(venue, true);
        setVenueStatus(venue, 'Teszt folyamatban...', 'info');
        const result = await api('/api/venues/test', { method: 'POST', body: readBody(venue) });
        setVenueResult(venue, result);
        const proof = result.proof || result;
        const connected = !!(result.connected || proof.connected || proof.status === 'CONNECTED');
        const balanceText = proof.balance ? ` | balance: ${JSON.stringify(proof.balance)}` : '';
        setVenueStatus(venue, connected ? `TESZT OK ✅ ${proof.message || ''}${balanceText}` : `PIAC OK / AUTH HIÁNYOS ⚠️ ${proof.message || ''}`, connected ? 'ok' : 'warn');
        showToast(`${venue.toUpperCase()} teszt: ${proof.status || result.status || 'OK'}`);
        await Promise.allSettled([refreshCore(), refreshHistory(), refreshVenues(), refreshErrors(), refreshProof()]);
      } catch (error) {
        const msg = error.message === 'missing_credentials' ? `${venue.toUpperCase()} hiányos kulcsok` : `${venue.toUpperCase()} teszt hiba: ${readableError(error)}`;
        console.error(error);
        setVenueStatus(venue, `HIBA ❌ ${msg}`, 'error');
        showToast(msg, true);
        await refreshVenues().catch(() => {});
      } finally { setBusy(venue, false); }
    });
    clearBtn?.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        setBusy(venue, true);
        setVenueStatus(venue, 'Törlés folyamatban...', 'info');
        await api('/api/venues/disconnect', { method: 'POST', body: { venue } });
        const card = getCard(venue);
        card?.querySelectorAll('[data-venue-field="apiKey"], [data-venue-field="secret"], [data-venue-field="apiSecret"], [data-venue-field="passphrase"], [data-venue-field="leverage"]').forEach((el) => { el.value = ''; });
        setVenueStatus(venue, 'TÖRÖLVE ✅', 'ok');
        showToast(`${venue.toUpperCase()} törölve`);
        await Promise.allSettled([refreshCore(), refreshVenues(), refreshErrors()]);
      } catch (error) {
        const msg = readableError(error);
        console.error(error);
        setVenueStatus(venue, `HIBA ❌ ${msg}`, 'error');
        showToast(`${venue.toUpperCase()} törlési hiba: ${msg}`, true);
      } finally { setBusy(venue, false); }
    });
  });
}
async function refreshVenues() {
  try {
    const data = await api('/api/venues/config');
    state.venues = data.config || {};
    VENUES.forEach((venue) => {
      const cfg = state.venues[venue] || {};
      const card = document.querySelector(`.venue-card[data-venue-card="${venue}"]`);
      if (!card) return;
      const setValue = (field, value) => {
        const el = card.querySelector(`[data-venue-field="${field}"]`);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!value;
        else el.value = value ?? '';
      };
      const setSecretPlaceholder = (field, value) => {
        const el = card.querySelector(`[data-venue-field="${field}"]`);
        if (!el) return;
        el.value = '';
        el.placeholder = value || (field === 'apiKey' ? 'API kulcs' : field === 'secret' ? 'API titok' : 'Jelszó-kifejezés');
      };
      setSecretPlaceholder('apiKey', cfg.apiKeyMasked || 'API kulcs');
      setSecretPlaceholder('secret', cfg.secretMasked || 'API titok');
      setSecretPlaceholder('apiSecret', cfg.secretMasked || 'API titok');
      setSecretPlaceholder('passphrase', cfg.passphraseMasked || 'Jelszó-kifejezés');
      setValue('marketType', cfg.marketType || 'futures');
      setValue('marginMode', cfg.marginMode || 'cross');
      setValue('leverage', cfg.leverage ?? 3);
      setValue('testnet', !!cfg.testnet);
      const badge = document.querySelector(`[data-venue-status="${venue}"]`);
      if (badge) {
        const has = cfg.hasCredentials || cfg.hasApiKey || cfg.hasApiSecret || cfg.connected;
        const status = cfg.connected ? 'connected' : has ? 'saved' : 'empty';
        const info = { connected:'kapcsolódva', saved:'mentve', empty:'nincs mentve' }[status] || status;
        badge.textContent = info;
        badge.dataset.state = status;
        badge.classList.toggle('active', status !== 'empty');
      }
    });
    refreshExecutionVenueOptions();
  } catch (error) {
    console.error(error);
    showToast(`Venue frissítés hiba: ${readableError(error)}`, true);
  }
}

function proofRowClass(k, v) {
  const value = String(v || '').toUpperCase();
  if (['OK', 'AKTÍV', 'TELJESEN KAPCSOLÓDVA', 'REAL READY', 'ON', 'RUNNING'].includes(value)) return 'good-row';
  if (value.includes('PIAC OK') || value.includes('PAPER') || value.includes('SAFE') || value.includes('DRY_RUN') || value.includes('FALLBACK')) return 'warn-row';
  if (['NEM', 'HIBÁS', 'FAIL', 'ERROR', 'OFF', 'KIKAPCSOLVA'].includes(value) || value.includes('HIBA')) return 'bad-row';
  return 'neutral-row';
}

function proofRows(proof = {}) {
  const yes = (v) => v ? 'OK' : 'NEM';
  const rows = [
    ['Kapcsolat állapot', proof.status === 'CONNECTED' ? 'TELJESEN KAPCSOLÓDVA' : proof.status === 'MARKET_ONLY' ? 'PIAC OK, AUTH HIBA' : 'HIBÁS'],
    ['Venue', (proof.venue || '-').toUpperCase()],
    ['Connector', proof.connector || '-'],
    ['Mentett kulcs', yes(proof.hasCredentials)],
    ['Exchange API / market endpoint', yes(proof.exchangeApiOk)],
    ['Auth / aláírt kérés', yes(proof.authOk)],
    ['Balance lekérés', yes(proof.balanceOk)],
    ['Ticker / market adat', yes(proof.tickerOk)],
    ['Bot figyelés', proof.botWatching ? 'AKTÍV' : 'NEM AKTÍV'],
    ['Tesztkörnyezet', proof.testnet ? 'IGEN' : 'NEM'],
    ['Market type', proof.marketType || '-'],
    ['Symbol', proof.symbol || '-'],
    ['BTC/USDT ár', proof.price || '-'],
    ['Balance preview', proof.balancePreview || '-'],
    ['Utolsó market adat', fmtTs(proof.lastMarketAt)],
    ['Latency', proof.latencyMs != null ? proof.latencyMs + ' ms' : '-'],
  ];
  return rows.map(function(row) {
    const k = row[0], v = row[1];
    return '<div class="proof-row ' + proofRowClass(k, v) + '"><span>' + htmlEscape(k) + '</span><strong>' + htmlEscape(v) + '</strong></div>';
  }).join('') +
    '<div class="proof-row proof-details ' + ((proof.errors || []).length ? 'bad-row' : 'neutral-row') + '"><span>Proof hibák / részletek</span><pre>' + htmlEscape([...(proof.errors || []), ...(proof.hints || [])].join('\n') || 'Nincs részlet.') + '</pre></div>';
}

async function refreshProof() {
  if (!els.proofPanel) return;
  try {
    const venue = els.proofVenue?.value || 'binance';
    const symbol = els.proofSymbol?.value || 'BTC/USDT';
    const data = await api(`/api/connection/proof?venue=${encodeURIComponent(venue)}&symbol=${encodeURIComponent(symbol)}`);
    els.proofPanel.innerHTML = proofRows(data.proof || {});
  } catch (error) {
    els.proofPanel.innerHTML = `<div class="proof-row bad-row"><span>Proof hiba</span><strong>${htmlEscape(readableError(error))}</strong></div>`;
    showToast(`Proof hiba: ${readableError(error)}`, true);
  }
}

function renderAiTrader(t = {}) {
  if (!els.aiTraderPanel) return;
  const decision = t.lastDecision || {};
  const trade = t.lastTrade || null;
  const pos = t.paperPosition || {};
  const rows = [
    ['AI trader állapot', t.enabled ? (t.status || 'AKTÍV') : 'KIKAPCSOLVA'],
    ['Mód', t.mode === 'real_ready' ? 'REAL READY' : 'PAPER FALLBACK / SAFE'],
    ['Bot', t.botRunning ? 'ON' : 'OFF'],
    ['Stage', t.workflowStage || '-'],
    ['DRY_RUN', t.dryRun ? 'IGEN' : 'NEM'],
    ['REAL_TRADING_ENABLED', t.realTradingEnabled ? 'IGEN' : 'NEM'],
    ['Execution útvonal', t.executionPath || '-'],
    ['Real order lock oka', t.tradeLockReason || '-'],
    ['Venue', (t.venue || '-').toUpperCase()],
    ['Symbol', t.symbol || '-'],
    ['Utolsó ár', t.price || '-'],
    ['Utolsó market tick', fmtTs(t.lastTickAt)],
    ['Minták száma', t.sampleCount ?? 0],
    ['Utolsó döntés', decision.action || 'HOLD'],
    ['Confidence', decision.confidence != null ? Math.round(Number(decision.confidence) * 100) + '%' : '-'],
    ['Min confidence', t.learning?.minConfidence != null ? Math.round(Number(t.learning.minConfidence) * 100) + '%' : '-'],
    ['Döntés oka', decision.reason || '-'],
    ['Utolsó trade', trade ? trade.type + ' ' + trade.side + ' ' + trade.qty + ' @ ' + trade.price : '-'],
    ['Paper pozíció', (pos.side || 'flat') + ' qty=' + (pos.qty || 0) + ' entry=' + (pos.entryPrice || '-') + ' PnL=' + (pos.realizedPnl || 0)],
    ['Tanulási PnL', t.learning?.cumulativeReward ?? 0],
    ['AI winrate becslés', t.learning?.winRateEstimate != null ? t.learning.winRateEstimate + '%' : '-'],
    ['Döntések/trade-ek', (t.learning?.totalDecisions ?? 0) + ' / ' + (t.learning?.totalTrades ?? 0)],
  ];
  const main = rows.map(function(row) {
    const k = row[0], v = row[1];
    return '<div class="proof-row ' + proofRowClass(k, v) + '"><span>' + htmlEscape(k) + '</span><strong>' + htmlEscape(v) + '</strong></div>';
  }).join('');
  const decisions = (t.decisions || []).slice(0, 8).map(function(d) {
    return fmtTs(d.time) + ' | ' + d.action + ' | ' + Math.round((d.confidence || 0)*100) + '% | ' + d.reason;
  }).join('\n') || 'Még nincs döntés.';
  const trades = (t.trades || []).slice(0, 8).map(function(x) {
    return fmtTs(x.time) + ' | ' + x.type + ' | ' + x.side + ' ' + x.qty + ' ' + x.symbol + ' @ ' + x.price + ' | PnL=' + (x.totalPaperPnl ?? '-');
  }).join('\n') || 'Még nincs auto trade.';
  els.aiTraderPanel.innerHTML = main +
    '<div class="proof-row proof-details neutral-row"><span>Legutóbbi döntések</span><pre>' + htmlEscape(decisions) + '</pre></div>' +
    '<div class="proof-row proof-details neutral-row"><span>AI paper trade-ek</span><pre>' + htmlEscape(trades) + '</pre></div>';
}

async function refreshAiTrader() {
  if (!els.aiTraderPanel) return;
  try {
    const data = await api('/api/ai-trader/status');
    state.aiTrader = data;
    if (els.aiTraderVenue && data.venue) els.aiTraderVenue.value = data.venue;
    if (els.aiTraderSymbol && data.symbol) els.aiTraderSymbol.value = data.symbol;
    if (els.aiTraderMinConfidence && data.learning?.minConfidence != null) els.aiTraderMinConfidence.value = data.learning.minConfidence;
    if (els.aiTraderMaxQty && data.learning?.maxAutoQty != null) els.aiTraderMaxQty.value = data.learning.maxAutoQty;
    renderAiTrader(data);
  } catch (error) {
    els.aiTraderPanel.innerHTML = '<div class="proof-row bad-row"><span>AI trader hiba</span><strong>' + htmlEscape(readableError(error)) + '</strong></div>';
    showToast('AI trader hiba: ' + readableError(error), true);
  }
}

async function saveAiTraderConfig(patch = {}) {
  const body = { venue: els.aiTraderVenue?.value || 'binance', symbol: els.aiTraderSymbol?.value || 'BTC/USDT', minConfidence: els.aiTraderMinConfidence?.value, maxAutoQty: els.aiTraderMaxQty?.value, ...patch };
  const data = await api('/api/ai-trader/config', { method: 'POST', body });
  state.aiTrader = data;
  renderAiTrader(data);
  return data;
}


function renderMarketLive(data = {}) {
  if (!els.marketLivePanel) return;
  const tick = data.tick || {};
  const ob = data.orderbook || {};
  const fh = data.feedHealth || {};
  const ai = data.aiInput || {};
  const venueRows = (fh.venues || []).map(v => `${v.venue.toUpperCase()}: ${v.status} / ${v.latencyMs} ms`).join('\n') || 'Nincs venue feed adat.';
  const rows = [
    ['Stream állapot', data.running ? 'RUNNING' : 'IDLE'],
    ['Mód', data.paperSafe ? 'PAPER SAFE' : (data.mode || '-')],
    ['Venue', (data.venue || '-').toUpperCase()],
    ['Symbol', data.symbol || '-'],
    ['Ár', tick.price || '-'],
    ['Bid / Ask', tick.bid && tick.ask ? `${tick.bid} / ${tick.ask}` : '-'],
    ['Spread', ob.spread != null ? ob.spread : '-'],
    ['Orderbook imbalance', ob.imbalance != null ? ob.imbalance : '-'],
    ['Liquidity pressure', ob.liquidityPressure || '-'],
    ['Feed health', fh.status || '-'],
    ['Latency', fh.latencyMs != null ? fh.latencyMs + ' ms' : '-'],
    ['Utolsó tick', fmtTs(fh.lastTickAt || tick.ts)],
    ['AI bias', ai.signalBias || '-'],
    ['AI regime', ai.regime || '-'],
    ['AI confidence boost', ai.confidenceBoost != null ? ai.confidenceBoost : '-'],
  ];
  const main = rows.map(([k,v]) => `<div class="proof-row ${proofRowClass(k,v)}"><span>${htmlEscape(k)}</span><strong>${htmlEscape(v)}</strong></div>`).join('');
  els.marketLivePanel.innerHTML = main + `<div class="proof-row proof-details neutral-row"><span>Venue feed</span><pre>${htmlEscape(venueRows)}</pre></div><div class="proof-row proof-details neutral-row"><span>AI input reason</span><pre>${htmlEscape(ai.reason || '-')}</pre></div>`;
}
async function refreshMarketLive() {
  if (!els.marketLivePanel) return;
  try {
    const data = await api('/api/market/live/status');
    state.marketLive = data;
    renderMarketLive(data);
  } catch (e) {
    els.marketLivePanel.innerHTML = `<div class="proof-row bad-row"><span>Live market hiba</span><strong>${htmlEscape(readableError(e))}</strong></div>`;
  }
}
function renderPortfolioAi(data = {}) {
  if (!els.portfolioAiPanel) return;
  const router = data.strategyRouter || {};
  const risk = data.crossExchangeRisk || {};
  const alloc = data.allocation || {};
  const perf = data.venuePerformance || [];
  const rows = [
    ['Portfolio profil', data.profile || '-'],
    ['Strategy router', router.active ? 'ON' : 'OFF'],
    ['Kiválasztott stratégia', router.selected || '-'],
    ['Risk állapot', risk.status || '-'],
    ['Live order lock', risk.liveOrdersLocked ? 'IGEN' : 'NEM'],
    ['Mód', risk.mode || '-'],
    ['Max venue share', risk.maxVenueShare != null ? Math.round(risk.maxVenueShare * 100) + '%' : '-'],
    ['Drawdown limit', risk.portfolioDrawdownLimit != null ? Math.round(risk.portfolioDrawdownLimit * 100) + '%' : '-'],
  ];
  const main = rows.map(([k,v]) => `<div class="proof-row ${proofRowClass(k,v)}"><span>${htmlEscape(k)}</span><strong>${htmlEscape(v)}</strong></div>`).join('');
  const allocation = Object.entries(alloc).map(([k,v]) => `${k.toUpperCase()}: ${Math.round(Number(v)*100)}%`).join('\n') || '-';
  const performance = perf.map(v => `${v.venue.toUpperCase()} | weight ${Math.round(v.weight*100)}% | winrate ${v.winrate}% | ${v.latencyMs} ms | ${v.status}`).join('\n') || '-';
  els.portfolioAiPanel.innerHTML = main + `<div class="proof-row proof-details neutral-row"><span>Tőzsdei súlyok</span><pre>${htmlEscape(allocation)}</pre></div><div class="proof-row proof-details neutral-row"><span>Venue performance</span><pre>${htmlEscape(performance)}</pre></div><div class="proof-row proof-details neutral-row"><span>Router ok</span><pre>${htmlEscape(router.reason || '-')}</pre></div>`;
}
async function refreshPortfolioAi() {
  if (!els.portfolioAiPanel) return;
  try {
    const data = await api('/api/portfolio/status');
    state.portfolioAi = data;
    renderPortfolioAi(data);
  } catch (e) {
    els.portfolioAiPanel.innerHTML = `<div class="proof-row bad-row"><span>Portfolio AI hiba</span><strong>${htmlEscape(readableError(e))}</strong></div>`;
  }
}


function renderControlCenter(data = {}) {
  if (!els.controlCenterPanel) return;
  const c = data.control || {};
  const ai = data.aiExplanation || {};
  const ex = data.executionFeedback || {};
  const pf = data.portfolioCenter || {};
  const sf = data.incidentSafety || {};
  const lm = data.liveMetrics || {};
  const rows = [
    ['Control státusz', c.status || '-'],
    ['Bot', c.botRunning ? 'RUNNING' : 'STOPPED'],
    ['Feed', c.feed || '-'],
    ['Safety', c.safety || '-'],
    ['AI döntés', ai.action || '-'],
    ['AI confidence', ai.confidence != null ? Math.round(Number(ai.confidence) * 100) + '%' : '-'],
    ['Market regime', ai.regime || '-'],
    ['Order state', ex.lastOrderState || '-'],
    ['Fill state', ex.fillState || '-'],
    ['Fill rate', ex.fillRate != null ? ex.fillRate + '%' : '-'],
    ['Reject rate', ex.rejectRate != null ? ex.rejectRate + '%' : '-'],
    ['Order ID', ex.orderId || '-'],
    ['Slippage', ex.slippageBps != null ? ex.slippageBps + ' bps' : '-'],
    ['Execution latency', ex.latencyMs != null ? ex.latencyMs + ' ms' : '-'],
    ['Equity', pf.equity != null ? pf.equity : '-'],
    ['Exposure', pf.exposure != null ? pf.exposure : '-'],
    ['Risk', pf.riskStatus || '-'],
    ['Incidents', sf.activeIncidents ?? '-'],
    ['Drawdown védelem', sf.drawdownProtection || '-'],
    ['AI accuracy', lm.aiAccuracy || '-'],
    ['Execution quality', lm.executionQuality || '-'],
  ];
  const main = rows.map(([k,v]) => `<div class="proof-row ${proofRowClass(k,v)}"><span>${htmlEscape(k)}</span><strong>${htmlEscape(v)}</strong></div>`).join('');
  const allocation = Object.entries(pf.venueAllocation || {}).map(([k,v]) => `${k.toUpperCase()}: ${Math.round(Number(v)*100)}%`).join('\n') || '-';
  els.controlCenterPanel.innerHTML = main
    + `<div class="proof-row proof-details neutral-row"><span>AI magyarázat</span><pre>${htmlEscape(ai.reason || '-')}</pre></div>`
    + `<div class="proof-row proof-details neutral-row"><span>Order lifecycle</span><pre>${htmlEscape((ex.lifecycle || []).map(x => `${x.state} | ${fmtTs(x.ts)} | ${x.note || ''}`).join('\n') || 'Még nincs lifecycle esemény.')}</pre></div>`
    + `<div class="proof-row proof-details neutral-row"><span>Portfolio allocation</span><pre>${htmlEscape(allocation)}</pre></div>`
    + `<div class="proof-row proof-details neutral-row"><span>Safety snapshot</span><pre>${htmlEscape(JSON.stringify(sf, null, 2))}</pre></div>`;
}
async function refreshControlCenter() {
  if (!els.controlCenterPanel) return;
  try {
    const data = await api('/api/control/realtime');
    state.controlCenter = data;
    renderControlCenter(data);
  } catch (e) {
    els.controlCenterPanel.innerHTML = `<div class="proof-row bad-row"><span>Control center hiba</span><strong>${htmlEscape(readableError(e))}</strong></div>`;
  }
}


function currentOperatorMode() {
  return localStorage.getItem('nexus_operator_mode') || 'balanced';
}
function currentOperatorView() {
  return localStorage.getItem('nexus_operator_view') || 'beginner';
}
function setOperatorButtons() {
  $$('.operator-mode').forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === currentOperatorMode()));
  $$('.operator-view').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === currentOperatorView()));
  document.body.dataset.operatorView = currentOperatorView();
}
function operatorAdvice(snapshot={}, control={}, learning={}) {
  const mode = currentOperatorMode();
  const running = !!(snapshot.botRunning || snapshot.snapshot?.botRunning);
  const readiness = snapshot.readiness || snapshot.snapshot?.readiness || control?.control?.status || 'paper ready';
  const ai = control.aiExplanation || {};
  const confidence = Number(ai.confidence ?? snapshot.ai?.confidence ?? 0.56);
  const risk = control.incidentSafety || {};
  if (risk.activeIncidents > 0) return 'Ajánlott: maradj Safe módban, ellenőrizd az incident centert, és ne lépj live irányba.';
  if (!running) return 'Ajánlott: először Paper/Safe módban indítsd el a botot, majd figyeld 15-30 percig az AI confidence értéket.';
  if (confidence < 0.55) return 'Ajánlott: Learning mód vagy Balanced mód. Az AI confidence még alacsony, ne növeld a kockázatot.';
  if (mode === 'aggressive') return 'Ajánlott: csak paper módban használd az Aggressive profilt, amíg a backtest és winrate stabil.';
  if (readiness.toString().toLowerCase().includes('ready')) return 'Ajánlott: folytasd paper módban. A rendszer stabil, de live promóció előtt kell drawdown és winrate szabály.';
  return 'Ajánlott: frissítsd a market feedet, futtass learning ciklust, majd nézd meg a performance lab eredményt.';
}
function renderOperatorPanel(snapshot={}, control={}, learning={}, brain={}) {
  if (!els.operatorPanel) return;
  const mode = currentOperatorMode();
  const view = currentOperatorView();
  const snap = snapshot.snapshot || snapshot;
  const ai = control.aiExplanation || {};
  const ex = control.executionFeedback || {};
  const pf = control.portfolioCenter || {};
  const safety = control.incidentSafety || {};
  const lab = learning.learning || {};
  const brainCore = brain.brain || {};
  const brainMetrics = brain.realMetrics || {};
  const advice = operatorAdvice(snapshot, control, learning);
  const confidence = ai.confidence != null ? Math.round(Number(ai.confidence)*100) + '%' : (snap.hitRate || '-');
  const rows = [
    ['Operator mód', mode.toUpperCase()],
    ['Nézet', view === 'fullpro' ? 'FULL PRO' : view.toUpperCase()],
    ['Bot állapot', snap.botRunning ? 'RUNNING' : 'STOPPED'],
    ['AI confidence', brainMetrics.confidence != null ? Math.round(Number(brainMetrics.confidence)*100) + '%' : confidence],
    ['AI Brain', brainCore.status || 'STANDBY'],
    ['Brain döntés', brainCore.decision || 'HOLD_OBSERVE'],
    ['Market regime', ai.regime || snap.marketRegime || 'balanced / paper'],
    ['Kockázat', safety.riskStatus || pf.riskStatus || 'paper-safe'],
    ['Utolsó execution', ex.lastOrderState || 'nincs éles order'],
    ['Learning score', brainMetrics.learningScore != null ? brainMetrics.learningScore : (lab.rewardScore != null ? lab.rewardScore : '-')],
    ['Execution quality', brainMetrics.executionQualityScore != null ? brainMetrics.executionQualityScore + '%' : '-'],
  ];
  const rowHtml = rows.map(([k,v]) => `<div class="proof-row ${proofRowClass(k,v)}"><span>${htmlEscape(k)}</span><strong>${htmlEscape(v)}</strong></div>`).join('');
  const simple = `<div class="operator-summary"><div class="operator-main">${htmlEscape(advice)}</div><div class="operator-sub">AI Brain: ${htmlEscape(brainCore.reason || ai.reason || 'Paper-safe döntési réteg aktív.')} </div></div>`;
  const advanced = `<div class="proof-row proof-details neutral-row operator-advanced"><span>Részletes állapot</span><pre>${htmlEscape(JSON.stringify({mode, view, brain: brain.brain, metrics: brain.realMetrics, memory: brain.memory, portfolio: pf, safety, execution: ex}, null, 2))}</pre></div>`;
  els.operatorPanel.innerHTML = simple + '<div class="operator-grid">' + rowHtml + '</div>' + (view === 'beginner' ? '' : advanced);
}
function defaultAiBrain() {
  return {
    brain: {
      status: 'STANDBY',
      decision: 'HOLD_OBSERVE',
      reason: 'AI Brain fallback aktív: várakozás stabil adatra.'
    },
    realMetrics: {
      confidence: 0.56,
      learningScore: 0,
      executionQualityScore: 0
    },
    memory: { status: 'local-fallback', notes: [] }
  };
}

async function refreshOperator() {
  if (!els.operatorPanel) return;
  try {
    const [snapshot, control, learning, brainResponse] = await Promise.all([
      api('/api/operator/snapshot'),
      api('/api/control/realtime'),
      api('/api/learning/status'),
      api('/api/ai/brain').catch(() => defaultAiBrain()),
    ]);
    const brain = brainResponse || defaultAiBrain();
    state.operator = {snapshot, control, learning, brain};
    state.aiBrain = brain;
    renderOperatorPanel(snapshot, control, learning, brain);
  } catch(e) {
    els.operatorPanel.innerHTML = `<div class="proof-row bad-row"><span>Operator hiba</span><strong>${htmlEscape(readableError(e))}</strong></div>`;
  }
}

function renderLearningLab(data = {}) {
  if (!els.learningLabPanel) return;
  const learning = data.learning || {};
  const backtest = data.backtest || {};
  const perf = data.performanceLab || {};
  const evo = data.modelEvolution || {};
  const registry = data.modelRegistry || {};
  const rows = [
    ['Learning állapot', learning.status || '-'],
    ['Reward score', learning.rewardScore != null ? learning.rewardScore : '-'],
    ['Trade outcome minták', learning.samples ?? 0],
    ['Winrate becslés', learning.winRate != null ? learning.winRate + '%' : '-'],
    ['Aktív stratégia súly', evo.activeStrategyWeight != null ? Math.round(evo.activeStrategyWeight * 100) + '%' : '-'],
    ['Confidence tuning', evo.confidenceAdjustment != null ? evo.confidenceAdjustment : '-'],
    ['Backtest státusz', backtest.status || '-'],
    ['Backtest PnL', backtest.pnl != null ? backtest.pnl : '-'],
    ['Max drawdown', perf.maxDrawdown != null ? perf.maxDrawdown + '%' : '-'],
    ['Sharpe-like', perf.sharpeLike != null ? perf.sharpeLike : '-'],
    ['Regime teljesítmény', perf.bestRegime || '-'],
    ['Model verzió', registry.activeVersion || '-'],
    ['Utolsó snapshot', fmtTs(registry.lastSnapshotAt)],
  ];
  const main = rows.map(([k,v]) => `<div class="proof-row ${proofRowClass(k,v)}"><span>${htmlEscape(k)}</span><strong>${htmlEscape(v)}</strong></div>`).join('');
  const strategyWeights = Object.entries(evo.strategyWeights || {}).map(([k,v]) => `${k}: ${Math.round(Number(v)*100)}%`).join('\n') || '-';
  const replay = (backtest.replay || []).slice(0, 10).map(x => `${fmtTs(x.time)} | ${x.action} | reward=${x.reward} | equity=${x.equity}`).join('\n') || 'Még nincs backtest replay.';
  const lessons = (learning.lessons || []).slice(0, 8).map(x => `${fmtTs(x.time)} | ${x.lesson}`).join('\n') || 'Még nincs tanulási lecke.';
  els.learningLabPanel.innerHTML = main
    + `<div class="proof-row proof-details neutral-row"><span>Strategy weighting</span><pre>${htmlEscape(strategyWeights)}</pre></div>`
    + `<div class="proof-row proof-details neutral-row"><span>Backtest replay</span><pre>${htmlEscape(replay)}</pre></div>`
    + `<div class="proof-row proof-details neutral-row"><span>AI learning journal</span><pre>${htmlEscape(lessons)}</pre></div>`;
}
async function refreshLearningLab() {
  if (!els.learningLabPanel) return;
  try {
    const data = await api('/api/learning/status');
    state.learningLab = data;
    renderLearningLab(data);
  } catch (e) {
    els.learningLabPanel.innerHTML = `<div class="proof-row bad-row"><span>Learning/backtest hiba</span><strong>${htmlEscape(readableError(e))}</strong></div>`;
  }
}

function formatErrors(errors = []) {
  if (!errors.length) return 'Nincs még rögzített hiba.';
  return errors.map((e, i) => `#${i + 1}\nIdő: ${fmtTs(e.time)}\nForrás: ${e.source || 'hiba'}\nÜzenet: ${e.message || '-'}\nMeta: ${JSON.stringify(e.meta || {}, null, 2)}\n---`).join('\n\n');
}

async function refreshErrors() {
  if (!els.errorPanel && !els.errorCopyArea) return;
  let errors = [];
  try {
    const remote = await api('/api/errors');
    errors = remote.errors || [];
  } catch (_) {
    errors = JSON.parse(localStorage.getItem('nexus_error_log') || '[]');
  }
  const text = formatErrors(errors);
  if (els.errorCopyArea) els.errorCopyArea.value = text;
  if (els.errorPanel) {
    els.errorPanel.innerHTML = errors.length ? errors.map((e) => `<div class="log-entry"><div class="top"><span class="tag">${htmlEscape(e.source || 'hiba')}</span><span>${fmtTs(e.time)}</span></div><pre>${htmlEscape(e.message || '-')}</pre></div>`).join('') : '<p>Nincs még rögzített hiba.</p>';
  }
}

function refreshExecutionVenueOptions() {
  const select = $('execVenue');
  if (!select) return;
  const current = select.value;
  select.innerHTML = VENUES.map((v) => `<option value="${v}">${v.toUpperCase()}</option>`).join('');
  if (current) select.value = current;
}

els.aiTraderRefreshBtn?.addEventListener('click', () => refreshAiTrader());
els.aiTraderVenue?.addEventListener('change', () => saveAiTraderConfig().then(() => showToast('AI trader venue frissítve')).catch(e => showToast('AI trader config hiba: ' + readableError(e), true)));
els.aiTraderSymbol?.addEventListener('change', () => saveAiTraderConfig().then(() => showToast('AI trader symbol frissítve')).catch(e => showToast('AI trader config hiba: ' + readableError(e), true)));
els.aiTraderMinConfidence?.addEventListener('change', () => saveAiTraderConfig().then(() => showToast('AI trader confidence küszöb frissítve')).catch(e => showToast('AI trader config hiba: ' + readableError(e), true)));
els.aiTraderMaxQty?.addEventListener('change', () => saveAiTraderConfig().then(() => showToast('AI trader méret frissítve')).catch(e => showToast('AI trader config hiba: ' + readableError(e), true)));
els.aiTraderToggleBtn?.addEventListener('click', async () => {
  try {
    const next = !(state.aiTrader?.enabled);
    await saveAiTraderConfig({ enabled: next });
    showToast(next ? 'Auto AI trader bekapcsolva' : 'Auto AI trader kikapcsolva');
  } catch (e) { showToast('AI trader kapcsoló hiba: ' + readableError(e), true); }
});
els.aiTraderRunOnceBtn?.addEventListener('click', async () => {
  try {
    const data = await api('/api/ai-trader/run-once', { method: 'POST', body: {} });
    renderAiTrader(data);
    await refreshHistory();
    showToast('AI trader 1 kör lefutott');
  } catch (e) { showToast('AI trader kör hiba: ' + readableError(e), true); }
});
els.proofRefreshBtn?.addEventListener('click', () => refreshProof());
els.refreshErrorsBtn?.addEventListener('click', () => refreshErrors());
els.copyErrorsBtn?.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(els.errorCopyArea?.value || ''); showToast('Hibanapló kimásolva'); } catch { showToast('Másolás nem sikerült', true); }
});
els.clearErrorsBtn?.addEventListener('click', async () => { try { await api('/api/errors', { method: 'DELETE' }); localStorage.removeItem('nexus_error_log'); await refreshErrors(); showToast('Hibanapló törölve'); } catch (e) { showToast(`Hibanapló törlési hiba: ${readableError(e)}`, true); } });
els.tradeTestBtn?.addEventListener('click', async () => {
  try {
    const body = { venue: els.proofVenue?.value || 'binance', symbol: els.proofSymbol?.value || 'BTC/USDT', side: 'buy', amount: 0.001 };
    const result = await api('/api/execution/test-order', { method: 'POST', body });
    const order = result.order || {};
    const lifecycle = (order.lifecycle || []).map(x => `${x.state} | ${fmtTs(x.ts)} | ${x.note || ''}`).join('\n');
    if (els.tradeTestOutput) els.tradeTestOutput.textContent = JSON.stringify({
      message: result.message,
      orderId: order.id,
      state: order.state,
      side: order.side,
      qty: order.qty,
      expectedPrice: order.expectedPrice,
      fillPrice: order.fillPrice,
      slippageBps: order.slippageBps,
      latencyMs: order.latencyMs,
      lifecycle
    }, null, 2);
    showToast('v163 paper execution lifecycle rögzítve');
    await Promise.allSettled([refreshHistory(), refreshProof(), refreshControlCenter(), refreshOperator()]);
  } catch (error) {
    if (els.tradeTestOutput) els.tradeTestOutput.textContent = readableError(error);
    showToast(`Trade teszt hiba: ${readableError(error)}`, true);
  }
});


els.operatorRefreshBtn?.addEventListener('click', () => refreshOperator().then(() => showToast('AI Operator frissítve')));
$$('.operator-mode').forEach((btn) => btn.addEventListener('click', async () => {
  localStorage.setItem('nexus_operator_mode', btn.dataset.mode || 'balanced');
  setOperatorButtons();
  if (btn.dataset.mode === 'safe') await api('/api/ai/tuning', { method:'POST', body:{ profile:'safe' }}).catch(()=>{});
  if (btn.dataset.mode === 'balanced') await api('/api/ai/tuning', { method:'POST', body:{ profile:'balanced' }}).catch(()=>{});
  if (btn.dataset.mode === 'aggressive') await api('/api/ai/tuning', { method:'POST', body:{ profile:'profit_max' }}).catch(()=>{});
  if (btn.dataset.mode === 'learning') await api('/api/learning/train-cycle', { method:'POST', body:{} }).catch(()=>{});
  await Promise.allSettled([refreshCore(), refreshOperator(), refreshControlCenter(), refreshLearningLab(), refreshMemoryPanel()]);
  showToast('Operator mód: ' + (btn.dataset.mode || 'balanced'));
}));
$$('.operator-view').forEach((btn) => btn.addEventListener('click', () => {
  localStorage.setItem('nexus_operator_view', btn.dataset.view || 'beginner');
  setOperatorButtons();
  refreshOperator();
  showToast('Nézet: ' + (btn.dataset.view || 'beginner'));
}));
setOperatorButtons();

els.marketLiveRefreshBtn?.addEventListener('click', () => refreshMarketLive().then(() => showToast('Live market panel frissítve')));
els.marketLiveStartBtn?.addEventListener('click', async () => { try { const d = await api('/api/market/live/start', { method: 'POST', body: {} }); renderMarketLive(d); await Promise.allSettled([refreshCore(), refreshControlCenter(), refreshPortfolioAi()]); showToast('Live market stream elindítva paper-safe módban'); } catch (e) { showToast('Live market start hiba: ' + readableError(e), true); } });
els.marketLiveStopBtn?.addEventListener('click', async () => { try { const d = await api('/api/market/live/stop', { method: 'POST', body: {} }); renderMarketLive(d); await Promise.allSettled([refreshCore(), refreshControlCenter(), refreshPortfolioAi()]); showToast('Live market stream leállítva'); } catch (e) { showToast('Live market stop hiba: ' + readableError(e), true); } });
els.portfolioAiRefreshBtn?.addEventListener('click', () => refreshPortfolioAi().then(() => showToast('Portfolio AI panel frissítve')));
els.controlCenterRefreshBtn?.addEventListener('click', () => refreshControlCenter().then(() => showToast('Control center frissítve')));
els.learningRefreshBtn?.addEventListener('click', () => refreshLearningLab().then(() => showToast('Learning lab frissítve')));
els.learningTrainBtn?.addEventListener('click', async () => { try { const d = await api('/api/learning/train-cycle', { method: 'POST', body: {} }); renderLearningLab(d); await Promise.allSettled([refreshHistory(), refreshModels(), refreshControlCenter(), refreshAiTrader()]); showToast('Tanulási ciklus lefutott'); } catch (e) { showToast('Tanulási ciklus hiba: ' + readableError(e), true); } });
els.backtestRunBtn?.addEventListener('click', async () => { try { const d = await api('/api/backtest/run', { method: 'POST', body: { symbol: els.aiTraderSymbol?.value || 'BTC/USDT' } }); renderLearningLab(d); await Promise.allSettled([refreshHistory(), refreshModels(), refreshControlCenter()]); showToast('Backtest lefutott'); } catch (e) { showToast('Backtest hiba: ' + readableError(e), true); } });
els.memoryRefreshBtn?.addEventListener('click', () => refreshMemoryPanel().catch(e => showToast(e, true)));
els.memorySyncBtn?.addEventListener('click', () => syncMemory().catch(e => showToast(e, true)));
els.memorySnapshotBtn?.addEventListener('click', () => saveMemorySnapshotUi().catch(e => showToast(e, true)));

els.microRefreshBtn?.addEventListener('click', () => refreshMicrostructure().then(() => showToast('Microstructure AI frissítve')));
els.microTickBtn?.addEventListener('click', () => refreshMicrostructure(true).then(() => Promise.allSettled([refreshControlCenter(), refreshOperator()])).then(() => showToast('Microstructure tick lefutott')));
els.autoRefreshBtn?.addEventListener('click', () => refreshAutonomous().then(() => showToast('Autonomous operator frissítve')));
els.autoStartBtn?.addEventListener('click', () => autonomousCommand('/api/autonomous/start', 'Autonóm operátor elindítva paper-safe módban').catch(e => showToast(readableError(e), true)));
els.autoStopBtn?.addEventListener('click', () => autonomousCommand('/api/autonomous/stop', 'Autonóm operátor leállítva').catch(e => showToast(readableError(e), true)));
els.autoTickBtn?.addEventListener('click', () => autonomousCommand('/api/autonomous/tick', 'Autonóm ciklus lefutott').catch(e => showToast(readableError(e), true)));

els.modelSnapshotBtn?.addEventListener('click', async () => { try { const d = await api('/api/model-registry/snapshot', { method: 'POST', body: {} }); renderLearningLab(d); await Promise.allSettled([refreshModels(), refreshCore()]); showToast('Model snapshot mentve'); } catch (e) { showToast('Model snapshot hiba: ' + readableError(e), true); } });



// ===== v168-v171 SAFE MERGE UI ADDITIONS =====
function kvLine(k,v){ return `<div class="kv"><span>${htmlEscape(k)}</span><strong>${htmlEscape(v)}</strong></div>`; }
async function refreshMetaPanel(){
  const box=document.getElementById('metaPanel'); if(!box) return;
  try{ const d=await api('/api/meta/status'); box.innerHTML=`<div class="grid grid-3"><div>${kvLine('Consensus', (d.consensus||0)+'%')}</div><div>${kvLine('Domináns AI', d.dominantLeader?.name||'-')}</div><div>${kvLine('Globális risk', d.globalRisk?.state||'-')}</div></div><pre>${htmlEscape(JSON.stringify(d.aiLeaders||[],null,2))}</pre><div class="muted">${htmlEscape(d.conflictResolution||'')}</div>`; }
  catch(e){ box.innerHTML='<p class="bad">Meta AI hiba: '+htmlEscape(readableError(e))+'</p>'; }
}
async function refreshDeploymentPanel(){
  const box=document.getElementById('deploymentPanel'); if(!box) return;
  try{ const d=await api('/api/deployment/status'); const dep=d.deployment||{}; box.innerHTML=`<div class="grid grid-3"><div>${kvLine('Stage', dep.stage||'-')}</div><div>${kvLine('Readiness', (dep.readiness||0)+'%')}</div><div>${kvLine('Live approval', dep.liveApproved?'IGEN':'NEM')}</div></div><div class="checklist">${(dep.checklist||[]).map(x=>`<div class="kv"><span>${htmlEscape(x.label)}</span><strong>${x.ok?'✅':'❌'}</strong></div>`).join('')}</div>`; }
  catch(e){ box.innerHTML='<p class="bad">Deployment hiba: '+htmlEscape(readableError(e))+'</p>'; }
}
async function refreshSupervisionPanel(){
  const box=document.getElementById('supervisionPanel'); if(!box) return;
  try{ const d=await api('/api/supervision/status'); const s=d.supervision||{}; box.innerHTML=`<div class="grid grid-3"><div>${kvLine('Health', (s.healthScore||0)+'%')}</div><div>${kvLine('Severity', s.severity||'-')}</div><div>${kvLine('Recovery', s.recovery||'-')}</div></div><div class="note">${htmlEscape(s.diagnostic||'')}</div><div>${(d.incidents||[]).map(i=>`<div class="incident-item"><b>${htmlEscape(i.severity)}</b> – ${htmlEscape(i.title)}<br><span>${htmlEscape(i.action)}</span></div>`).join('') || '<div class="muted">Nincs aktív incidens.</div>'}</div>`; }
  catch(e){ box.innerHTML='<p class="bad">Supervision hiba: '+htmlEscape(readableError(e))+'</p>'; }
}
async function refreshCapitalPanel(){
  const box=document.getElementById('capitalPanel'); if(!box) return;
  try{ const d=await api('/api/capital/status'); box.innerHTML=`<div class="grid grid-3"><div>${kvLine('Risk mód', d.riskMode||'-')}</div><div>${kvLine('Total exposure', (d.totalExposure||0)+'%')}</div><div>${kvLine('Sizing', (d.dynamicSizing?.currentMultiplier||0)+'x')}</div></div><div class="venues-grid">${(d.allocationMatrix||[]).map(v=>`<article class="venue-card"><div class="venue-head"><h3>${htmlEscape(v.venue)}</h3><span class="venue-badge">${v.allocation}%</span></div>${kvLine('Exposure', v.exposure+'%')}${kvLine('Score', v.score)}</article>`).join('')}</div><div class="note">${htmlEscape(d.dynamicSizing?.reason||'')}</div>`; }
  catch(e){ box.innerHTML='<p class="bad">Capital hiba: '+htmlEscape(readableError(e))+'</p>'; }
}
async function refreshV171SafePanels(){ await Promise.allSettled([refreshMetaPanel(), refreshDeploymentPanel(), refreshSupervisionPanel(), refreshCapitalPanel()]); }
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('metaRefreshBtn')?.addEventListener('click',()=>refreshMetaPanel().then(()=>showToast('Meta AI frissítve')));
  document.getElementById('deploymentRefreshBtn')?.addEventListener('click',()=>refreshDeploymentPanel().then(()=>showToast('Deployment frissítve')));
  document.getElementById('deploymentRollbackBtn')?.addEventListener('click',async()=>{ await api('/api/deployment/rollback',{method:'POST',body:{}}); await Promise.allSettled([refreshDeploymentPanel(), refreshCore()]); showToast('Rollback paper módba'); });
  document.getElementById('deploymentEmergencyBtn')?.addEventListener('click',async()=>{ await api('/api/deployment/emergency-stop',{method:'POST',body:{}}); await Promise.allSettled([refreshDeploymentPanel(), refreshSupervisionPanel(), refreshCore()]); showToast('Emergency stop aktiválva', true); });
  document.getElementById('supervisionRefreshBtn')?.addEventListener('click',()=>refreshSupervisionPanel().then(()=>showToast('Supervisor frissítve')));
  document.getElementById('supervisionRecoverBtn')?.addEventListener('click',async()=>{ await api('/api/supervision/action',{method:'POST',body:{action:'recover'}}); await refreshSupervisionPanel(); showToast('Recovery lefutott'); });
  document.getElementById('supervisionDowngradeBtn')?.addEventListener('click',async()=>{ await api('/api/supervision/action',{method:'POST',body:{action:'downgrade_safe'}}); await Promise.allSettled([refreshSupervisionPanel(), refreshDeploymentPanel(), refreshCore()]); showToast('Safe downgrade paper módba'); });
  document.getElementById('capitalRefreshBtn')?.addEventListener('click',()=>refreshCapitalPanel().then(()=>showToast('Capital panel frissítve')));
  document.getElementById('capitalRebalanceBtn')?.addEventListener('click',async()=>{ await api('/api/capital/rebalance',{method:'POST',body:{paper:true}}); await refreshCapitalPanel(); showToast('Paper rebalance lefutott'); });
  refreshV171SafePanels(); setInterval(refreshV171SafePanels,15000);
});


// ===== v172 SAFE MERGE UI: Market Simulation Lab =====
async function refreshSimulationPanel(){
  const box=document.getElementById('simulationPanel'); if(!box) return;
  try{
    const d=await api('/api/simulation/status');
    const last=d.lastRun;
    box.innerHTML=`<div class="grid grid-3"><div>${kvLine('Aktív scenario', d.activeScenario||'-')}</div><div>${kvLine('Run count', String(d.runCount||0))}</div><div>${kvLine('Safety', d.safety||'paper-only')}</div></div>
      <div class="note">${htmlEscape(d.stressSummary||'')}</div>
      <div class="venues-grid">${(d.scenarios||[]).map(sc=>`<article class="venue-card sim-scenario" data-scenario="${htmlEscape(sc.id)}"><div class="venue-head"><h3>${htmlEscape(sc.name)}</h3><span class="venue-badge">stress ${sc.stress}%</span></div>${kvLine('Volatility', sc.volatility+'%')}${kvLine('Liquidity', sc.liquidity+'%')}</article>`).join('')}</div>
      ${last?`<div class="note"><b>Utolsó eredmény:</b> ${htmlEscape(last.scenarioName)} · survival ${last.survivalScore}% · stability ${last.strategyStability}% · action: ${htmlEscape(last.suggestedAction)}</div>`:''}`;
    document.querySelectorAll('[data-scenario]').forEach(card=>card.addEventListener('click',()=>runSimulation(card.getAttribute('data-scenario'))));
  }catch(e){ box.innerHTML='<p class="bad">Simulation Lab hiba: '+htmlEscape(readableError(e))+'</p>'; }
}
async function runSimulation(scenario){
  const d=await api('/api/simulation/run',{method:'POST',body:{scenario}});
  await refreshSimulationPanel();
  showToast('Szimuláció lefutott: '+(d.result?.scenarioName||scenario));
}
async function runMonteCarlo(){
  const d=await api('/api/simulation/monte-carlo',{method:'POST',body:{count:8}});
  await refreshSimulationPanel();
  showToast('Monte Carlo kész: survival '+(d.monteCarlo?.avgSurvival||0)+'%');
}
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('simulationRefreshBtn')?.addEventListener('click',()=>refreshSimulationPanel().then(()=>showToast('Simulation Lab frissítve')));
  document.getElementById('simulationRunBtn')?.addEventListener('click',()=>runSimulation(document.getElementById('simulationScenario')?.value||'trend_up'));
  document.getElementById('simulationMonteCarloBtn')?.addEventListener('click',()=>runMonteCarlo());
  refreshSimulationPanel();
  setInterval(refreshSimulationPanel,20000);
});


/* ===== NEXUS v173 STRATEGY EVOLUTION UI SAFE MERGE ===== */
async function nexusV173Api(url,opt){const r=await fetch(url,opt);return await r.json()}
function nexusV173El(id){return document.getElementById(id)}
async function refreshStrategyEvolution(){
 try{const d=await nexusV173Api("/api/evolution/status");const e=d.evolution||{},b=e.bestStrategy||{};
 ["evo-generation",e.generation],["evo-score",(e.evolutionScore??"--")+"%"],["evo-best",b.name||"nincs adat"],["evo-survival",(b.survival??"--")+"%"],["evo-stability",(b.stability??"--")+"%"],["evo-note",e.researcherNote||""].forEach(x=>{const n=nexusV173El(x[0]);if(n)n.textContent=x[1]});
 const list=nexusV173El("evo-list");if(list){list.innerHTML=(e.population||[]).map(s=>`<div class="evo-row"><b>${s.name}</b><span>${s.status}</span><small>survival ${s.survival}% · stability ${s.stability}% · mutation ${Math.round(s.mutation*100)}%</small></div>`).join("")||"<div class='muted'>Nincs generáció.</div>";}
 }catch(err){console.error("v173 evolution refresh error",err)}
}
async function runStrategyEvolution(){await nexusV173Api("/api/evolution/run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"sandbox"})});refreshStrategyEvolution()}
window.NEXUS_V173={refreshStrategyEvolution,runStrategyEvolution};
document.addEventListener("DOMContentLoaded",()=>{refreshStrategyEvolution();setInterval(refreshStrategyEvolution,7000)});

/* ===== NEXUS v174 MULTI TIMEFRAME UI SAFE MERGE ===== */
async function nexusV174Api(url,opt){const r=await fetch(url,opt);return await r.json()}
function nexusV174El(id){return document.getElementById(id)}
function nexusV174BiasClass(b){return b==="bullish"?"ok":b==="bearish"?"danger":"mid"}
async function refreshMultiTimeframe(){try{const d=await nexusV174Api("/api/timeframe/status");const t=d.timeframes||{};if(nexusV174El("tf-consensus"))nexusV174El("tf-consensus").textContent=(t.consensusScore??"--")+"%";if(nexusV174El("tf-dominant"))nexusV174El("tf-dominant").textContent=t.dominantStructure||"--";if(nexusV174El("tf-macro"))nexusV174El("tf-macro").textContent=t.macroBias||"--";if(nexusV174El("tf-micro"))nexusV174El("tf-micro").textContent=t.microBias||"--";if(nexusV174El("tf-action"))nexusV174El("tf-action").textContent=t.recommendedAction||"";const list=nexusV174El("tf-list");if(list){list.innerHTML=(t.frames||[]).map(f=>`<div class="tf-row"><b>${f.tf}</b><span class="badge ${nexusV174BiasClass(f.bias)}">${f.bias}</span><small>${f.regime} · strength ${f.strength}% · vol ${f.volatility}</small></div>`).join("")||"<div class='muted'>Nincs timeframe adat.</div>"}const match=nexusV174El("tf-strategy-match");if(match&&t.strategyMatch){match.innerHTML=Object.entries(t.strategyMatch).map(([k,v])=>`<div class="box"><b>${k}</b><br><small>${v}</small></div>`).join("")}}catch(e){console.error("v174 timeframe refresh error",e)}}
async function recalcMultiTimeframe(){await nexusV174Api("/api/timeframe/recalculate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"paper-safe"})});refreshMultiTimeframe()}
window.NEXUS_V174={refreshMultiTimeframe,recalcMultiTimeframe};document.addEventListener("DOMContentLoaded",()=>{refreshMultiTimeframe();setInterval(refreshMultiTimeframe,8000)});


/* ===== NEXUS v175.1 CROSS-MARKET UI SAFE MERGE ===== */
async function nexusV175Api(url,opt){const r=await fetch(url,opt);return await r.json();}
function nexusV175El(id){return document.getElementById(id);}
async function refreshCrossMarket(){
  try{
    const d=await nexusV175Api("/api/cross-market/status");
    const c=d.crossMarket || d || {};
    if(nexusV175El("cm-leader"))nexusV175El("cm-leader").textContent=(c.leadership?.asset||"--")+" · "+(c.leadership?.confidence??"--")+"%";
    if(nexusV175El("cm-flow"))nexusV175El("cm-flow").textContent=(c.capitalFlow?.direction||"--")+" · strength "+(c.capitalFlow?.strength??"--")+"%";
    if(nexusV175El("cm-context"))nexusV175El("cm-context").textContent=c.globalContext||"--";
    if(nexusV175El("cm-action"))nexusV175El("cm-action").textContent=c.recommendedAction||"--";
    if(nexusV175El("cm-dominance"))nexusV175El("cm-dominance").textContent="BTC "+(c.dominance?.btc??"--")+"% · Stablecoin "+(c.dominance?.stablecoin??"--")+"% · Alt rotation "+(c.dominance?.altRotation||"--");
    const list=nexusV175El("cm-correlation-list");
    if(list){
      list.innerHTML=(c.correlation||[]).map(x=>`<div class="cm-row"><b>${x.pair}</b><span>${Math.round(x.value*100)}%</span><small>${x.state}</small></div>`).join("")||"<div class='muted'>Nincs correlation adat.</div>";
    }
  }catch(e){console.error("v175 cross-market refresh error",e);}
}
window.NEXUS_V175={refreshCrossMarket};
document.addEventListener("DOMContentLoaded",()=>{refreshCrossMarket();setInterval(refreshCrossMarket,9000);});

/* ===== NEXUS v176 EXECUTION OPTIMIZATION UI SAFE MERGE ===== */
async function nexusV176Api(url,opt){const r=await fetch(url,opt);return await r.json()}
function nexusV176El(id){return document.getElementById(id)}
async function refreshExecutionOptimization(){try{const d=await nexusV176Api('/api/execution-optimization/status');const x=d.executionOptimization||{},s=x.selectedExecutionStyle||{};if(nexusV176El('exo-style'))nexusV176El('exo-style').textContent=(s.style||'--')+' · score '+(s.score??'--')+'%';if(nexusV176El('exo-slippage'))nexusV176El('exo-slippage').textContent=(x.slippage?.expectedBps??'--')+' bps / max '+(x.slippage?.maxAllowedBps??'--')+' bps';if(nexusV176El('exo-fill'))nexusV176El('exo-fill').textContent=(x.fillQuality?.lastScore??'--')+'% · partial risk '+(x.fillQuality?.partialFillRisk||'--');if(nexusV176El('exo-liquidity'))nexusV176El('exo-liquidity').textContent='depth '+(x.liquidity?.depthScore??'--')+'% · spread '+(x.liquidity?.spreadBps??'--')+' bps · gap '+(x.liquidity?.gapRisk||'--');if(nexusV176El('exo-impact'))nexusV176El('exo-impact').textContent=(x.impactScore??'--')+'%';if(nexusV176El('exo-action'))nexusV176El('exo-action').textContent=x.recommendedAction||'--';const list=nexusV176El('exo-style-list');if(list)list.innerHTML=(x.retryLogic||[]).map(r=>`<div class="exo-row"><b>Retry rule</b><small>${r}</small></div>`).join('')||'<div class="muted">Nincs retry logika.</div>'}catch(e){console.error('v176 execution refresh error',e)}}
async function recalcExecutionOptimization(){await nexusV176Api('/api/execution-optimization/recalculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'paper-safe'})});refreshExecutionOptimization()}
window.NEXUS_V176={refreshExecutionOptimization,recalcExecutionOptimization};document.addEventListener('DOMContentLoaded',()=>{refreshExecutionOptimization();setInterval(refreshExecutionOptimization,9000)})

/* ===== NEXUS v177.1 LEARNING FEEDBACK UI SAFE MERGE ===== */
async function nexusV177Api(url,opt){const r=await fetch(url,opt);return await r.json();}
function nexusV177El(id){return document.getElementById(id);}
async function refreshLearningFeedback(){
  try{
    const d=await nexusV177Api("/api/learning-feedback/status");
    const l=d.learningFeedback||{};
    if(nexusV177El("lf-score"))nexusV177El("lf-score").textContent=(l.learningScore??"--")+"%";
    if(nexusV177El("lf-speed"))nexusV177El("lf-speed").textContent=(l.adaptationSpeed??"--")+"%";
    if(nexusV177El("lf-confidence"))nexusV177El("lf-confidence").textContent=l.confidenceEvolution||"--";
    if(nexusV177El("lf-top"))nexusV177El("lf-top").textContent=l.topImprovingStrategy||"--";
    if(nexusV177El("lf-worst"))nexusV177El("lf-worst").textContent=l.worstDegradingPattern||"--";
    if(nexusV177El("lf-action"))nexusV177El("lf-action").textContent=l.recommendation||"--";
  }catch(e){console.error("v177 learning feedback refresh error",e);}
}
async function recalcLearningFeedback(){
  await nexusV177Api("/api/learning-feedback/recalculate",{method:"POST"});
  refreshLearningFeedback();
}
window.NEXUS_V177={refreshLearningFeedback,recalcLearningFeedback};
document.addEventListener("DOMContentLoaded",()=>{refreshLearningFeedback();setInterval(refreshLearningFeedback,9000);});
