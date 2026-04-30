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
};

const modeButtons = $$('[data-mode]');
const tuningButtons = $$('[data-tuning]');
const portfolioButtons = $$('[data-profile]');

const state = { snapshot: {}, explain: {}, incidents: [], readiness: {}, portfolio: {}, venues: {}, aiTrader: {}, lastAction: '-' };
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
  await Promise.allSettled([refreshCore(), refreshHistory(), refreshModels(), refreshVenues(), refreshErrors(), refreshProof(), refreshAiTrader()]);
  setInterval(() => refreshCore().catch(console.error), 10000);
  setInterval(() => refreshHistory().catch(console.error), 15000);
  setInterval(() => refreshVenues().catch(console.error), 20000);
  setInterval(() => refreshProof().catch(console.error), 30000);
  setInterval(() => refreshAiTrader().catch(console.error), 7000);
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
        const result = await api(`/api/venues/test/${venue}`, { method: 'POST', body: readBody(venue) });
        setVenueStatus(venue, result.connected ? 'TESZT OK ✅' : 'PIAC OK / AUTH HIÁNYOS ⚠️', result.connected ? 'ok' : 'warn');
        showToast(`${venue.toUpperCase()} teszt: ${result.status || 'OK'}`);
        await Promise.allSettled([refreshCore(), refreshHistory(), refreshVenues(), refreshErrors()]);
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
    if (els.tradeTestOutput) els.tradeTestOutput.textContent = JSON.stringify(result, null, 2);
    showToast('Trade teszt készen áll / DRY_RUN OK');
    await Promise.allSettled([refreshHistory(), refreshProof()]);
  } catch (error) {
    if (els.tradeTestOutput) els.tradeTestOutput.textContent = readableError(error);
    showToast(`Trade teszt hiba: ${readableError(error)}`, true);
  }
});
