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
};

const modeButtons = $$('[data-mode]');
const tuningButtons = $$('[data-tuning]');
const portfolioButtons = $$('[data-profile]');

const state = { snapshot: {}, explain: {}, incidents: [], readiness: {}, portfolio: {}, venues: {}, lastAction: '-' };
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


async function api(url, options = {}) {
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    let payload = null;
    try { payload = await res.json(); } catch { payload = await res.text(); }
    const message = typeof payload === 'string' ? payload : payload?.error || JSON.stringify(payload);
    throw new Error(message);
  }
  return res.json();
}

function showToast(message, error = false) {
  els.toast.textContent = message;
  els.toast.className = `toast${error ? ' error' : ''}`;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.add('hidden'), 2400);
}

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

async function refreshCore() {
  const [snapshot, explain, incidents, readiness] = await Promise.all([
    api('/api/operator/snapshot'),
    api('/api/operator/explain'),
    api('/api/operator/incidents'),
    api('/api/operator/readiness'),
  ]);
  state.snapshot = snapshot;
  state.explain = explain;
  state.incidents = Array.isArray(incidents) ? incidents : [];
  state.readiness = readiness.readiness || {};
  state.portfolio = readiness.portfolio || {};
  renderSnapshot();
  renderExplain();
  renderIncidents();
  renderReadiness();
}

async function refreshHistory() {
  const data = await api('/api/operator/history');
  renderHistory(data.events || []);
}

async function refreshModels() {
  const data = await api('/api/operator/models');
  renderModels(data.models || []);
}

async function action(label, url, body) {
  try {
    state.lastAction = `${label}...`;
    renderReadiness();
    await api(url, { method: 'POST', body });
    state.lastAction = label;
    showToast(`${label} kész`);
    await Promise.all([refreshCore(), refreshHistory(), refreshModels()]);
  } catch (e) {
    console.error(e);
    state.lastAction = `${label} hiba`;
    renderReadiness();
    showToast(`${label} hiba`, true);
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
els.logBtn?.addEventListener('click', () => refreshHistory().then(() => showToast('Trade napló frissítve')));
els.refreshExplainBtn?.addEventListener('click', () => refreshCore().then(() => showToast('AI panel frissítve')));
els.refreshLogsBtn?.addEventListener('click', () => refreshCore().then(() => showToast('Incident center frissítve')));
els.refreshHistoryBtn?.addEventListener('click', () => refreshHistory().then(() => showToast('Akció előzmény frissítve')));
els.refreshModelsBtn?.addEventListener('click', () => refreshModels().then(() => showToast('Mentések frissítve')));

modeButtons.forEach((btn) => btn.addEventListener('click', () => action(`Mód: ${btn.dataset.mode}`, '/api/workflow/stage', { profile: btn.dataset.mode })));
tuningButtons.forEach((btn) => btn.addEventListener('click', () => action(`AI tuning: ${btn.dataset.tuning}`, '/api/ai/tuning', { profile: btn.dataset.tuning })));
portfolioButtons.forEach((btn) => btn.addEventListener('click', () => action(`Portfolio: ${btn.dataset.profile}`, '/api/portfolio/upgrade', { profile: btn.dataset.profile })));

(async function init() {
  wireVenueForms();
  await Promise.all([refreshCore(), refreshHistory(), refreshModels(), refreshVenues()]);
  setInterval(refreshCore, 10000);
  setInterval(refreshHistory, 15000);
  setInterval(refreshVenues, 20000);
})();


function wireVenueForms() {
  const getCard = (venue) => document.querySelector(`.venue-card[data-venue="${venue}"]`);
  const readBody = (venue) => {
    const card = getCard(venue);
    const field = (name) => card?.querySelector(`[data-venue-field="${name}"]`);
    return {
      venue,
      apiKey: field('apiKey')?.value || '',
      apiSecret: field('apiSecret')?.value || '',
      passphrase: field('passphrase')?.value || '',
      marketType: field('marketType')?.value || 'futures',
      marginMode: field('marginMode')?.value || 'cross',
      leverage: Number(field('leverage')?.value || 3),
      testnet: !!field('testnet')?.checked,
    };
  };

  VENUES.forEach((venue) => {
    const saveBtn = document.querySelector(`[data-venue-save="${venue}"]`);
    const testBtn = document.querySelector(`[data-venue-test="${venue}"]`);
    const clearBtn = document.querySelector(`[data-venue-clear="${venue}"]`);

    saveBtn?.addEventListener('click', async () => {
      try {
        const result = await api('/api/venues/config', { method: 'POST', body: readBody(venue) });
        showToast(result.hasCredentials ? `${venue.toUpperCase()} mentve` : `${venue.toUpperCase()} hiányos mentés`);
        await Promise.all([refreshCore(), refreshVenues()]);
      } catch (error) {
        console.error(error);
        showToast(`${venue.toUpperCase()} mentési hiba`, true);
      }
    });

    testBtn?.addEventListener('click', async () => {
      try {
        await api('/api/venues/test', { method: 'POST', body: { venue } });
        showToast(`${venue.toUpperCase()} teszt OK`);
        await Promise.all([refreshCore(), refreshHistory(), refreshVenues()]);
      } catch (error) {
        console.error(error);
        const msg = error.message === 'missing_credentials' ? `${venue.toUpperCase()} hiányos kulcsok` : `${venue.toUpperCase()} teszt hiba`;
        showToast(msg, true);
        await refreshVenues();
      }
    });

    clearBtn?.addEventListener('click', async () => {
      try {
        await api('/api/venues/disconnect', { method: 'POST', body: { venue } });
        showToast(`${venue.toUpperCase()} törölve`);
        const card = getCard(venue);
        card?.querySelectorAll('[data-venue-field="apiKey"], [data-venue-field="apiSecret"], [data-venue-field="passphrase"], [data-venue-field="leverage"]').forEach((el) => { el.value = ''; });
        const marketType = card?.querySelector('[data-venue-field="marketType"]');
        if (marketType) marketType.value = 'futures';
        const marginMode = card?.querySelector('[data-venue-field="marginMode"]');
        if (marginMode) marginMode.value = 'cross';
        const testnet = card?.querySelector('[data-venue-field="testnet"]');
        if (testnet) testnet.checked = false;
        await Promise.all([refreshCore(), refreshVenues()]);
      } catch (error) {
        console.error(error);
        showToast(`${venue.toUpperCase()} törlési hiba`, true);
      }
    });
  });
}

async function refreshVenues() {
  try {
    const data = await api('/api/venues/config');
    state.venues = data.config || {};
    const statuses = data.statuses || {};
    VENUES.forEach((venue) => {
      const cfg = state.venues[venue] || {};
      const card = document.querySelector(`.venue-card[data-venue="${venue}"]`);
      const fields = {
        apiKey: cfg.apiKey || '',
        apiSecret: cfg.apiSecret || '',
        passphrase: cfg.passphrase || '',
        marketType: cfg.marketType || 'futures',
        marginMode: cfg.marginMode || 'cross',
        leverage: cfg.leverage ?? 3,
        testnet: !!cfg.testnet,
      };
      Object.entries(fields).forEach(([field, value]) => {
        const el = card?.querySelector(`[data-venue-field="${field}"]`);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!value;
        else el.value = value;
      });
      const badge = document.querySelector(`[data-venue-status="${venue}"]`);
      if (badge) {
        const info = badgeStateForVenue(cfg, statuses[venue] || {});
        badge.textContent = info.label;
        badge.dataset.state = info.state;
        badge.classList.toggle('active', info.state !== 'empty');
      }
    });
  } catch (error) {
    console.error(error);
  }
}
