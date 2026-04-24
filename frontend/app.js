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
  tradeTestBtn: $('tradeTestBtn'),
  tradeTestOutput: $('tradeTestOutput'),
  refreshErrorsBtn: $('refreshErrorsBtn'),
  copyErrorsBtn: $('copyErrorsBtn'),
  clearErrorsBtn: $('clearErrorsBtn'),
  errorCopyArea: $('errorCopyArea'),
  errorPanel: $('errorPanel'),
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
    const result = await api(url, { method: 'POST', body });
    state.lastAction = label;
    showToast(`${label} kész`);
    await Promise.all([refreshCore(), refreshHistory(), refreshModels()]);
    return result;
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
els.positionSyncBtn?.addEventListener('click', async () => { const result = await action('Pozíció sync', '/api/positions/sync'); if (result?.snapshot?.totals) showToast(`Pozíció sync kész: ${result.snapshot.totals.openPositions} pozíció`); });
els.riskGuardBtn?.addEventListener('click', async () => { const result = await action('Risk guard', '/api/risk/guard'); showToast(result?.ok ? 'Risk guard OK' : 'Risk guard blokkolt'); });
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
  await Promise.allSettled([refreshCore(), refreshHistory(), refreshModels(), refreshVenues(), refreshErrors(), refreshProof()]);
  setInterval(() => refreshCore().catch(console.error), 10000);
  setInterval(() => refreshHistory().catch(console.error), 15000);
  setInterval(() => refreshVenues().catch(console.error), 20000);
  setInterval(() => refreshProof().catch(console.error), 30000);
})();


function wireVenueForms() {
  const getCard = (venue) => document.querySelector(`.venue-card[data-venue-card="${venue}"]`);
  const readBody = (venue) => {
    const card = getCard(venue);
    const field = (name) => card?.querySelector(`[data-venue-field="${name}"]`);
    return {
      venue,
      apiKey: field('apiKey')?.value || '',
      apiSecret: field('apiSecret')?.value || field('secret')?.value || '',
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
        showToast(`${venue.toUpperCase()} mentési hiba: ${readableError(error)}`, true);
      }
    });

    testBtn?.addEventListener('click', async () => {
      try {
        await api(`/api/venues/test/${venue}`, { method: 'POST', body: readBody(venue) });
        showToast(`${venue.toUpperCase()} teszt OK`);
        await Promise.all([refreshCore(), refreshHistory(), refreshVenues()]);
      } catch (error) {
        console.error(error);
        const msg = error.message === 'missing_credentials' ? `${venue.toUpperCase()} hiányos kulcsok` : `${venue.toUpperCase()} teszt hiba`;
        showToast(`${msg}: ${readableError(error)}`, true);
        await refreshVenues();
      }
    });

    clearBtn?.addEventListener('click', async () => {
      try {
        await api('/api/venues/disconnect', { method: 'POST', body: { venue } });
        showToast(`${venue.toUpperCase()} törölve`);
        const card = getCard(venue);
        card?.querySelectorAll('[data-venue-field="apiKey"], [data-venue-field="secret"], [data-venue-field="apiSecret"], [data-venue-field="passphrase"], [data-venue-field="leverage"]').forEach((el) => { el.value = ''; });
        const marketType = card?.querySelector('[data-venue-field="marketType"]');
        if (marketType) marketType.value = 'futures';
        const marginMode = card?.querySelector('[data-venue-field="marginMode"]');
        if (marginMode) marginMode.value = 'cross';
        const testnet = card?.querySelector('[data-venue-field="testnet"]');
        if (testnet) testnet.checked = false;
        await Promise.all([refreshCore(), refreshVenues()]);
      } catch (error) {
        console.error(error);
        showToast(`${venue.toUpperCase()} törlési hiba: ${readableError(error)}`, true);
      }
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
    ['Latency', proof.latencyMs != null ? `${proof.latencyMs} ms` : '-'],
  ];
  return rows.map(([k, v]) => `<div class="proof-row"><span>${htmlEscape(k)}</span><strong>${htmlEscape(v)}</strong></div>`).join('') +
    `<div class="proof-row proof-details"><span>Proof hibák / részletek</span><pre>${htmlEscape([...(proof.errors || []), ...(proof.hints || [])].join('\n') || 'Nincs részlet.')}</pre></div>`;
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
    if (els.tradeTestOutput) els.tradeTestOutput.textContent = JSON.stringify(result, null, 2);
    showToast('Trade teszt készen áll / DRY_RUN OK');
    await Promise.allSettled([refreshHistory(), refreshProof()]);
  } catch (error) {
    if (els.tradeTestOutput) els.tradeTestOutput.textContent = readableError(error);
    showToast(`Trade teszt hiba: ${readableError(error)}`, true);
  }
});
