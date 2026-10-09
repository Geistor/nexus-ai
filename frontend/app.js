const FRONTEND_VERSION = 'v199_187_16';
const FRONTEND_BUILD = 'adaptive-exit-ai-core';
const STABLE_STATE_CACHE_KEY = 'nexus-v199-stable-dashboard-v1';
function loadStableDashboardState() {
  try { return JSON.parse(localStorage.getItem(STABLE_STATE_CACHE_KEY) || 'null') || {}; }
  catch { return {}; }
}
let S = loadStableDashboardState();
let currentFilter = 'all';
let lastSupabasePanelResult = null;
let supabasePanelBusy = false;
let lastTestnetPanelResult = null;
let testnetPanelBusy = false;
let lastLiveReadinessResult = null;
let liveReadinessBusy = false;
let liveDryRunBusy = false;
let lastLiveDryRunResult = null;
let livePrivateAuthBusy = false;
let lastLivePrivateAuthResult = null;
let liveEnvGuideBusy = false;
let lastLiveEnvGuideResult = null;
let liveProofPersistenceBusy = false;
let lastLiveProofPersistenceResult = null;
let liveRehydrateVerificationBusy = false;
let lastLiveRehydrateVerificationResult = null;
let finalPreflightLockBusy = false;
let lastFinalPreflightLockResult = null;
let liveActivationDecisionBusy = false;
let lastLiveActivationDecisionResult = null;
let startupProofHydrateDone = false;
let runtimeSafetyBusy = false;
let lastRuntimeSafetyResult = null;
let crashDiagnosticsBusy = false;
let lastCrashDiagnosticsResult = null;
let versionMismatchToastShown = false;
let orderViewLoadBusy = false;
let observationViewLoadBusy = false;
let stateRefreshBusy = false;
let lastServerTimeMs = 0;
let lastServerTimeClientAt = 0;

function asList(value) {
  return Array.isArray(value) ? value : [];
}
let handsOffSupervisorBusy = false;
let lastHandsOffSupervisorResult = null;
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));


const PHASE_LABELS = {
  MARKET_SCAN: 'Piacfigyelés',
  SIGNAL_GENERATION: 'Jel generálás',
  RISK_GATE: 'Risk kapu',
  EXECUTION_INTENT: 'Order szándék',
  EXECUTION_RECONCILE: 'Order egyeztetés',
  LEARNING_FEEDBACK: 'Tanulási feedback',
  IDLE: 'Készenlét',
  SAFE_READY: 'Safe-ready',
  RECOVERY_LOCKED: 'Visszatöltés / safe-lock',
  RECOVERY_SAFE_READY: 'Visszatöltés kész',
  SETUP_REQUIRED: 'Beállítás szükséges',
  SETUP_REQUIRED_PROOF: 'Proof beállítás szükséges',
  REALTIME_RUNTIME_ACTIVE: 'Runtime aktív'
};

function humanPhase(value, upper = false) {
  const raw = String(value || '-');
  const label = PHASE_LABELS[raw] || raw.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
  return upper ? label.toUpperCase() : label;
}

function rawPhaseTitle(value) {
  const raw = String(value || '-');
  return raw && raw !== '-' ? raw : '';
}

function promotionLiveLooksPrepared() {
  const live = S.promotion?.live || {};
  return !!(live.displayReady || live.lockedButReady || live.preActivationReady || live.safeLockReady || S.liveReadiness?.displayReady || S.liveReadiness?.lockedButReady || S.liveReadiness?.technicallyReady || S.liveActivationDecisionGate?.lockedButReady || S.liveActivationDecisionGate?.readinessOk);
}

function stagingProofLooksReady() {
  const source = String(S.dataSource?.source || '').toUpperCase();
  const mode = String(S.mode || '').toLowerCase();
  const staging = S.promotion?.staging || {};
  const sync = S.startupProofStateSync || {};
  const proof = staging.executionProof || {};
  const orders = Number(staging.orders || S.promotionProof?.stagingOrders || 0);
  const required = Number(staging.requiredOrders || 20);
  return !!(
    source.includes('TESTNET') ||
    source.includes('STAGING') ||
    mode === 'staging' ||
    staging.ok ||
    proof.ok ||
    sync.testnetExecutionOk ||
    (orders >= required && required > 0)
  );
}

function frontendVenueProofLooksAvailable() {
  const connected = Number(S.exchangeCount || 0) > 0 || connectedVenueNamesFromState().length > 0;
  const saved = Number(S.savedExchangeCount || 0) > 0 || savedVenueNamesFromState().length > 0;
  const exchangeProof = Object.values(S.exchanges || {}).some(cfg => cfg && (cfg.connected || cfg.status || cfg.proof || cfg.testnetProof || cfg.balanceReadOk));
  return connected || saved || exchangeProof;
}

function effectiveTradingModeUi() {
  const source = String(S.dataSource?.source || '').toUpperCase();
  const mode = String(S.mode || '').toLowerCase();
  const lockedLiveReady = promotionLiveLooksPrepared();
  const stagingReady = stagingProofLooksReady();
  const venueProof = frontendVenueProofLooksAvailable();
  const liveSubmitAllowed = !!(S.liveReadiness?.active || S.liveActivationDecisionGate?.liveSubmitAllowed);
  if (mode === 'live' && liveSubmitAllowed) return { label: 'Live mód', detail: 'Éles live mód aktív.' };
  if (stagingReady) return { label: 'Safe staging mód', detail: 'Staging/testnet proof kész vagy visszatöltött; a bot nem live módban fut.' };
  if (lockedLiveReady || (venueProof && String(S.accountingMode?.mode || '').includes('paper-staging'))) return { label: 'Paper/staging safe mód', detail: 'Tőzsdei proof/kapcsolat elérhető, de a bot paper-staging könyvelésben fut. Éles order nem indul.' };
  if ((source === 'PAPER' || source === '-' || !source) && venueProof) return { label: 'Paper + proof mód', detail: 'Paper public market snapshot aktív tőzsdei connection proof mellett.' };
  return { label: 'Paper mód', detail: 'Paper public market snapshot alapján fut.' };
}

function displayDataSourceInfo() {
  const ui = effectiveTradingModeUi();
  const raw = String(S.dataSource?.source || '-').toUpperCase();
  const market = S.marketDataHealth || {};
  if (market.degraded || market.recoveryActive) {
    const simulated = String(market.dataQuality || '').includes('simulated');
    const stream = market.stream || {};
    return {
      source: simulated ? 'PAPER/STAGING SAFE — MARKET RECONNECT' : 'PAPER/STAGING SAFE — FRESH MARKET WAIT',
      label: simulated
        ? `Egyetlen saját tőzsdei public piac sem friss. REST/WS continuity újrapróbál (${stream.status || 'ismeretlen'}); új order és tanulási journal friss piaci adat nélkül tiltva.`
        : (market.note || `Az utolsó élő adat csak kijelzésre használható. Public REST/WS continuity: ${stream.status || 'reconnect'}; új order/journal friss adatig szünetel.`)
    };
  }
  if (market.partialCoverage && Number(market.freshMarketCount || 0) > 0) {
    const fresh = Number(market.freshMarketCount || 0);
    const expected = Number(market.expectedMarketCount || fresh);
    return {
      source: 'PAPER/STAGING SAFE — PUBLIC MARKET PARTIAL',
      label: `${fresh}/${expected} saját tőzsdei piac friss és kereskedhető; a hiányzó piacokat a continuity pump külön újrapróbálja. Egy venue kiesése nem állítja le a többit.`
    };
  }
  if (market.referenceFallbackActive) {
    const sourceVenue = String(market.marketSourceVenue || '').toUpperCase();
    const requestedVenue = String(market.requestedVenue || '').toUpperCase();
    return {
      source: 'PAPER/STAGING SAFE — PUBLIC MARKET ROUTER',
      label: market.note || `${requestedVenue || 'Elsődleges tőzsde'} public útvonal helyett friss ${sourceVenue || 'tartalék tőzsdei'} bid/ask referencia aktív. Csökkentett paper/staging méret, nem live order.`
    };
  }
  if ((raw === 'PAPER' || raw === '-' || !raw) && (ui.label.includes('staging') || promotionLiveLooksPrepared() || frontendVenueProofLooksAvailable())) {
    const sourceLabel = ui.label.includes('Safe staging') || ui.label.includes('Paper/staging') ? 'PAPER/STAGING SAFE' : 'PAPER + PROOF';
    return { source: sourceLabel, label: `${S.dataSource?.label || 'Public piaci snapshot'} — ${ui.detail}` };
  }
  return { source: S.dataSource?.source || '-', label: S.dataSource?.label || '-' };
}


function savedVenueNamesFromState() {
  const fromBackend = Array.isArray(S.savedVenueNames) ? S.savedVenueNames : [];
  const fromExchanges = Object.entries(S.exchanges || {})
    .filter(([, cfg]) => cfg && (cfg.privateAuthConfigured || cfg.hasCredentials))
    .map(([venue]) => venue);
  return Array.from(new Set([...fromBackend, ...fromExchanges].map(x => String(x || '').trim()).filter(Boolean)))
    .map(x => x.toUpperCase());
}

function connectedVenueNamesFromState() {
  const fromBackend = Array.isArray(S.connectedVenueNames) ? S.connectedVenueNames : [];
  const fromExchanges = Object.entries(S.exchanges || {})
    .filter(([, cfg]) => cfg && cfg.connected)
    .map(([venue]) => venue);
  return Array.from(new Set([...fromBackend, ...fromExchanges].map(x => String(x || '').trim()).filter(Boolean)))
    .map(x => x.toUpperCase());
}

function connectionFooterLabel() {
  const names = connectedVenueNamesFromState();
  if (names.length === 1) return `${names[0]} API OK`;
  if (names.length > 1) return `${names.length} privát API OK`;
  const configured = savedVenueNamesFromState();
  if (configured.length) return `0/${configured.length} privát API`;
  return 'nincs privát API';
}

function connectionFooterTitle() {
  const connectedNames = connectedVenueNamesFromState();
  const savedNames = savedVenueNamesFromState();
  if (connectedNames.length) return `Valódi signed privát API kapcsolat: ${connectedNames.join(', ')}. A public market adat ettől külön állapot.`;
  if (savedNames.length) return `Mentett API profil: ${savedNames.join(', ')}. Signed privát kapcsolat még nincs bizonyítva.`;
  return 'Nincs bizonyított privát API kapcsolat. Public market adat önmagában nem számít tőzsdei API kapcsolatnak.';
}

function metricTrustInfo() {
  const integrity = S.marketIntegrity || {};
  const verified = integrity.verifiedStats || {};
  const legacy = integrity.legacySnapshot || {};
  if (integrity.enabled) {
    const verifiedCount = Number(verified.closedTrades || 0);
    const legacyCount = Number(legacy.closedTrades || S.metrics?.closedTrades || 0);
    return {
      label: verifiedCount > 0 ? 'VERIFIED MARKET JOURNAL' : 'VERIFIED MINTA GYŰLIK',
      detail: (() => { const h = integrity.historicalLearning || {}; const spi = integrity.symbolPriceIntegrity || {}; const q = Number(spi.quarantinedTrades || integrity.quarantinedTrades || 0); return `Valós PnL és tőke: ${verifiedCount} verified trade, WR ${verified.winRate ?? 'N/A'}%, PnL ${usd(verified.netPnl || 0)}. Tanulás: ${Number(h.acceptedDetailedTrades || 0)} minősített régi trade + verified minta, összesen ${Number(h.combinedEffectiveSamples || verifiedCount).toFixed(1)} effektív mintával; kizárva ${Number(h.rejectedDetailedTrades || 0)} hibás/proof rekord. Szimbólum/ár integritás: ${q ? `${q} rekord karanténban és minden számításból kizárva` : 'OK'}.`; })()
    };
  }
  const trades = Number(S.metrics?.closedTrades || 0);
  const hydration = S.aggregateHydrationStatus || {};
  if ((S.dataSource?.hydrationPending || hydration.pending) && trades <= 0) {
    return { label: 'VISSZATÖLTÉS', detail: hydration.detail || 'Startup/recovery még tölti a korábbi aggregált trade számlálót; a 0 trade nem végleges érték.' };
  }
  if (S.dataSource?.trustedMetrics || trades > 0) {
    const counter = counterProofInfo();
    const protectedText = hydration.monotonicProtection?.active ? ' Számlálóvédelem aktív: részleges olvasás nem írhatja felül lefelé.' : '';
    if (S.metrics?.winRateCorrected || /recent-detailed-cache/i.test(String(S.metrics?.winRateSource || ''))) {
      return { label: 'FRISS MINTA ALAPÚ', detail: 'A teljes trade darabszám védett, de a winrate a friss részletes mintából jelenik meg, mert az aggregált winrate mező régi/stale volt. ' + counter.label + ': ' + counter.detail + protectedText };
    }
    if (S.metrics?.winRateEstimated) {
      return { label: 'WR FALLBACK AKTÍV', detail: 'A winrate részletes cache/fallback alapján jelenik meg; a lezárt trade számláló továbbra is a teljes ismert aggregált érték. ' + counter.label + ': ' + counter.detail + protectedText };
    }
    return { label: 'JOURNAL ALAPÚ', detail: 'Net profit és winrate a teljes aggregált journal/floor statisztikából. Ez hosszú historikus átlag, nem a legutóbbi 1000 trade rövid mintája. ' + counter.label + ': ' + counter.detail + protectedText };
  }
  return { label: 'TRADE-RE VÁR', detail: 'Még nincs lezárt trade journal. Ez nem hiba, a bot adatot gyűjt.' };
}

function actionButtonClass({ done = false, next = false, warn = false, danger = false, busy = false } = {}) {
  // v199_120: if a later snapshot already proves the step OK, never keep the button in a stuck busy state.
  if (done) return 'actionStatus actionDone';
  if (busy) return 'actionStatus actionBusy';
  if (danger) return 'actionStatus actionDanger';
  if (next) return 'actionStatus actionNext';
  if (warn) return 'actionStatus actionWarn';
  return 'actionStatus actionNeutral';
}

function actionPrefix(done = false, busy = false) {
  return done ? '✓ ' : (busy ? '… ' : '');
}

async function api(path, data) {
  const options = data === undefined ? { cache: 'no-store' } : { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  const response = await fetch(path, options);
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) throw new Error(json.message || json.error || 'API hiba');
  return json;
}

async function fetchJsonWithTimeout(endpoint, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || result.error || response.statusText || 'HTTP hiba');
    return result;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('időtúllépés');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function apiSoft(path, data) {
  const options = data === undefined ? { cache: 'no-store' } : { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  const response = await fetch(path, options);
  const json = await response.json().catch(() => ({}));
  if (!response.ok && !(json.blocked || json.expectedBlock)) throw new Error(json.message || json.error || 'API hiba');
  return json;
}

function toast(text) {
  const box = $('#toast');
  if (!box) return;
  box.textContent = text;
  box.classList.remove('hidden');
  setTimeout(() => box.classList.add('hidden'), 4200);
}

function switchView(id) {
  $$('.view').forEach(x => x.classList.remove('active'));
  const target = $('#' + id);
  if (target) target.classList.add('active');
  $$('.nav,.consoleBtn').forEach(x => x.classList.toggle('active', x.dataset.view === id));
  if (id === 'orders') void loadOrderJournalView();
  if (id === 'observation') void loadLearningObservationView();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function eventTypeLabel(value) {
  const raw = String(value || '').trim();
  const map = {
    ai: 'AI',
    risk: 'Risk',
    market: 'Piac',
    execution: 'Order',
    learning: 'Tanulás',
    exchange: 'Tőzsde',
    recovery: 'Recovery',
    maintenance: 'Karbantartás',
    database: 'Adatbázis',
    operator: 'Operátor',
    queue: 'Sor',
    info: 'Info',
    warn: 'Figyelmeztetés',
    error: 'Hiba'
  };
  return map[raw.toLowerCase()] || raw.replace(/_/g, ' ');
}

function safeEventText(value) {
  let text = String(value || '');
  text = text.replace(/\blive_public\b/gi, 'nyilvános piaci adat — nem live order');
  text = text.replace(/\bTESTNET_PROOF_BLOCKED\b/g, 'staging proof védelmi blokk');
  text = text.replace(/This operation was aborted/gi, 'public API kérés megszakadt, tartalék adat ment tovább');
  text = text.replace(/szimulált tartalék adat\s*:\s*public API kérés megszakadt, tartalék adat ment tovább/gi, 'szimulált tartalék adat — public API kérés megszakadt');
  text = text.replace(/\bsimulated_fallback(?::[^\s,)]+)?\b/gi, 'szimulált tartalék adat');
  text = text.replace(/\bmarket-snapshot-ready\b/gi, 'piaci snapshot kész');
  text = text.replace(/\bmarket-live_public\b/gi, 'piaci adat: nyilvános — nem live order');
  text = text.replace(/\bSTAGING_ORDER_COUNT_PROOF_OK\b/g, 'staging proof darabszám OK');
  text = text.replace(/\bSTAGING_ORDER_PROOF_OK\b/g, 'staging order proof OK');
  text = text.replace(/\bTESTNET_EXECUTION_PROOF_OK(?:_REHYDRATED)?\b/g, 'staging order proof OK');
  text = text.replace(/\bTESTNET_EXECUTION_PROOF_BLOCKED\b/g, 'staging order proof blokkolva');
  text = text.replace(/\bTESTNET_EXECUTION_PROOF_SAVED\b/g, 'staging proof mentve');
  text = text.replace(/\bNO_EXECUTION_PROOF\b/g, 'még nincs order proof');
  text = text.replace(/\bmarket-scan\b/gi, 'piacfigyelés');
  text = text.replace(/\brisk-gate\b/gi, 'risk kapu');
  text = text.replace(/\bstrategy-vote\b/gi, 'stratégia szavazás');
  text = text.replace(/\bportfolio-sync\b/gi, 'portfólió szinkron');
  text = text.replace(/\bexecution-reconcile\b/gi, 'order egyeztetés');
  text = text.replace(/\blearning-feedback\b/gi, 'tanulási feedback');
  text = text.replace(/\brecent_proof_ok\b/gi, 'friss proof OK');
  text = text.replace(/\brecent_critical_write_ok\b/gi, 'friss kritikus mentés OK');
  text = text.replace(/\brepair-applied\b/gi, 'javítás lefutott');
  text = text.replace(/\blive-env\b/gi, 'Railway ENV');
  text = text.replace(/\bencrypted-store-live-allowed\b/gi, 'titkosított mentett kulcs engedélyezve');
  text = text.replace(/\bstored-but-not-live-enabled\b/gi, 'mentett kulcs van, live read nincs engedélyezve');
  text = text.replace(/\bmissing\b/gi, 'hiányzik');
  text = text.replace(/Execution intent created:/g, 'Order terv készült:');
  text = text.replace(/Market snapshot:/g, 'Piaci snapshot:');
  text = text.replace(/Risk gate approved\./g, 'Risk kapu jóváhagyva.');
  text = text.replace(/Task queued:/g, 'Feladat sorba téve:');
  text = text.replace(/AI routine snapshot mentve\./g, 'AI runtime snapshot mentve.');
  text = text.replace(/Order lifecycle reconciled:/g, 'Order életciklus egyeztetve:');
  text = text.replace(/Learning memory stream frissítve backend truth \+ strategy evaluation adatokból\./gi, 'Tanulási memória frissítve backend és stratégiaértékelési adatokból.');
  text = text.replace(/Learning memory stream/gi, 'Tanulási memória');
  text = text.replace(/backend truth/gi, 'backend állapot');
  text = text.replace(/strategy evaluation/gi, 'stratégiaértékelés');
  text = text.replace(/confidence/gi, 'bizalom');
  text = text.replace(/adaptive confidence floor/gi, 'adaptív bizalomküszöb');
  text = text.replace(/learning guard/gi, 'tanulási guard');
  text = text.replace(/quality-filtering/gi, 'winrate szűrő aktív');
  text = text.replace(/balanced-learning/gi, 'kiegyensúlyozott tanulás');
  text = text.replace(/target-watch/gi, 'cél feletti őrzés');
  text = text.replace(/learning-warmup/gi, 'minta gyűjtés');
  text = text.replace(/\bBUY\b/g, 'VÉTEL');
  text = text.replace(/\bSELL\b/g, 'ELADÁS');
  text = text.replace(/\bdone\b/gi, 'kész');
  text = text.replace(/\bapproved\b/gi, 'jóváhagyva');
  text = text.replace(/\bcreated\b/gi, 'létrehozva');
  text = text.replace(/\bstored\b/gi, 'mentve');
  text = text.replace(/\bwaiting\b/gi, 'vár');
  text = text.replace(/\brunning\b/gi, 'fut');
  text = text.replace(/\bready-but-locked\b/gi, 'előkészítve, de zárolva');
  text = text.replace(/\bSUPABASE_CRITICAL_SCHEMA_MISSING\b/gi, 'Supabase séma ellenőrzendő');
  text = text.replace(/\bSUPABASE_SCHEMA_MISSING\b/gi, 'Supabase séma ellenőrzendő');
  text = text.replace(/\bSUPABASE_READ_WRITE_PROOF_OK\b/gi, 'Supabase írás/olvasás proof OK');
  text = text.replace(/\bmaintenance_busy_ok\b/gi, 'karbantartás befejeződött / fallback OK');
  text = text.replace(/\bmaintenance_busy\b/gi, 'karbantartás már folyamatban');
  text = text.replace(/\bdecision-gate-only-never-enables-live-submit\b/gi, 'döntési kapu: nem enged éles orderküldést');
  text = text.replace(/Final preflight/gi, 'Végső safe-lock');
  text = text.replace(/safety guards/gi, 'biztonsági védelmek');
  text = text.replace(/guard/gi, 'védelem');
  text = text.replace(/submit/gi, 'orderküldés');
  // v199_111: ne lokalizáljuk félbe az ENV kulcs nevét: NEXUS_LIVE_REAL_SUBMIT maradjon vagy váljon tiszta magyar státusszá a compactLiveUiText-ben.
  text = text.replace(/\bNEXUS_LIVE_REAL_orderküldés\b/gi, 'NEXUS_LIVE_REAL_SUBMIT');
  text = text.replace(/account\/balance/gi, 'számla/egyenleg');
  text = text.replace(/account read/gi, 'számlaolvasás');
  text = text.replace(/runtime_snapshot/gi, 'runtime snapshot');
  text = text.replace(/event_journal/gi, 'eseménynapló');
  text = text.replace(/state mentés/gi, 'állapotmentés');
  text = text.replace(/\bProof-state\b/gi, 'Proof állapot');
  text = text.replace(/\bPersistence\b/gi, 'Mentés');
  return text;
}

function humanTechLabel(value) {
  const raw = String(value ?? '').trim();
  const map = {
    'LIVE_PRIVATE_READ_ENV_READY': 'Read-only ENV OK',
    'SUPABASE_CRITICAL_SCHEMA_MISSING': 'Séma ellenőrzendő',
    'SUPABASE_SCHEMA_MISSING': 'Séma ellenőrzendő',
    'SUPABASE_READ_WRITE_PROOF_OK': 'Írás/olvasás proof OK',
    'SUPABASE_READ_WRITE_PROOF_FAIL': 'Írás/olvasás proof hiba',
    'maintenance_busy': 'karbantartás már folyamatban',
    'maintenance_busy_ok': 'karbantartás befejeződött / fallback OK',
    'LIVE_PRIVATE_READ_ENV_GUIDE_NEEDED': 'Read-only ENV útmutató kell',
    'LIVE_PRIVATE_AUTH_READINESS_OK': 'Live olvasási proof OK',
    'LIVE_PRIVATE_AUTH_READINESS_BLOCKED': 'Live olvasási proof még nem kész',
    'LIVE_PRIVATE_READ_SAFELY_SKIPPED': 'Read-only proof biztonságosan kihagyva',
    'STAGING_ORDER_COUNT_PROOF_OK': 'Staging proof darabszám OK',
    'STAGING_ORDER_PROOF_OK': 'Staging order proof OK',
    'TESTNET_EXECUTION_PROOF_OK': 'Staging order proof OK',
    'TESTNET_EXECUTION_PROOF_OK_REHYDRATED': 'Staging proof visszatöltve',
    'TESTNET_EXECUTION_PROOF_BLOCKED': 'Staging proof blokkolva',
    'TESTNET_PROOF_BLOCKED': 'Staging proof védelmi blokk',
    'NO_EXECUTION_PROOF': 'Még nincs order proof',
    'recent_proof_ok': 'Friss proof OK',
    'recent_critical_write_ok': 'Friss kritikus mentés OK',
    'repair-applied': 'Javítás lefutott',
    'ready': 'Kész',
    'not-run': 'Még nem futott',
    'hands-off-ok': 'Hands-off OK',
    'watching-with-warnings': 'Figyel, kisebb figyelmeztetéssel',
    'intervention-required': 'Beavatkozás szükséges',
    'live-env': 'Railway ENV',
    'missing': 'hiányzik',
    'done': 'kész',
    'approved': 'jóváhagyva',
    'created': 'orderterv kész',
    'stored': 'mentve',
    'waiting': 'vár',
    'running': 'fut',
    'ready-but-locked': 'előkészítve, de zárolva',
    'manual-review-required': 'kézi ellenőrzés kell',
    'blocked-real-submit': 'éles orderküldés blokkolva',
    'decision-gate-only-never-enables-live-submit': 'döntési kapu: nem kapcsol éles orderküldést'
  };
  if (!raw) return '-';
  if (map[raw]) return map[raw];
  let text = safeEventText(raw);
  text = text.replace(/_/g, ' ');
  return compactLiveUiText(text);
}


function compactLiveUiText(value) {
  let text = safeEventText(String(value ?? ''));
  text = text.replace(/\bNEXUS_LIVE_REAL_orderküldés\b/gi, 'NEXUS_LIVE_REAL_SUBMIT');
  const replacements = [
    [/NEXUS_ALLOW_LIVE\s*[:=]\s*false/gi, 'live engedély: kikapcsolva'],
    [/NEXUS_ALLOW_LIVE\s*[:=]\s*true/gi, 'live engedély: bekapcsolva — kézi review kell'],
    [/NEXUS_LIVE_REAL_SUBMIT\s*[:=]\s*false/gi, 'éles orderküldés: tiltva'],
    [/NEXUS_LIVE_REAL_SUBMIT\s*[:=]\s*true/gi, 'éles orderküldés: engedélyezve — veszélyes'],
    [/NEXUS_LIVE_PRIVATE_READ\s*[:=]\s*true/gi, 'olvasási proof: engedélyezve'],
    [/NEXUS_LIVE_PRIVATE_READ\s*[:=]\s*false/gi, 'olvasási proof: nincs engedélyezve'],
    [/\bNEXUS_ALLOW_LIVE\b/g, 'live engedély'],
    [/\bNEXUS_LIVE_REAL_SUBMIT\b/g, 'éles orderküldés'],
    [/\bNEXUS_LIVE_PRIVATE_READ\b/g, 'olvasási proof kapcsoló'],
    [/\bDRY_RUN\b/g, 'dry-run'],
    [/\bBINANCE_API_KEY\s*\+\s*BINANCE_API_SECRET\b/g, 'BINANCE kulcspár'],
    [/\bOKX_API_KEY\s*\+\s*OKX_API_SECRET\s*\+\s*OKX_API_PASSPHRASE\b/g, 'OKX kulcspár'],
    [/\bBYBIT_API_KEY\s*\+\s*BYBIT_API_SECRET\b/g, 'BYBIT kulcspár'],
    [/GET\s+\/api\/v3\/account/gi, 'account olvasási endpoint'],
    [/Live előkészítés — safe-lock lista/gi, 'Live előkészítési safe-lock lista'],
    [/Testnet execution proof/gi, 'Staging order proof'],
    [/Live readiness/gi, 'Live előkészítés'],
    [/readiness/gi, 'előkészítés'],
    [/Live dry-run guard proof/gi, 'Live dry-run védelmi próba'],
    [/Live dry-run proof/gi, 'Live dry-run próba'],
    [/Live dry-run próba/gi, 'Live dry-run próba'],
    [/Végső safe-lock hiányos:\s*Live olvasási számla\/egyenleg proof OK\.?/gi, 'Végső safe-lock: live olvasási proof OK, de egy friss teljes ellenőrzés még vár'],
    [/Végső preflight lock hiányos:\s*Live olvasási számla\/egyenleg proof OK\.?/gi, 'Végső safe-lock: live olvasási proof OK, de egy friss teljes ellenőrzés még vár'],
    [/Live olvasási proof/gi, 'Live olvasási proof'],
    [/read-only proof/gi, 'olvasási proof'],
    [/Read-only ENV/gi, 'Olvasási ENV'],
    [/olvasási ellenőrzés/gi, 'olvasási ellenőrzés'],
    [/read-only/gi, 'olvasási'],
    [/Live private read\/account proof/gi, 'Live privát olvasási proof'],
    [/private read\/account proof/gi, 'privát olvasási proof'],
    [/Restart\/rehydrate live proof/gi, 'Restart utáni live proof visszaállítás'],
    [/Restart\/rehydrate/gi, 'Restart utáni visszaállítás'],
    [/Live aktiválási döntési kapu/gi, 'Live aktiválási döntési kapu'],
    [/Live aktiválási döntés/gi, 'Live aktiválási döntés'],
    [/activation decision/gi, 'aktiválási döntés'],
    [/Orderküldés guard/gi, 'Orderküldés guard'],
    [/Auto-visszazárás/gi, 'Auto-visszazárás'],
    [/live order intent/gi, 'live orderterv'],
    [/blocked submit/gi, 'blokkolt orderküldés'],
    [/real submit/gi, 'éles orderküldés'],
    [/live submit/gi, 'éles orderküldés'],
    [/journal proof/gi, 'journal bizonyítás'],
    [/account\/balance read proof/gi, 'account/balance olvasási proof'],
    [/Trading permission/gi, 'Trading jogosultság'],
    [/proof gate/gi, 'proof kapu'],
    [/submit\/dry-run/gi, 'submit/dry-run próba'],
    [/sync\/reconcile/gi, 'szinkron/order egyeztetés'],
    [/intent/gi, 'orderterv'],
    [/venue:/gi, 'tőzsde:'],
    [/source:/gi, 'forrás:'],
    [/Quality score/gi, 'Minőség pontszám'],
    [/Risk multiplier/gi, 'Risk szorzó'],
    [/Strategy control/gi, 'Stratégia kontroll'],
    [/Stratégiaértékelés/gi, 'Stratégiaértékelés'],
    [/Health score/gi, 'Egészség pontszám'],
    [/Supervisor/gi, 'Felügyelet'],
    [/Runtime null-safety/gi, 'Runtime védelem'],
    [/safe fallback/gi, 'biztonsági tartalék mód'],
    [/status/gi, 'státusz'],
    [/Endpoint/gi, 'Olvasási végpont']
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  return text;
}

function cleanStatusLabel(value) {
  return compactLiveUiText(humanTechLabel(value));
}

function exchangeTechLabel(value) {
  const raw = String(value ?? '').trim();
  const map = {
    connected: 'Piaci kapcsolat aktív',
    market_connected_safe: 'Piaci kapcsolat aktív — safe',
    testnet_proof_ready: 'Staging/testnet proof kész',
    proof_failed: 'Proof sikertelen',
    saved: 'Mentett kulcs/profil',
    MARKET_ONLY: 'Piaci adat proof — auth nélkül',
    AUTH_STORED_PROOF_INCOMPLETE: 'Auth mentve, staging proof még hiányzik',
    AUTH_STORED_MARKET_OK_TESTNET_PENDING: 'Auth mentve, piaci proof OK, staging/testnet még nincs kész',
    HARDENED_PROOF_OK: 'Hardened staging proof OK',
    TESTNET_NOT_ENABLED: 'Testnet nincs bekapcsolva — safe dry-run/paper mód',
    TESTNET_NOT_READY: 'Testnet még nem kész — nem blokkolja a paper/staging futást',
    TESTNET_PROOF_BLOCKED: 'Staging proof védelmi blokk',
    STAGING_DRY_RUN_READY: 'Safe staging dry-run proof kész',
    STAGING_DRY_RUN_INCOMPLETE: 'Safe staging dry-run proof még hiányos',
    STAGING_DRY_RUN_CREATED: 'Safe staging orderterv létrehozva',
    STAGING_DRY_RUN_ACCEPTED: 'Safe staging dry-run elfogadva',
    STAGING_DRY_RUN_RECONCILED: 'Safe staging dry-run egyeztetve',
    STAGING_DRY_RUN_BALANCE_PREVIEW: 'Safe staging egyenleg-előnézet',
    STAGING_EXECUTION_PROOF_OK: 'Safe staging order-életút proof OK',
    STAGING_EXECUTION_PROOF_BLOCKED: 'Safe staging order-életút proof blokkolt',
    STAGING_EXECUTION_PROOF_SYNC_WARN: 'Safe staging order-életút szinkron figyelmeztetés',
    STAGING_ORDER_COUNT_PROOF_OK: 'Staging order darabszám proof OK',
    SAVED_MASKED: 'Maszkolt kulcs mentve',
    BINANCE_PRIVATE_READ_OK: 'Binance signed account read OK',
    BINANCE_TESTNET_PRIVATE_AUTH_OK: 'Binance Testnet signed account read OK',
    BINANCE_LIVE_KEY_TESTNET_MISMATCH: 'LIVE Binance kulcs + Testnet pipa ütközés',
    BINANCE_TESTNET_KEY_LIVE_MISMATCH: 'Testnet Binance kulcs + LIVE mód ütközés',
    PRIVATE_AUTH_FAILED: 'Privát API hitelesítés sikertelen',
    PRIVATE_CREDENTIALS_MISSING_OR_NOT_RECOVERABLE: 'API kulcs/secret hiányzik vagy nem visszaállítható',
    PRIVATE_ADAPTER_NOT_PRODUCTION_READY: 'Privát adapter még nincs production-proof állapotban',
    PRIVATE_AUTH_NOT_TESTED: 'Privát auth még nincs tesztelve',
    PUBLIC_MARKET_OK: 'Public market OK',
    PUBLIC_MARKET_WAITING: 'Public market reconnect/vár'
  };
  return map[raw] || cleanStatusLabel(raw);
}

function exchangeHasAcceptedStagingProof(e = {}) {
  return !!(e.hardenedReady || e.testnetReady || /HARDENED|STAGING_DRY_RUN_READY|STAGING_EXECUTION_PROOF_OK/i.test(String(e.testnetProof || '')));
}

function exchangeStateClass(e = {}) {
  if (e.privateAuthVerified === true && e.connected === true) return 'ok';
  if (/PRIVATE_AUTH_FAILED|MISMATCH/i.test(String(e.privateAuthStatus || '')) || e.status === 'private_auth_failed') return 'bad';
  if (e.publicMarketOk || e.status === 'public_market_only' || e.privateAuthConfigured || e.hasCredentials) return 'warn';
  return 'bad';
}

function exchangeStateTitle(e = {}) {
  const venue = String(e.venue || e.exchange || '').toUpperCase();
  if (e.privateAuthVerified === true && e.connected === true) {
    return e.publicMarketOk ? `${venue} privát API kapcsolat OK` : `${venue} privát API OK — public market reconnect`;
  }
  if (e.privateAuthSupported === false || e.status === 'public_market_only') return `${venue}: nincs privát API kapcsolat — public market only`;
  if (/MISMATCH/i.test(String(e.privateAuthStatus || ''))) return `${venue} API mód/kulcs eltérés`;
  if (e.privateAuthStatus === 'PRIVATE_AUTH_FAILED' || e.status === 'private_auth_failed') return `${venue} API hitelesítés sikertelen`;
  if (e.privateAuthConfigured || e.hasCredentials) return `${venue} kulcs mentve — signed kapcsolat teszt szükséges`;
  return `${venue}: nincs API kapcsolat`;
}

function exchangeStateDetail(e = {}) {
  const parts = [];
  const key = e.apiKeyMasked && e.apiKeyMasked !== '-' ? 'API kulcs mentve/maszkolva' : 'API kulcs nincs';
  parts.push(key);
  if (e.privateAuthSupported === false) {
    parts.push('privát adapter: signed read-only teszt szükséges a valódi kapcsolat bizonyításához');
  } else if (e.privateAuthVerified === true) {
    parts.push(`privát auth: VALÓDI signed read OK (${exchangeTechLabel(e.privateAuthStatus || 'OK')})`);
  } else {
    parts.push(`privát auth: ${exchangeTechLabel(e.privateAuthStatus || 'nincs bizonyítva')}`);
    if (e.privateAuthError) parts.push(`hiba: ${String(e.privateAuthError).slice(0, 220)}`);
  }
  parts.push(`public market: ${e.publicMarketOk ? 'OK' : 'vár/reconnect'}`);
  parts.push('public market adat önmagában NEM tőzsdei API kapcsolat');
  return parts.join(' / ');
}

function exchangePanelSummary(values = []) {
  if (!values.length) return 'Még nincs mentett tőzsdei API profil.';
  return values.map(e => `${e.venue || 'VENUE'}: ${exchangeStateTitle(e)}\n${exchangeStateDetail(e)}`).join('\n\n');
}

function testnetSafeModeInfo(latestProof = {}, summary = {}) {
  const rawStatus = String(latestProof.status || summary.status || 'NO_PROOF');
  const rawBalance = String(latestProof.balance_read_status || '');
  const safeDryRun = !S.testnet?.realSubmitEnabled;
  const nonBlockingBase = safeDryRun && /TESTNET_NOT_ENABLED|TESTNET_NOT_READY|DRY_RUN|TESTNET_PROOF_BLOCKED|NO_PROOF/i.test(rawStatus + ' ' + rawBalance);
  const orderProofOk = !!summary.ok;
  const className = latestProof.hardened_ready || orderProofOk ? 'ok' : (nonBlockingBase ? 'warn' : 'warn');
  const title = latestProof.hardened_ready
    ? 'Alap staging proof kész'
    : (orderProofOk && nonBlockingBase ? 'Safe staging állapot — order proof OK' : 'Alap staging proof ellenőrzés');
  const detail = orderProofOk && nonBlockingBase
    ? `${exchangeTechLabel(rawStatus)}. Ez safe-lock alatt nem hiba: a bot paper/staging módban fut, éles orderküldés nincs.`
    : `${exchangeTechLabel(rawStatus)} • balance: ${exchangeTechLabel(rawBalance || '-')} • mód: ${safeDryRun ? 'DRY-RUN / SAFE' : 'REAL TESTNET'}`;
  return { rawStatus, rawBalance, safeDryRun, nonBlockingBase, orderProofOk, className, title, detail };
}

function counterProofInfo() {
  const integrity = S.marketIntegrity || {};
  if (integrity.enabled) {
    const verified = integrity.verifiedStats || {};
    const legacy = integrity.legacySnapshot || {};
    const verifiedCount = Number(verified.closedTrades || 0);
    const legacyCount = Number(legacy.closedTrades || 0);
    return {
      label: verifiedCount > 0 ? 'VERIFIED SZÁMLÁLÓ' : 'VERIFIED WARMUP',
      detail: `${verifiedCount} verified trade adja a valós PnL/tőke alapját. ${Number(integrity.historicalLearning?.acceptedDetailedTrades || 0)} minősített régi trade csökkentett súllyal segíti a tanulást; teljes legacy referencia ${legacyCount}.`
    };
  }
  const hydration = S.aggregateHydrationStatus || {};
  const metrics = S.metrics || {};
  const protection = hydration.monotonicProtection || S.aggregateStats?.monotonicProtection || {};
  const closed = Number(metrics.closedTrades || hydration.aggregateClosedTrades || 0);
  const known = Math.max(Number(hydration.knownFloorClosedTrades || 0), closed);
  const cache = Number(hydration.displayCacheClosedTrades || 0);
  const protectedValue = Number(protection.protectedClosedTrades || known || closed || 0);
  if (hydration.pending) return { label: 'VISSZATÖLTÉS', detail: 'Korábbi lezárt trade számláló betöltés alatt; a 0 vagy alacsony szám nem végleges.' };
  if (protection.active) return { label: 'SZÁMLÁLÓ VÉDVE', detail: `Részleges olvasás ${Number(protection.incomingClosedTrades || cache || 0)} trade-et adott, megtartva: ${protectedValue}.` };
  if (known > 0 && cache > 0 && known > cache) return { label: 'AGGREGÁLT FLOOR', detail: `Teljes ismert számláló: ${known}. Részletes cache: ${cache}. Ez nem trade-vesztés.` };
  if (known > 0) return { label: 'STABIL SZÁMLÁLÓ', detail: `Lezárt trade számláló journal/aggregate alapján: ${known}.` };
  return { label: 'MINTA GYŰLIK', detail: 'Még nincs lezárt trade számláló proof.' };
}

function exchangeStateDetail(e = {}) {
  const parts = [];
  const key = e.apiKeyMasked && e.apiKeyMasked !== '-' ? 'kulcs maszkolva' : 'kulcs nem látszik / Railway ENV vagy recovery alapján';
  const secret = e.apiSecretMasked && e.apiSecretMasked !== '-' ? 'secret maszkolva' : 'secret nem jelenik meg a UI-ban';
  const accepted = exchangeHasAcceptedStagingProof(e);
  parts.push(key + ' • ' + secret);
  if (accepted) {
    // v199_112: elfogadott staging/order proof mellett ne ismételjük a régi nyers
    // TESTNET_NOT_ENABLED / AUTH_STORED... sorokat, mert azok safe-lock alatt nem hibák
    // és ellentmondanak az összegző zöld OK állapotnak.
    parts.push('proof: piaci kapcsolat OK + mentett staging/order proof elfogadva');
    parts.push('staging: safe dry-run/paper-staging módban használható; új API proof nem kötelező');
    parts.push('jelentés: nem live, éles order nem indul, safe-lock továbbra is aktív');
  } else {
    parts.push('proof: ' + exchangeTechLabel(e.proof || '-'));
    parts.push('staging: ' + exchangeTechLabel(e.testnetProof || '-'));
    if (e.connected) parts.push('jelentés: paper/staging futtatható, de a teljes staging proof még nem bizonyított ezen a panelen');
  }
  return parts.join(' / ');
}

function exchangePanelSummary(values = []) {
  if (!values.length) return 'Még nincs mentett tőzsde vagy kapcsolat teszt.';
  return values.map(e => `${e.venue || 'VENUE'}: ${exchangeStateTitle(e)}\n${exchangeStateDetail(e)}`).join('\n\n');
}

function statusWord(value) {
  const raw = String(value ?? '').trim();
  const map = {
    waiting: 'vár',
    done: 'kész',
    approved: 'jóváhagyva',
    created: 'orderterv kész',
    stored: 'mentve',
    running: 'fut',
    ready: 'kész',
    ok: 'OK',
    online: 'online',
    guarding: 'védelem aktív',
    balanced: 'egyensúlyban',
    watching: 'figyel',
    recovering: 'visszaállítás',
    'boot-lock': 'indítási zár',
    'live-public-ready': 'nyilvános adat OK',
    'market-snapshot-ready': 'piaci snapshot OK',
    'vault-ready': 'profit vault kész',
    'scaling-ready': 'skálázás kész',
    'retention-active': 'adatkarbantartás aktív',
    'retention-ok': 'adatkarbantartás OK',
    'aggregate-ready': 'összesített statisztika kész',
    'aggregate-complete': 'összesítés kész',
    'runtime-null-safe-ready': 'runtime védelem kész',
    'testnet-execution-proof-ok': 'staging proof OK',
    'compounding-active': 'visszaforgatás aktív',
    'scaling-active': 'risk skálázás aktív',
    evaluated: 'kiértékelve',
    'protective-block': 'védelem aktív',
    'risk-reduced': 'óvatos méretezés',
    'quality-filtering': 'winrate szűrő aktív',
    'learning-degradation-protection': 'romlási védelem aktív',
    'learning-degradation-watch': 'romlási figyelés aktív',
    'balanced-learning': 'kiegyensúlyozott tanulás',
    'target-watch': 'cél felett, őrzés',
    'learning-warmup': 'minta gyűjtés',
    'warming-up': 'minta gyűlik',
    'collecting-baseline': 'bázis gyűlik',
    'waiting-for-aggregate': 'aggregált adat vár',
    'waiting-for-trades': 'trade-re vár',
    observing: 'megfigyelés aktív',
    'same-sample': 'azonos minta',
    'setup required': 'beállítás szükséges',
    'setup_required': 'beállítás szükséges',
    simulated: 'szimulált',
    'hands-off': 'önműködő',
    observe: 'figyelés'
  };
  if (!raw) return '-';
  const lower = raw.toLowerCase();
  return map[raw] || map[lower] || compactLiveUiText(raw).replace(/-/g, ' ');
}

function compactDetailLines(lines, max = 4) {
  const arr = (Array.isArray(lines) ? lines : String(lines || '').split('\n'))
    .map(x => compactLiveUiText(String(x || '').trim()))
    .filter(Boolean);
  const trimmed = arr.slice(0, max);
  if (arr.length > max) trimmed.push(`+${arr.length - max} technikai sor elrejtve`);
  return trimmed.join('\n');
}

function compactPanelText(value, max = 3) {
  const lines = String(value || '')
    .split(/\n+/)
    .map(x => x.trim())
    .filter(Boolean);
  return compactDetailLines(lines, max);
}


function detailHtml(detail, rows = [], maxRows = 4) {
  const text = compactLiveUiText(detail || '');
  const compactRows = compactDetailLines(rows, maxRows);
  return `${escapeHtml(text)}${compactRows ? '<br>' + escapeHtml(compactRows).replace(/\n/g, '<br>') : ''}`;
}

function moduleNameLabel(name) {
  const raw = String(name || '');
  const map = {
    'Unified Runtime State': 'Egységes runtime állapot',
    'Unified Event Journal': 'Egységes eseménynapló',
    'AI Decision Router': 'AI döntési útválasztó',
    'Autonomous Mission Engine': 'Autonóm kereskedési motor',
    'Market Data Truth Layer': 'Piaci adat igazságréteg',
    'Risk Gate': 'Risk kapu',
    'Paper Execution Engine': 'Paper végrehajtási motor',
    'Portfolio Truth Layer': 'Portfólió igazságréteg',
    'Profit Vault Control Core': 'Profit vault kontroll',
    'Portfolio Risk Scaling Core': 'Portfólió risk skálázás',
    'Database Retention Maintenance Core': 'Adatkarbantartás',
    'Unlimited Learning Aggregate Stats Core': 'Korlátlan tanulási statisztika',
    'Continuous Autonomy Supervisor': 'Folyamatos autonóm felügyelet',
    'Runtime Null-Safety Stability Core': 'Runtime null-safety védelem',
    'Learning Feedback Store': 'Tanulási feedback tár',
    'Strategy Quality Autopilot Control Core': 'Stratégia-minőség autopilot',
    'Persistence Replay Core': 'Perzisztencia visszajátszás',
    'Safe Ready Start Activation Core': 'Safe-ready indítási mag',
    'Incident Runtime': 'Incidens runtime'
  };
  return map[raw] || raw;
}

function moduleDescLabel(desc) {
  return compactLiveUiText(String(desc || ''))
    .replace(/withdrawal ledger/gi, 'kivételi könyvelés')
    .replace(/trading tőke/gi, 'kereskedési tőke')
    .replace(/strategy score/gi, 'stratégia pontszám')
    .replace(/snapshot\/event\/strategy/gi, 'snapshot/esemény/stratégia')
    .replace(/frontend-limit/gi, 'frontend limit')
    .replace(/auto-resume/gi, 'automatikus újraindítás')
    .replace(/heartbeat/gi, 'életjelet')
    .replace(/stall-kick/gi, 'beragadás-oldást')
    .replace(/pause/gi, 'szünet')
    .replace(/undefined\/null/gi, 'hiányzó/null')
    .replace(/order lifecycle shape repair/gi, 'order életút javítás')
    .replace(/safe fallback/gi, 'biztonsági tartalék mód')
    .replace(/model registry/gi, 'modell nyilvántartás')
    .replace(/confidence/gi, 'bizalom')
    .replace(/symbol\/regime/gi, 'szimbólum/piaci rezsim');
}

function envStepTitle(step = {}) {
  const label = `${step.label || ''} ${step.key || ''}`;
  if (/PRIVATE_READ/i.test(label)) return 'Olvasási proof kapcsoló bekapcsolva';
  if (/REAL_SUBMIT/i.test(label)) return 'Éles orderküldés tiltva marad';
  if (/ALLOW_LIVE/i.test(label)) return 'Live engedély kikapcsolva marad';
  if (/API|kulcs/i.test(label)) return 'Mentett tőzsdei olvasási kulcspár elérhető';
  return compactLiveUiText(humanTechLabel(step.label || step.key || 'ENV ellenőrzés'));
}

function envStepDetail(step = {}) {
  const current = String(step.current ?? '').toLowerCase();
  const required = String(step.requiredValue ?? '').toLowerCase();
  const currentText = current === 'true' ? 'bekapcsolva' : current === 'false' ? 'kikapcsolva' : humanTechLabel(step.current ?? '-');
  const requiredText = required === 'true' ? 'bekapcsolva kell legyen' : required === 'false' ? 'kikapcsolva kell maradjon' : humanTechLabel(step.requiredValue ?? '-');
  return compactLiveUiText(`${currentText} • ${requiredText}. ${step.detail || ''}`);
}

function runtimeFeatureLabel(text) {
  return compactLiveUiText(String(text || ''))
    .replace(/auto-resume\s*\/\s*stall-kick\s*\/\s*safe pause/gi, 'automatikus újraindítás / beragadás-oldás / biztonsági szünet')
    .replace(/Hands-off OK/gi, 'Önműködés OK')
    .replace(/running/gi, 'fut')
    .replace(/ready/gi, 'kész');
}

function preciseTimeLabel(value, options = {}) {
  if (!value) return options.missing || '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const base = d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return options.ms === false ? base : `${base}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function item(entry) {
  const time = entry.time || entry.created_at || null;
  const rawLabel = entry.type || entry.step || entry.name || entry.level || '';
  const recovered = !!(entry.recovered || entry.staleRecovered);
  const label = recovered ? 'helyreállt előzmény' : eventTypeLabel(rawLabel);
  const text = compactLiveUiText(entry.text || entry.status || entry.message || '');
  const recovery = recovered && entry.recoveredAt ? ` • helyreállt: ${new Date(entry.recoveredAt).toLocaleTimeString('hu-HU')}` : '';
  const title = recovered ? escapeHtml(entry.recoveryNote || 'Korábbi incidens; aktuális proof alapján helyreállt.') : '';
  return `<div class="item ${escapeHtml(rawLabel)} ${recovered ? 'recoveredIncident' : ''}" title="${title}"><small class="eventMeta">${preciseTimeLabel(time, { missing: 'idő nélkül' })} • ${escapeHtml(label)}${recovery}</small><span class="eventText">${escapeHtml(text)}</span></div>`;
}

function stableDashboardSummary(state = {}) {
  const totalClosed = Math.max(Number(state?.aggregateStats?.closedTrades || 0), Number(state?.metrics?.closedTrades || 0), Number(state?.paperSimulation?.totalClosedTrades || 0));
  if (totalClosed <= 0 && Number(state?.learningMetrics?.effectiveSamples || 0) <= 0) return null;
  return {
    cachedAt: new Date().toISOString(),
    version: state.version,
    versionInfo: state.versionInfo,
    aggregateStats: state.aggregateStats,
    metrics: state.metrics,
    learningMetrics: state.learningMetrics,
    marketIntegrity: state.marketIntegrity,
    paperAccount: state.paperAccount,
    paperSimulation: state.paperSimulation,
    capital: state.capital,
    venueCapital: state.venueCapital,
    portfolioSupervisorAI: state.portfolioSupervisorAI,
    portfolioRiskScaling: state.portfolioRiskScaling,
    portfolio: state.portfolio,
    continuityCheckpoint: state.continuityCheckpoint,
    autonomousSupervisor: state.autonomousSupervisor,
    replay: state.replay
  };
}

function rememberStableDashboardState(state = S) {
  try {
    const summary = stableDashboardSummary(state);
    if (summary) localStorage.setItem(STABLE_STATE_CACHE_KEY, JSON.stringify(summary));
  } catch {}
}

function applyStableRecoveryOverlay(next = {}) {
  const nextClosed = Math.max(Number(next?.aggregateStats?.closedTrades || 0), Number(next?.metrics?.closedTrades || 0), Number(next?.paperSimulation?.totalClosedTrades || 0));
  const recovering = String(next?.phase || '').startsWith('RECOVERY') || !!next?.aggregateHydrationStatus?.pending || !!next?.dataSource?.hydrationPending;
  if (!recovering || nextClosed > 0) return next;
  const cached = stableDashboardSummary(S) || loadStableDashboardState();
  const cachedClosed = Math.max(Number(cached?.aggregateStats?.closedTrades || 0), Number(cached?.metrics?.closedTrades || 0), Number(cached?.paperSimulation?.totalClosedTrades || 0));
  if (cachedClosed <= 0) return next;
  return {
    ...next,
    aggregateStats: cached.aggregateStats || next.aggregateStats,
    metrics: cached.metrics || next.metrics,
    learningMetrics: cached.learningMetrics || next.learningMetrics,
    marketIntegrity: cached.marketIntegrity || next.marketIntegrity,
    paperAccount: cached.paperAccount || next.paperAccount,
    capital: cached.capital || next.capital,
    venueCapital: cached.venueCapital || next.venueCapital,
    portfolioSupervisorAI: cached.portfolioSupervisorAI || next.portfolioSupervisorAI,
    portfolioRiskScaling: cached.portfolioRiskScaling || next.portfolioRiskScaling,
    portfolio: cached.portfolio || next.portfolio,
    paperSimulation: { ...(cached.paperSimulation || {}), ...(next.paperSimulation || {}), totalClosedTrades: cachedClosed },
    continuityCheckpoint: cached.continuityCheckpoint || next.continuityCheckpoint,
    stableRecoveryOverlay: true,
    stableRecoveryCachedAt: cached.cachedAt || null
  };
}

function shouldKeepCurrentState(next) {
  const currentTrades = Number(S?.metrics?.closedTrades || 0);
  const nextTrades = Number(next?.metrics?.closedTrades || 0);
  const nextHydratingBlank = !!(next?.aggregateHydrationStatus?.pending || next?.dataSource?.hydrationPending) && nextTrades === 0;
  const transientRecoveryBlank = (currentTrades > 0 && nextTrades === 0 && ['RECOVERY_LOCKED', 'RECOVERY_SAFE_READY'].includes(String(next?.phase || ''))) || (currentTrades > 0 && nextHydratingBlank);
  const currentHasVenue = Number(S?.exchangeCount || 0) > 0;
  const nextLostVenueDuringRecovery = currentHasVenue && Number(next?.exchangeCount || 0) === 0 && String(next?.phase || '').startsWith('RECOVERY');
  return transientRecoveryBlank || nextLostVenueDuringRecovery;
}

async function refresh() {
  if (stateRefreshBusy) return;
  stateRefreshBusy = true;
  try {
    const next = applyStableRecoveryOverlay(await api('/api/dashboard/state'));
    if (!shouldKeepCurrentState(next)) S = next;
    rememberStableDashboardState(S);
    render();
  } catch (error) {
    console.warn('Állapotfrissítés átmeneti hiba', error);
    const status = $('#statusLine');
    if (status && String(status.textContent || '').toUpperCase() === 'BETÖLTÉS') status.textContent = 'ÚJRACSATLAKOZÁS';
  } finally {
    stateRefreshBusy = false;
  }
}

function setText(selector, value) {
  const el = $(selector);
  if (el) el.textContent = value;
}

function updateModeButtonLabels() {
  const ui = effectiveTradingModeUi();
  const paperBtn = document.querySelector('[data-action="paper"]');
  const stagingBtn = document.querySelector('[data-action="staging"]');
  const liveBtn = document.querySelector('[data-action="live"]');
  const modeStatus = document.querySelector('#modeStatus');
  const modeDetail = document.querySelector('#modeDetail');
  const activeStaging = ui.label.includes('staging') || ui.label.includes('Safe staging');
  if (modeStatus) {
    modeStatus.textContent = ui.label;
    modeStatus.classList.toggle('safe', activeStaging || ui.label.includes('safe'));
    modeStatus.classList.toggle('live', ui.label === 'Live mód');
  }
  if (modeDetail) modeDetail.textContent = ui.detail;
  if (paperBtn) {
    const paperActive = ui.label === 'Paper mód' || ui.label === 'Paper + proof mód';
    const safePaperVisible = activeStaging || ui.label.includes('safe') || ui.label.includes('staging');
    if (ui.label === 'Safe staging mód') {
      paperBtn.textContent = '✓ Safe staging mód';
      paperBtn.title = 'Staging/paper proof aktív; ez továbbra sem live orderküldés.';
    } else if (safePaperVisible) {
      paperBtn.textContent = '✓ Paper/staging safe mód';
      paperBtn.title = ui.detail || 'Safe-lock aktív; éles order nem indul.';
    } else {
      paperBtn.textContent = paperActive ? '✓ Paper mód' : 'Paper mód';
      paperBtn.title = ui.detail;
    }
    paperBtn.classList.toggle('active', paperActive || safePaperVisible);
    paperBtn.classList.toggle('safeModeMirror', safePaperVisible);
  }
  if (stagingBtn) {
    stagingBtn.textContent = activeStaging ? '✓ Safe staging' : 'Staging';
    stagingBtn.title = activeStaging ? 'Staging/paper proof aktív; ez továbbra sem live orderküldés.' : ui.detail;
    stagingBtn.classList.toggle('active', activeStaging);
  }
  if (liveBtn) {
    liveBtn.textContent = ui.label === 'Live mód' ? '✓ Live mód' : 'Live mód';
    liveBtn.title = ui.label.includes('safe') || ui.label.includes('staging') ? 'Éles live továbbra is safe-lock alatt tiltva.' : ui.detail;
    liveBtn.classList.toggle('active', ui.label === 'Live mód');
  }
}

function renderAccountingModeNotice() {
  const box = $('#accountingModeBox');
  if (!box) return;
  const mode = S.accountingMode || {};
  const virtual = mode.virtual !== false;
  const cap = mode.realExchangeCapital || {};
  const binanceBalance = mode.realExchangeBalanceKnown ? mode.realExchangeBalance : null;
  const integrity = S.marketIntegrity || {};
  const verified = integrity.verifiedStats || {};
  const legacy = integrity.legacySnapshot || {};
  const capText = binanceBalance === null
    ? 'Nincs bizonyított valós Binance/tőzsdei tőke. A Net profit nem Binance egyenleg.'
    : `${usd(cap.quoteUsd || binanceBalance.quoteUsd || 0)} quote/stable proof • minimum ${usd(cap.minUsd || binanceBalance.minUsd || 10)} • ${cap.funded ? 'funded' : 'nincs/kevés valós tőke'}`;
  const rows = [
    `<div class="check ok"><b>${virtual ? 'Paper/staging virtuális könyvelés' : 'Valós exchange könyvelés'}</b><small>${escapeHtml(mode.note || 'A Net profit és aktív tőke a bot belső paper/staging journaljából számolódik.')}</small></div>`,
    `<div class="check ${mode.liveSubmitEnabled ? 'warn' : 'ok'}"><b>Éles orderküldés: ${mode.liveSubmitEnabled ? 'engedélyezve' : 'tiltva'}</b><small>${mode.liveSubmitEnabled ? 'Csak live engedélyezés után számítana valós kereskedési PnL-nek.' : 'A Binance számlán lévő pénzt nem használja valódi orderre.'}</small></div>`,
    `<div class="check ${cap.funded ? 'ok' : 'warn'}"><b>Valós Binance/tőzsdei tőke proof</b><small>${escapeHtml(capText)} Live élesítéshez ez külön kötelező; a virtuális profit nem használható live méretezéshez.</small></div>`
  ];
  if (integrity.enabled) {
    const legacyClosed = Math.max(Number(legacy.closedTrades || 0), Math.max(0, Number(S.aggregateStats?.closedTrades || 0) - Number(verified.closedTrades || 0)));
    const h = integrity.historicalLearning || {};
    rows.push(`<div class="check ${Number(verified.closedTrades || 0) > 0 ? 'ok' : 'warn'}"><b>Verified market journal: ${Number(verified.closedTrades || 0)} trade</b><small>WR ${verified.winRate ?? 'N/A'}% • PnL ${usd(verified.netPnl || 0)} • verified tőke ${usd(integrity.verifiedCapital?.activeTradingCapital || 0)}. A valós tőke és profit kizárólag ebből számolódik.</small></div>`);
    rows.push(`<div class="check ${Number(h.effectiveHistoricalSamples || 0) > 0 ? 'ok' : 'warn'}"><b>Történeti tanulási tudásalap: ${Number(h.acceptedDetailedTrades || 0)} részletes + ${Number(h.aggregateFallbackTrades || 0)} aggregált régi rekord</b><small>${Number(h.effectiveHistoricalSamples || 0).toFixed(1)} effektív történeti minta (${Number(h.detailedEffectiveSamples || 0).toFixed(1)} részletes + ${Number(h.aggregateFallbackEffectiveSamples || 0).toFixed(1)} aggregált prior) • súlyozott WR ${h.weightedWinRate ?? 'N/A'}% • kizárva ${Number(h.rejectedDetailedTrades || 0)} • teljes legacy referencia ${legacyClosed}. Supabase scan: ${Number(h.remoteRowsScanned || 0).toLocaleString('hu-HU')} sor, felismert lezárt: ${Number(h.recognizedClosedRows || 0).toLocaleString('hu-HU')}, archivált prior: ${Number(h.archiveLegacyTrades || 0).toLocaleString('hu-HU')}. A trade journal automatikusan nem törlődik; a régi adatok segítik a stratégiatanulást, de nem írják át a verified PnL-t vagy tőkét.</small></div>`);
  }
  box.innerHTML = rows.join('');
}


function renderHistoricalLearningStatus() {
  const box = $('#historicalLearningBox');
  if (!box) return;
  const h = S.marketIntegrity?.historicalLearning || {};
  const lm = S.learningMetrics || {};
  const enabled = h.enabled !== false;
  const accepted = Number(h.acceptedDetailedTrades || 0);
  const rejected = Number(h.rejectedDetailedTrades || 0);
  const effective = Number(h.effectiveHistoricalSamples || 0);
  const verified = Number(lm.rawVerifiedTrades || S.marketIntegrity?.verifiedStats?.closedTrades || 0);
  const combined = Number(lm.effectiveSamples || h.combinedEffectiveSamples || verified + effective);
  const combinedWr = lm.winRate ?? h.combinedWinRate;
  const source = String(h.source || 'még nincs felépítve').replace(/-/g, ' ');
  const statusClass = enabled && effective > 0 ? 'ok' : (enabled ? 'warn' : 'bad');
  box.innerHTML = `
    <div class="check ${statusClass}"><b>Régi trade-ek aktív tanulási felhasználása: ${enabled ? 'BEKAPCSOLVA' : 'KIKAPCSOLVA'}</b><small>Elfogadott részletes trade: ${accepted} • aggregált történeti prior: ${Number(h.aggregateFallbackTrades || 0)} rekord • kizárt hibás/proof/hiányos rekord: ${rejected} • effektív történeti súly: ${effective.toFixed(1)} / ${Number(h.effectiveSampleCap || 0).toFixed(0)}.</small></div>
    <div class="check ${combined > 0 ? 'ok' : 'warn'}"><b>Összesített AI-tudás: ${combined.toFixed(1)} effektív minta</b><small>${verified} verified trade + ${effective.toFixed(1)} történeti effektív minta • kombinált tanulási prior ${combinedWr == null ? 'N/A' : Number(combinedWr).toFixed(1) + '%'} • történeti prior ${h.weightedWinRate == null ? 'N/A' : Number(h.weightedWinRate).toFixed(1) + '%'}. Ez tudásbázis, nem a mostani verified kereskedés tényleges winrate-je.</small></div>
    <div class="check ok"><b>Biztonsági szétválasztás</b><small>A régi trade-ek stratégiát, szimbólumot, irányt és confidence-kalibrációt tanítanak. A paper equity, kivehető profit, aktív tőke és drawdown továbbra is kizárólag az új verified journalból számolódik. Forrás: ${escapeHtml(source)}.</small></div>
    <div class="check ${S.continuityCheckpoint?.status === 'write-failed' ? 'bad' : 'ok'}"><b>Restart-folytonosság: ${escapeHtml(S.continuityCheckpoint?.status || 'előkészítve')}</b><small>Checkpoint: ${escapeHtml(S.continuityCheckpoint?.savedAt || S.continuityCheckpoint?.loadedAt || 'első mentésre vár')} • automatikus futási szándék: ${S.autonomousSupervisor?.desiredAutopilot === false ? 'KIKAPCSOLVA' : 'BEKAPCSOLVA'} • teljes history: ${escapeHtml(S.replay?.fullHistoryStatus || 'checkpoint alapján kész')}.</small></div>`;
}

function simulationTrendLabel(direction = '') {
  const map = { improving: 'JAVULÓ', declining: 'ROMLÓ', stable: 'STABIL', 'warming-up': 'MINTA GYŰLIK' };
  return map[String(direction || '')] || 'MINTA GYŰLIK';
}

function simulationTrendClass(direction = '') {
  if (direction === 'improving') return 'ok';
  if (direction === 'declining') return 'bad';
  return 'warn';
}

function simulationSparkline(points = []) {
  const rows = asList(points).map(x => Number(x.equity || 0)).filter(Number.isFinite);
  if (rows.length < 2) return '<small>Még nincs elég lezárt verified trade a fejlődési görbéhez.</small>';
  const width = 640, height = 86, pad = 7;
  const min = Math.min(...rows), max = Math.max(...rows);
  const span = Math.max(0.0001, max - min);
  const coords = rows.map((v, i) => {
    const x = pad + (i / Math.max(1, rows.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<div class="simSparkHeader"><span>Verified paper equity trend</span><b>${usd(rows[rows.length - 1])}</b></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Paper equity fejlődési görbe"><polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="3" vector-effect="non-scaling-stroke"></polyline></svg><small>Minimum ${usd(min)} • maximum ${usd(max)} • ${rows.length} pont</small>`;
}

function renderPaperSimulationProgress() {
  const p = S.paperSimulation || {};
  setText('#simSessionClosed', Number(p.processClosedTrades || 0));
  const processWr = p.processWinRate == null ? 'N/A' : `${Number(p.processWinRate).toFixed(1)}%`;
  setText('#simSessionStats', `Winrate: ${processWr} • PnL: ${usd(p.processNetPnl || 0)} • process indulás óta`);
  setText('#simTotalClosed', Number(p.totalClosedTrades || 0));
  const h = S.marketIntegrity?.historicalLearning || {};
  setText('#simVerifiedSplit', `Verified: ${Number(p.verifiedClosedTrades || 0)} • régi részletes (megmaradt): ${Number(h.acceptedDetailedTrades || 0)} • régi aggregált prior: ${Number(h.aggregateFallbackTrades || 0)} • kizárt: ${Number(h.rejectedDetailedTrades || 0)}`);
  setText('#simSpeed', `Most ${Number(p.processTradesPerHour ?? p.tradesPerHour ?? 0).toFixed(1)}/h • utolsó 60p: ${Number(p.rolling60mClosedTrades || 0)} trade • aktív ${Number(p.activeOrderCount || 0)}/${Number(p.maxConcurrentPositions || 1)}`);
  const currentEngine = p.currentStrategy || {};
  const currentEngineWr = currentEngine.winRate == null ? 'N/A' : `${Number(currentEngine.winRate).toFixed(1)}%`;
  const stagingProof = p.stagingAutoProof || {};
  const engineLabel = String(currentEngine.strategyVersion || FRONTEND_VERSION).split('-').slice(0, 2).join('-') || FRONTEND_VERSION;
  setText('#simCycle', `Ciklus: ${Number(p.cycleNo || 0)} • aktuális process: ${Math.floor(Number(p.processElapsedSec || 0) / 60)}p / ${Number(p.processClosedTrades || 0)} trade • tartós session átlag: ${Number(p.persistentSessionTradesPerHour || 0).toFixed(1)}/h • ${engineLabel} saját WR ${currentEngineWr} (${Number(currentEngine.trades || 0)}) • saját PnL ${usd(currentEngine.netPnl || 0)} • staging proof ${Number(stagingProof.count || 0)}/${Number(stagingProof.required || 20)}`);
  setText('#simTrend', simulationTrendLabel(p.trend?.direction));
  const qualityCycle = S.autonomousSupervisor?.lastQualityCycle || {};
  const qualityProtection = qualityCycle.qualityProtection || {};
  const coverageText = Number(qualityCycle.requiredCostCoverage || 0) > 0
    ? ` • költségfedezet ${Number(qualityCycle.costCoverageRatio || 0).toFixed(2)}x/${Number(qualityCycle.requiredCostCoverage || 0).toFixed(2)}x • iránytartás ${Number(qualityCycle.directionalPersistencePct || 0).toFixed(0)}%/${Number(qualityCycle.requiredPersistencePct || 0).toFixed(0)}%`
    : '';
  const pauseUntilMs = Date.parse(qualityProtection.lossStreakPauseUntil || '');
  const pauseRemainingSec = Number.isFinite(pauseUntilMs) ? Math.max(0, Math.ceil((pauseUntilMs - Date.now()) / 1000)) : 0;
  const protectionText = `védelem ${String(qualityProtection.severity || 'normal').toUpperCase()}${Number(qualityProtection.globalLossStreak || 0) ? ` • vesztes széria ${Number(qualityProtection.globalLossStreak || 0)}` : ''}${pauseRemainingSec > 0 ? ` • automatikus megfigyelési szünet ${pauseRemainingSec}s` : ''}`;
  const qualityText = qualityCycle.signalSide
    ? ` • utolsó jel ${qualityCycle.signalSide}, edge ${Number(qualityCycle.signalEdge || 0).toFixed(1)}/${Number(qualityCycle.requiredEdge || 0).toFixed(1)}${coverageText} • ${protectionText}`
    : ` • minőségi jelre vár${coverageText} • ${protectionText}`;
  const trendDetail = p.trend?.recent?.trades
    ? `Utolsó ${Number(p.trend.recent.trades || 0)} trade: WR ${p.trend.recent.winRate == null ? 'N/A' : Number(p.trend.recent.winRate).toFixed(1) + '%'} • PnL ${usd(p.trend.recent.netPnl || 0)}${qualityText}`
    : `A fejlődési összevetés az első lezárt trade-ek után indul.${qualityText}`;
  setText('#simTrendDetail', trendDetail);
  const trendEl = $('#simTrend');
  if (trendEl) trendEl.className = simulationTrendClass(p.trend?.direction);
  const badge = $('#simStatusBadge');
  if (badge) {
    badge.textContent = p.statusLabel || (p.running ? 'FUT' : 'KÉSZENLÉT');
    badge.className = `simBadge ${p.running ? (p.activeOrder ? 'active' : 'ok') : 'warn'}`;
  }
  const active = p.activeOrder;
  const bar = $('#simProgressBar');
  if (active) {
    setText('#simPositionTitle', `${active.symbol || '-'} ${active.side || '-'} • NYITOTT POZÍCIÓ • összesen ${Number(p.activeOrderCount || 1)}/${Number(p.maxConcurrentPositions || 1)}`);
    const technical = active.technical || {};
    setText('#simPositionDetail', `Belépő ${Number(active.entryPrice || 0).toFixed(6)} • mark ${Number(active.lastMarkPrice || 0).toFixed(6)} • mozgás ${Number(active.marketMovePct || 0).toFixed(4)}% • becsült nettó ${usd(active.estimatedNetPnl || 0)} • momentum ${String(technical.momentumSide || 'HOLD')} ${Number(technical.momentumScore || 0).toFixed(1)}`);
    const watchdogText = active.watchdogOverdue
      ? ' • WATCHDOG: felszabadítás esedékes'
      : ` • watchdog tartalék ${Number(active.watchdogReleaseInSec || 0)} mp`;
    setText('#simProgressText', `Nyitva ${Number(active.holdingSec || 0)} mp • minimum ${Number(active.minHoldSec || 0)} mp • profitfelülvizsgálat ${Number(active.softHoldSec || 0)} mp • hard maximum ${Number(active.maxHoldSec || 0)} mp • legkésőbb kb. ${Number(active.nextCloseInSec || 0)} mp${watchdogText}; TP/SL vagy valós technikai fordulat korábban is zárhat.`);
    if (bar) bar.style.width = `${Math.max(2, Math.min(100, Number(active.holdingProgressPct || 0)))}%`;
  } else {
    setText('#simPositionTitle', p.running ? 'Nincs nyitott paper pozíció — új belépés keresése folyamatban' : 'A szimulált kereskedés jelenleg nem fut');
    setText('#simPositionDetail', p.marketData?.degraded ? 'A rendszer friss public market adatra vár; stale/szimulált árból nem ír hamis trade-et.' : (p.statusLabel || 'Piacfigyelés és risk ellenőrzés.'));
    setText('#simProgressText', p.lastTrade ? `Utolsó lezárás: ${p.lastTrade.symbol} ${p.lastTrade.side} • ${usd(p.lastTrade.netPnl || 0)} • ${timeLabel(p.lastTrade.closedAt)}` : 'Az első lezárt trade után a winrate és a fejlődési trend automatikusan megjelenik.');
    if (bar) bar.style.width = p.running ? '12%' : '0%';
  }
  const spark = $('#simEquitySpark');
  if (spark) spark.innerHTML = simulationSparkline(p.trend?.equityCurve || []);
  renderHistoricalLearningStatus();
}

function render() {
  if (!S || !S.ok) return;
  const version = S.versionInfo?.version || S.version || FRONTEND_VERSION;
  const backendVersion = String(S.versionInfo?.version || '').trim();
  if (backendVersion && backendVersion !== FRONTEND_VERSION && !versionMismatchToastShown) {
    versionMismatchToastShown = true;
    toast(`Verzió cache eltérés: frontend ${FRONTEND_VERSION}, backend ${backendVersion}. Zárd be a régi tabot vagy nyomj Ctrl+F5-öt.`);
  }
  document.title = `NEXUS AI ${backendVersion || FRONTEND_VERSION}`;
  setText('#brandVersion', version);
  setText('#footerVersion', S.version || version);
  setText('#buildLabel', S.versionInfo?.build || FRONTEND_BUILD);
  const parsedServerTime = Date.parse(S.serverTime || '');
  if (Number.isFinite(parsedServerTime)) {
    lastServerTimeMs = parsedServerTime;
    lastServerTimeClientAt = Date.now();
  }
  setText('#srv', Number.isFinite(lastServerTimeMs) && lastServerTimeMs > 0 ? new Date(lastServerTimeMs).toLocaleTimeString('hu-HU') : '-');
  setText('#dd', (S.metrics?.maxDrawdownPct ?? S.portfolio?.drawdown ?? 0) + '%');
  setText('#readinessText', S.readinessCheck?.summary || S.readiness || '-');
  setText('#conn', connectionFooterLabel());
  const connEl = $('#conn');
  if (connEl) connEl.title = connectionFooterTitle();
  setText('#uptime', Math.floor((S.uptimeSec || 0) / 60) + 'm');
  setText('#statusLine', S.killSwitch || S.emergency ? 'VÉSZ STOP' : 'ONLINE');
  const startupRecovering = !S.autopilot && String(S.phase || '').startsWith('RECOVERY') && ['not-run', 'running'].includes(String(S.startupAutoProof?.status || ''));
  setText('#auto', S.autopilot ? 'AKTÍV' : (startupRecovering ? 'INDULÁS' : 'KÉSZENLÉT'));
  setText('#phaseSmall', startupRecovering ? 'Startup autoproof előkészítés' : humanPhase(S.phase || '-', false));
  const phaseSmallEl = $('#phaseSmall');
  if (phaseSmallEl) phaseSmallEl.title = rawPhaseTitle(S.phase);
  setText('#ready', humanPhase(S.readiness || '-', false));
  const readyEl = $('#ready');
  if (readyEl) readyEl.title = rawPhaseTitle(S.readiness);
  updateModeButtonLabels();
  const hydration = S.aggregateHydrationStatus || {};
  const metricsClosed = Number(S.metrics?.closedTrades || 0);
  const metricsHydrating = (S.dataSource?.hydrationPending || hydration.pending) && metricsClosed <= 0;
  const integrity = S.marketIntegrity || {};
  const verifiedStats = integrity.verifiedStats || {};
  const sim = S.paperSimulation || {};
  const totalClosed = Math.max(Number(sim.totalClosedTrades || 0), metricsClosed, Number(S.aggregateStats?.closedTrades || 0));
  const verifiedClosed = Math.max(Number(sim.verifiedClosedTrades || 0), Number(verifiedStats.closedTrades || 0));
  const primaryMetrics = verifiedClosed > 0 ? verifiedStats : (S.metrics || S.aggregateStats || {});
  setText('#pnl', metricsHydrating ? 'betöltés...' : usd(primaryMetrics?.netPnl || 0));
  const historyLearning = integrity.historicalLearning || {};
  const combinedLearningWinRate = S.learningMetrics?.winRate ?? historyLearning.combinedWinRate;
  const hasHistoricalLearning = Number(historyLearning.effectiveHistoricalSamples || 0) > 0 && combinedLearningWinRate != null;
  const displayWinRateValue = hasHistoricalLearning ? combinedLearningWinRate : primaryMetrics?.winRate;
  const displayWinRate = displayWinRateValue == null ? 'N/A' : `${Number(displayWinRateValue).toFixed(1)}%`;
  setText('#winRateLabel', hasHistoricalLearning ? 'Kombinált tanulási prior' : 'Verified winrate');
  setText('#winRate', metricsHydrating ? 'VISSZATÖLTÉS' : displayWinRate);
  const verifiedWinRateText = verifiedStats?.winRate == null ? 'N/A' : `${Number(verifiedStats.winRate).toFixed(1)}%`;
  const symbolIntegrity = integrity.symbolPriceIntegrity || {};
  const quarantinedTradeCount = Number(symbolIntegrity.quarantinedTrades || integrity.quarantinedTrades || 0);
  const integritySuffix = quarantinedTradeCount > 0 ? ` • adathibás cross-symbol karantén: ${quarantinedTradeCount}` : ' • szimbólum/ár integritás: OK';
  setText('#tradeCount', metricsHydrating ? 'checkpoint visszatöltése...' : `Tanulási prior: ${displayWinRate} • tényleges új verified WR: ${verifiedWinRateText} (${verifiedClosed} trade) • összes lezárt: ${totalClosed} • aktuális process: ${Number(sim.processClosedTrades || 0)}${integritySuffix}`);
  const counterInfo = counterProofInfo();
  const tradeCountEl = $('#tradeCount');
  if (tradeCountEl) tradeCountEl.title = (counterInfo.label + ' — ' + counterInfo.detail + (S.metrics?.winRateNote ? ' — ' + S.metrics.winRateNote : '')).trim();
  const pnlNoteEl = $('#pnlNote');
  if (pnlNoteEl) {
    const legacyCount = Number(sim.legacyClosedTrades || 0);
    const integrityText = quarantinedTradeCount > 0 ? ` ${quarantinedTradeCount} hibás szimbólum/ár rekord karanténban, minden eredményből kizárva.` : '';
    pnlNoteEl.textContent = verifiedClosed > 0
      ? `Verified public-market paper PnL • ${verifiedClosed} lezárt trade • aktuális processben ${Number(sim.processClosedTrades || 0)}. Nem Binance egyenleg.${integrityText}`
      : `Még nincs verified lezárás. Összes ismert történeti paper trade: ${totalClosed}; ebből legacy referencia: ${legacyCount}. A nyitott pozíció állapota lent élőben követhető.${integrityText}`;
  }
  setText('#phase', humanPhase(S.phase || '-', true));
  const phaseEl = $('#phase');
  if (phaseEl) phaseEl.title = rawPhaseTitle(S.phase);
  const sourceInfo = displayDataSourceInfo();
  setText('#sourceType', sourceInfo.source);
  setText('#sourceLabel', sourceInfo.label);
  const metricInfo = metricTrustInfo();
  setText('#metricTrust', metricInfo.label);
  const metricTrustEl = $('#metricTrust');
  if (metricTrustEl && metricTrustEl.nextElementSibling) metricTrustEl.nextElementSibling.textContent = metricInfo.detail;
  const banner = $('#sourceBanner');
  if (banner) banner.className = 'sourceBanner ' + (S.dataSource?.severity || 'danger');
  const renderers = [
    ['paper-simulation', renderPaperSimulationProgress],
    ['accounting', renderAccountingModeNotice],
    ['venue-capital-quick', renderVenueCapitalQuick],
    ['checklist', renderChecklist],
    ['supabase', renderSupabaseCheck],
    ['promotion', renderPromotion],
    ['events', renderEvents],
    ['pipeline', renderPipeline],
    ['runtime-safety', renderRuntimeSafety],
    ['exchanges', renderExchanges],
    ['testnet-proof', renderTestnetProofPanel],
    ['portfolio', renderPortfolio],
    ['profit-vault', renderProfitVault],
    ['learning-observation', renderLearningObservation],
    ['modules', renderModules],
    ['orders', renderOrders]
  ];
  for (const [name, renderer] of renderers) {
    try { renderer(); }
    catch (error) {
      console.warn(`NEXUS render section failed: ${name}`, error);
      const fallbackTarget = {
        'supabase': '#supabaseCheck',
        'learning-observation': '#learningObservationBox',
        'modules': '#moduleBox',
        'orders': '#orderBox'
      }[name];
      const el = fallbackTarget ? $(fallbackTarget) : null;
      if (el && !el.innerHTML.trim()) el.innerHTML = `<div class="item">A nézet átmenetileg nem tölthető be; az alap runtime tovább fut. ${escapeHtml(error.message || '')}</div>`;
    }
  }
}

// v199_52: compatibility renderer used by manual live-proof buttons.
// v199_51 called renderAll(), but only render() existed, so the buttons crashed
// before the API request. Keep this alias stable for every manual button.
function renderAll() {
  try { render(); } catch (error) { console.warn('renderAll fallback error', error); }
}

function startupSyncedChecklistRows(rows = []) {
  const sync = S.startupProofStateSync || {};
  return rows.map(row => {
    const x = { ...row };
    if (x.key === 'testnet_execution_proof' && sync.testnetExecutionOk) {
      x.ok = true;
      x.detail = humanTechLabel(sync.detail || `OK • ${sync.testnetExecutionVenue || '-'} • ${sync.testnetExecutionStatus || 'TESTNET_EXECUTION_PROOF_OK'}`);
    }
    if (x.key === 'live_readonly_proof' && sync.liveReadonlyOk) {
      x.ok = true;
      x.detail = `OK • utolsó: ${sync.liveReadonlyAt || '-'}`;
    }
    if (x.key === 'proof_persistence' && sync.persistenceOk) {
      x.ok = true;
      x.detail = humanTechLabel(sync.persistenceStatus || 'Live olvasási proof mentés OK');
    }
    if (x.key === 'rehydrate_proof' && sync.rehydrateOk) {
      x.ok = true;
      x.detail = humanTechLabel(sync.rehydrateStatus || 'Rehydrate proof OK');
    }
    if (x.key === 'final_preflight_lock' && sync.finalLockOk) {
      x.ok = true;
      x.detail = humanTechLabel(sync.finalLockStatus || 'SAFE LOCK OK — live előkészítve, de szándékosan zárolva');
    }
    return x;
  });
}

function renderChecklist() {
  const box = $('#checklist');
  if (!box) return;
  const auto = S.startupAutoProof || {};
  const autoStatus = String(auto.status || 'not-run');
  const autoRow = auto.status ? [{
    key: 'startup_autoproof',
    name: 'Startup autoproof / kézi kattintás csökkentés',
    ok: auto.ok || autoStatus === 'ok' || autoStatus === 'skipped',
    neutral: autoStatus === 'not-run' || autoStatus === 'running',
    blocking: false,
    detail: autoStatus === 'running' ? 'Automatikus proof javítás fut...' : (autoStatus === 'not-run' ? 'Automatikus proof indulásra vár vagy már háttérben készül. Ez nem kézi hiba.' : (auto.summary || auto.skipped || auto.status || '-'))
  }] : [];
  const rows = [...autoRow, ...startupSyncedChecklistRows(S.readinessCheck?.checklist || [])];
  box.innerHTML = rows.map(x => {
    const cls = x.ok ? 'ok' : (x.neutral ? '' : (x.blocking ? 'bad' : 'warn'));
    const mark = x.ok ? '✓' : (x.neutral ? '•' : (x.blocking ? '×' : '!'));
    const name = readinessRowName(x);
    const detail = readinessRowDetail(x);
    return `<div class="check ${cls}"><b>${mark} ${escapeHtml(name)}</b><small>${escapeHtml(detail)}${x.blocking ? '' : ' • opcionális'}</small></div>`;
  }).join('');
}

function readinessRowName(row = {}) {
  const key = String(row.key || '');
  const ok = !!row.ok;
  const map = {
    connection_proof: ok ? 'Kapcsolat proof OK' : 'Kapcsolat proof még nincs',
    testnet_execution_proof: 'Staging order proof',
    live_readonly_proof: 'Live olvasási proof',
    proof_persistence: 'Proof mentés státusz',
    rehydrate_proof: 'Visszatöltés proof',
    final_preflight_lock: 'Végső safe-lock',
    paper_first: 'Paper/staging aktív — live csak külön feloldással'
  };
  return map[key] || compactLiveUiText(row.name || '-');
}

function readinessRowDetail(row = {}) {
  const key = String(row.key || '');
  const raw = String(row.detail || '');
  if (key === 'connection_proof' && !row.ok) {
    if (/nincs mentett/i.test(raw)) return 'Nincs mentett tőzsde. Ez nem sikeres kapcsolat, előbb a Tőzsdék panelen kell menteni/tesztelni.';
    return 'Kapcsolat proof még nem aktív. Ez csak előkészítési hiány, nem API összeomlás.';
  }
  return compactLiveUiText(humanTechLabel(raw || '-'));
}


function boolLabel(value) {
  if (value === true) return 'igen';
  if (value === false) return 'nem';
  return 'még nem tesztelt';
}

function timeLabel(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('hu-HU');
}

function shortJson(value) {
  try { return JSON.stringify(value, null, 2).slice(0, 1800); }
  catch { return String(value || '-'); }
}


function statusHasOk(value) {
  return /OK|HEALTHY|READY|ACTIVE|retention-ok|audit-ok|READ_WRITE_PROOF_OK/i.test(String(value || ''));
}

function statusHasProblem(value) {
  return /ERROR|FAILED|FAIL|WARNING|WARN|MISSING|INVALID|NOT_CONFIGURED|retention-error|retention-warning|audit-warning/i.test(String(value || ''));
}

function supabaseConfiguredNow(h) {
  return h.configured ?? S.persistence?.supabaseConfigured ?? false;
}

function supabaseSchemaWarn(h = {}) {
  const status = String(h.status || h.schemaStatus || '');
  const missing = supabaseMissingTablesArray(h);
  // Only confirmed missing tables are schema problems. Permission/timeouts are shown separately.
  if (missing.length > 0 || h.schemaRepairRequired === true) return true;
  if (h.fallbackActive === true || h.proof?.fallbackActive === true) return false;
  if (supabaseFullCriticalProofOk(h)) return false;
  return /SCHEMA_MISSING|TABLE_MISSING|SCHEMA_REPAIR_REQUIRED/i.test(status);
}

function supabaseMissingTablesArray(h = {}) {
  const critical = Array.isArray(h.criticalMissingTables) ? h.criticalMissingTables : [];
  const missing = Array.isArray(h.missingTables) ? h.missingTables : [];
  let rows = Array.from(new Set([...(critical || []), ...(missing || [])].map(x => String(x || '').trim()).filter(Boolean)));
  if (supabaseProofOk(h) || h.schemaProofReconciled === true) rows = rows.filter(x => x !== 'runtime_snapshots');
  return rows;
}

function supabaseMissingTablesText(h = {}) {
  const rows = supabaseMissingTablesArray(h);
  return rows.length ? rows.slice(0, 8).join(', ') + (rows.length > 8 ? '…' : '') : '';
}

function supabaseRuntimeSnapshotMissing(h = {}) {
  return supabaseMissingTablesArray(h).includes('runtime_snapshots');
}

function supabaseHealthStatusText(h = {}) {
  if (!supabaseConfiguredNow(h)) return 'Railway ENV hiányzik vagy nincs beállítva';
  if (supabaseProofOk(h) && (h.restOk === true || h.ok === true || h.schemaProofReconciled === true) && !supabaseSchemaWarn(h)) {
    if (h.fallbackActive === true || h.proof?.fallbackActive === true) return `REST + continuity proof OK — táblafallback: ${(h.fallbackTables || h.proof?.fallbackTables || []).join(', ') || 'aktív'}`;
    return supabaseFullCriticalProofOk(h) ? 'REST + teljes háromtáblás proof OK' : 'REST + continuity proof OK';
  }
  if (supabaseSchemaWarn(h)) {
    const tables = supabaseMissingTablesText(h);
    const file = h.schemaRepairSqlFile || 'infra/supabase_tools.sql';
    return tables ? `REST kapcsolat él, de SQL séma javítás kell: ${tables} • futtasd: ${file}` : `REST kapcsolat él, de SQL séma ellenőrzendő • futtasd: ${file}`;
  }
  return humanTechLabel(h.status || '-');
}

function supabaseConnectionOk(h) {
  const configured = supabaseConfiguredNow(h);
  if (!configured) return false;
  if (h.restOk === true) return true;
  if (h.ok === true && h.safeMode !== true) return true;
  return statusHasOk(h.status) && !/FAILED|NOT_CONFIGURED|INVALID/i.test(String(h.status || ''));
}

function supabaseProofOk(h) {
  const proof = h.proof || {};
  if (proof.coreContinuityOk === true || h.coreContinuityOk === true) return true;
  if (proof.lastProofOk === true || (proof.writeOk === true && proof.readOk === true)) return true;
  return /SUPABASE_(?:READ_WRITE_PROOF_OK|FULL_CRITICAL_PROOF_OK|CORE_CONTINUITY_OK_WITH_TABLE_FALLBACK)/.test(String(h.status || ''));
}

function supabaseFullCriticalProofOk(h = {}) {
  const proof = h.proof || {};
  return proof.fullCriticalOk === true || h.fullCriticalProofOk === true || String(h.status || '') === 'SUPABASE_FULL_CRITICAL_PROOF_OK';
}

function supabaseSqlRetentionInstalled(h = S.supabaseHealth || {}, m = S.databaseMaintenance || {}) {
  return h.sqlRetentionInstalled === true || m.sqlRetentionInstalled === true || m.maintenanceComplete === true;
}

function supabaseOverallClass() {
  const h = S.supabaseHealth || {};
  const m = S.databaseMaintenance || {};
  if (supabaseSchemaWarn(h)) return supabaseProofOk(h) || h.restOk === true || h.ok === true ? 'warn' : 'bad';
  if (supabaseConnectionOk(h) && supabaseFullCriticalProofOk(h) && !supabaseSqlRetentionInstalled(h, m)) return 'warn';
  if (supabaseConnectionOk(h) && supabaseFullCriticalProofOk(h)) return 'ok';
  if (h.fallbackActive === true || h.proof?.fallbackActive === true) return 'warn';
  if (supabaseConfiguredNow(h) && (h.restOk === true || h.ok === true || supabaseProofOk(h))) return 'warn';
  return 'bad';
}

function supabaseOverallLabel() {
  const h = S.supabaseHealth || {};
  const m = S.databaseMaintenance || {};
  if (supabaseSchemaWarn(h)) return 'Supabase séma javítás kell';
  if (supabaseConnectionOk(h) && supabaseFullCriticalProofOk(h) && !supabaseSqlRetentionInstalled(h, m)) return 'Supabase teljes proof OK • DB cron nincs telepítve';
  if (supabaseConnectionOk(h) && supabaseFullCriticalProofOk(h)) return 'Supabase teljesen működik';
  if (h.fallbackActive === true || h.proof?.fallbackActive === true) return 'Supabase continuity működik • táblafallback aktív';
  if (supabaseConnectionOk(h) && supabaseProofOk(h)) return 'Supabase continuity proof OK';
  if (supabaseConnectionOk(h)) return 'Supabase kapcsolat OK, proof még nem teljes';
  if (supabaseConfiguredNow(h)) return h.safeMode ? 'Supabase safe persistence módban' : 'Supabase beállítva, ellenőrzés kell';
  return 'Supabase nincs beállítva';
}

function auditCurrentClass(a) {
  const status = String(a.status || '');
  if (a.currentOk === true || status === 'audit-ok' || (a.lastAuditAt && !a.lastError && !statusHasProblem(status))) return 'ok';
  if (a.currentOk === false || /audit-warning|audit-error|ERROR|FAILED/i.test(status)) return 'warn';
  return 'warn';
}

function auditCurrentText(a) {
  const failed = Number(a.counts?.failed || 0);
  const total = Number(a.counts?.total || 0);
  if (auditCurrentClass(a) === 'ok') {
    return `Aktuális audit OK${failed ? ` • korábbi figyelmeztetések: ${failed}` : ''} • összes audit: ${total}`;
  }
  if (!a.lastAuditAt) return 'Audit még nem futott le. Nyomd meg az Audit futtatás gombot.';
  return `Audit lefutott, de van aktuális figyelmeztetés • hibák: ${failed} • összes: ${total}`;
}

function deletedTotalFromObject(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  const explicit = Number(obj.deletedTotal ?? obj.deleted_total);
  if (Number.isFinite(explicit)) return explicit;
  let total = 0;
  for (const [key, value] of Object.entries(obj)) {
    if ((/^deleted_/i.test(key) || /^deleted[A-Z]/.test(key)) && !/^deleted_?total$/i.test(key)) {
      const n = Number(value || 0);
      if (Number.isFinite(n)) total += n;
    }
  }
  return total;
}

function maintenanceDeletedTotal(m) {
  if (m.deletedTotal != null) return Number(m.deletedTotal || 0);
  const r = m.lastResult || m;
  let total = 0;
  total += deletedTotalFromObject(r.local?.deleted || {});
  const remoteRows = Array.isArray(r.remote?.result) ? r.remote.result : (r.remote?.result ? [r.remote.result] : []);
  for (const row of remoteRows) total += deletedTotalFromObject(row);
  return total;
}

function maintenanceCurrentClass(m) {
  const status = String(m.status || '');
  const complete = m.maintenanceComplete === true || m.sqlRetentionInstalled === true || m.lastResult?.maintenanceComplete === true || m.lastResult?.sqlRetentionInstalled === true;
  if (/retention-error|ERROR|FAILED/i.test(status)) return 'bad';
  if (!complete && (m.lastRunAt || m.lastResult)) return 'warn';
  if (/retention-warning|retention-partial|WARN|application-rest/i.test(status)) return 'warn';
  if (complete && (m.lastResult?.ok === true || /retention-ok|retention-fallback-ok|retention-emergency-ok/i.test(status))) return 'ok';
  if (/retention-active|disabled/i.test(status)) return 'warn';
  return m.lastError ? 'warn' : (complete ? 'ok' : 'warn');
}

function maintenanceCurrentText(m) {
  if (!m.lastRunAt && !m.lastResult) return 'Karbantartás aktív, de kézi futtatás még nem volt.';
  if (maintenanceCurrentClass(m) === 'ok') {
    const total = maintenanceDeletedTotal(m);
    return m.humanStatus || (total > 0
      ? `Karbantartás lefutott • törölt régi rekordok: ${total} • teljes trade journal megőrizve`
      : 'Karbantartás lefutott • nincs törlendő régi adat • teljes trade journal megőrizve');
  }
  return m.humanStatus || `Figyelmeztetés: ${m.lastError || m.status || 'ellenőrizd a részleteket'}`;
}

function supabaseAutoPanelSummary(h = {}, a = {}, m = {}) {
  const proof = h.proof || {};
  const proofOk = supabaseProofOk(h);
  const maintenanceOk = maintenanceCurrentClass(m) === 'ok' && !!(m.lastRunAt || m.lastResult) && (m.maintenanceComplete === true || m.sqlRetentionInstalled === true || m.lastResult?.maintenanceComplete === true || m.lastResult?.sqlRetentionInstalled === true);
  const auditOk = auditCurrentClass(a) === 'ok' && !!a.lastAuditAt;
  if (proofOk && maintenanceOk) {
    const full = supabaseFullCriticalProofOk(h);
    return {
      className: full ? 'ok' : 'warn',
      title: full ? 'Automatikus teljes proof + karbantartás OK' : 'Continuity proof + karbantartás OK, táblafallback aktív',
      detail: full
        ? `A három kritikus tábla bizonyított, az adatkarbantartás is lefutott. Utolsó proof: ${timeLabel(proof.lastProofAt || S.persistence?.lastProofAt)}. Utolsó karbantartás: ${timeLabel(m.lastRunAt)}.`
        : `A runtime checkpoint és a karbantartás működik, de külön táblafallback aktív: ${(h.fallbackTables || proof.fallbackTables || []).join(', ') || 'trade_journal, venue_configs'}.`
    };
  }
  if (proofOk) {
    const full = supabaseFullCriticalProofOk(h);
    return {
      className: full ? 'ok' : 'warn',
      title: full ? 'Automatikus teljes Supabase proof OK' : 'Automatikus continuity proof OK, táblafallback aktív',
      detail: full
        ? `A három kritikus tábla írható, olvasható és törölhető. Utolsó proof: ${timeLabel(proof.lastProofAt || S.persistence?.lastProofAt)}.`
        : `A runtime checkpoint működik; fallback: ${(h.fallbackTables || proof.fallbackTables || []).join(', ') || 'trade_journal, venue_configs'}. Utolsó proof: ${timeLabel(proof.lastProofAt || S.persistence?.lastProofAt)}.`
    };
  }
  if (auditOk || maintenanceOk) {
    return {
      className: maintenanceOk ? 'ok' : 'warn',
      title: maintenanceOk ? 'Automatikus karbantartás lefutott' : 'Automatikus audit lefutott',
      detail: maintenanceOk ? maintenanceCurrentText(m) : auditCurrentText(a)
    };
  }
  return null;
}

function manualPanelSummary(kind, result) {
  const h = result.health || S.supabaseHealth || {};
  const a = result.audit || S.supabaseAudit || {};
  const m = result.maintenance || result.maintenanceStatus || S.databaseMaintenance || {};
  if (kind === 'health') {
    const ok = !!(result.ok || result.health?.ok || supabaseConnectionOk(h));
    const schemaWarn = supabaseSchemaWarn(h);
    const configured = supabaseConfiguredNow(h);
    const missing = supabaseMissingTablesText(h);
    return {
      className: ok ? 'ok' : (schemaWarn || configured ? 'warn' : 'bad'),
      title: ok ? (h.fallbackActive ? 'Supabase continuity OK, táblafallback aktív' : 'Supabase kapcsolat OK') : (schemaWarn ? 'Supabase séma javítandó' : configured ? 'Supabase safe persistence módban' : 'Supabase ENV nincs beállítva'),
      detail: ok ? `${supabaseInventoryInfo(h, m).detail}. ${supabaseSqlRetentionInstalled(h, m) ? 'A SQL retention is telepítve.' : 'A kapcsolat működik, de a SQL retention RPC/DB cron még nincs telepítve.'}` : (schemaWarn ? `Ténylegesen hiányzó táblák: ${missing || 'ellenőrizd az infra/supabase_tools.sql / supabase_repair.sql szekció futtatását'}.` : `Kapcsolati gond: ${result.health?.lastError || result.reason || result.status || 'ismeretlen hiba'}`)
    };
  }
  if (kind === 'proof') {
    const ok = !!(result.ok || result.proof?.coreContinuityOk || result.health?.proof?.lastProofOk);
    const full = !!(result.fullCriticalOk || result.proof?.fullCriticalOk || supabaseFullCriticalProofOk(h));
    const fallback = !!(result.degraded || result.proof?.fallbackActive || h.fallbackActive);
    const schemaWarn = supabaseSchemaWarn(h);
    const missing = supabaseMissingTablesText(h);
    return {
      className: full ? 'ok' : (ok ? 'warn' : (schemaWarn ? 'warn' : 'bad')),
      title: full ? 'Teljes Supabase proof OK' : (ok && fallback ? 'Continuity proof OK, táblafallback aktív' : (schemaWarn ? 'Proof nem teljes — séma hiányzik' : 'Írás/olvasás proof hiba')),
      detail: full
        ? 'A backend külön próbasorral bizonyította a runtime_snapshots, trade_journal és venue_configs írását, visszaolvasását és törlését.'
        : (ok && fallback
            ? `A runtime checkpoint biztonságosan működik, de külön fallback aktív: ${(result.proof?.fallbackTables || h.fallbackTables || []).join(', ') || 'trade_journal, venue_configs'}. A friss verified trade-ek a kompakt checkpointban is megmaradnak.`
            : (schemaWarn ? `Előbb futtasd a Supabase SQL sémát. Hiányzó táblák: ${missing || 'ismeretlen'}.` : `Proof gond: ${result.reason || result.health?.proof?.lastError || result.status || 'ismeretlen hiba'}`))
    };
  }
  if (kind === 'audit') {
    const ok = !!result.ok;
    return {
      className: ok ? 'ok' : 'warn',
      title: ok ? 'Audit lefutott, kapcsolat + retention rendben' : 'Audit lefutott, figyelmeztetés van',
      detail: ok ? 'A Supabase REST, az írás/olvasás/törlés proof és a SQL retention is rendben van.' : (result.databaseReachable && result.readWriteProofOk && result.retentionWarning ? 'A Supabase adatbázis elérhető és írható/olvasható, de a SQL retention/pg_cron nincs telepítve. Ezért az audit helyesen sárga, nem zöld.' : `Audit figyelmeztetés: ${result.error || result.reason || result.status || 'nézd meg a technikai részleteket'}`)
    };
  }
  if (kind === 'maintenance' || kind === 'emergency') {
    if (result.accepted === true && result.background === true) {
      return {
        className: 'warn',
        title: 'Karbantartás elindult a háttérben',
        detail: result.detail || 'A Supabase takarítás a háttérben fut, miközben a kereskedési runtime folytatódik. A panel a következő állapotfrissítéskor mutatja a végleges eredményt.'
      };
    }
    const busy = result.busy || result.skipped === true && /maintenance_busy/i.test(String(result.error || result.status || result.reason || ''));
    if (busy) {
      return {
        className: 'warn',
        title: 'Karbantartás folyamatban — átmeneti állapot',
        detail: 'Nem indult párhuzamos futás. A meglévő karbantartás befejeződik a háttérben; friss snapshot után automatikusan zöld OK állapotra vált.'
      };
    }
    const ok = !!result.ok;
    const complete = result.maintenanceComplete === true || result.sqlRetentionInstalled === true;
    const cleanup = result.cleanupPerformed === true || result.remote?.cleanupPerformed === true || Number(result.deletedTotal || 0) > 0;
    const total = Number(result.deletedTotal ?? maintenanceDeletedTotal({ lastResult: result }));
    return {
      className: ok && complete ? 'ok' : (ok && cleanup ? 'warn' : 'warn'),
      title: ok && complete ? 'SQL adatkarbantartás + DB cron rendben' : (ok && cleanup ? 'Valódi REST takarítás lefutott — SQL cron még hiányzik' : (ok ? 'Karbantartási ellenőrzés lefutott — SQL retention telepítés kell' : 'Karbantartás figyelmeztetés')),
      detail: ok ? (result.humanStatus || (complete ? (total > 0 ? `Törölt/tömörített régi rekordok: ${total}.` : 'A teljes retention lefutott; nincs törlendő régi adat.') : `Az alkalmazás REST takarítása ${total > 0 ? `${total} rekordot törölt` : 'nem talált törölhető rekordot'}, de a DB-oldali cronhoz futtasd az infra/supabase_tools.sql fájl supabase_repair.sql szekcióját.`)) : `Karbantartási gond: ${result.error || result.remote?.error || result.remote?.rpcError || 'ellenőrizd a technikai részleteket'}`
    };
  }
  return { className: result.ok ? 'ok' : 'warn', title: result.status || (result.ok ? 'OK' : 'WARN'), detail: shortJson(result) };
}


function supabaseMaintenanceBusyPanelStale(result, m = {}) {
  if (!result) return false;
  const blob = [result.status, result.error, result.reason, result.message, result._panel?.title, result._panel?.detail, result.endpoint].filter(Boolean).join(' ');
  const looksBusyMaintenance = result.busy === true || result.skipped === true || /Karbantartás már folyamatban|maintenance_busy|maintenance\/run/i.test(blob);
  const finalOk = maintenanceCurrentClass(m) === 'ok' && !!(m.lastRunAt || m.lastResult || /OK|lefutott|fallback/i.test(String(m.humanStatus || m.status || '')));
  return looksBusyMaintenance && finalOk;
}

function supabaseMaintenanceFinalPanel(m = {}) {
  const complete = supabaseSqlRetentionInstalled(S.supabaseHealth || {}, m);
  return {
    className: complete ? 'ok' : 'warn',
    title: complete ? 'SQL karbantartás befejeződött' : 'REST karbantartás befejeződött — SQL cron még hiányzik',
    detail: maintenanceCurrentText(m) + (complete ? '. A DB-oldali retention telepítve van.' : '. A program eléri az adatbázist és REST-en takarít, de az infra/supabase_tools.sql / supabase_repair.sql szekció futtatása kell a Supabase-oldali RPC/pg_cron telepítéséhez.')
  };
}

function supabaseHealthHttpWarningResolved(result, h = {}) {
  if (!result) return false;
  const blob = [result.status, result.error, result.reason, result.message, result._panel?.title, result._panel?.detail, result.endpoint].filter(Boolean).join(' ');
  const looksHealthWarning = /database\/health|Supabase kapcsolat ellenőrzés|HTTP hiba/i.test(blob);
  if (!looksHealthWarning) return false;
  return supabaseProofOk(h) || supabaseConnectionOk(h) || h.restOk === true || h.ok === true;
}

function supabaseHealthHttpFallbackPanel(h = {}) {
  const proof = h.proof || {};
  const proofOk = supabaseProofOk(h);
  return {
    className: proofOk ? 'ok' : 'warn',
    title: proofOk ? 'Supabase kapcsolat proof alapján OK' : 'Supabase kapcsolat ellenőrizendő — korábbi proof elérhető',
    detail: proofOk
      ? `A kézi kapcsolat endpoint átmeneti HTTP választ adott, de az aktuális írás/olvasás proof OK. Utolsó proof: ${timeLabel(proof.lastProofAt || S.persistence?.lastProofAt)}. Ez nem adatvesztés és nem blokkolja a botot.`
      : 'A kézi kapcsolat endpoint átmeneti HTTP választ adott. Ha az írás/olvasás proof zöld, ez csak panel-szintű figyelmeztetés; futtasd az írás/olvasás proofot, ha sárga állapot marad.'
  };
}


function supabaseBusyPanelResolved(result, h = {}, a = {}, m = {}) {
  if (!result) return null;
  const blob = [result.status, result.error, result.reason, result.message, result._panel?.title, result._panel?.detail, result.endpoint].filter(Boolean).join(' ');
  if (!/folyamatban|futtatás/i.test(blob)) return null;
  if (/audit/i.test(blob) && a.lastAuditAt) {
    return { className: auditCurrentClass(a), title: auditCurrentClass(a) === 'ok' ? 'Supabase audit lefutott' : 'Supabase audit lefutott — figyelmeztetés', detail: auditCurrentText(a) };
  }
  if (/proof|írás|olvasás/i.test(blob) && supabaseProofOk(h)) {
    return { className: 'ok', title: 'Írás/olvasás proof OK', detail: `A proof befejeződött és zöld. Utolsó proof: ${timeLabel((h.proof || {}).lastProofAt || S.persistence?.lastProofAt)}.` };
  }
  if (/karbantart|maintenance/i.test(blob) && maintenanceCurrentClass(m) === 'ok' && (m.lastRunAt || m.lastResult)) {
    return supabaseMaintenanceFinalPanel(m);
  }
  if (/kapcsolat|health/i.test(blob) && supabaseConnectionOk(h)) {
    return supabaseHealthHttpFallbackPanel(h);
  }
  return null;
}


function supabaseInventoryInfo(h = {}, m = {}) {
  const inv = h.databaseInventory || m.databaseInventory || m.inventoryAfter || m.lastResult?.databaseInventory || m.lastResult?.remote?.inventoryAfter || null;
  const fullCritical = supabaseFullCriticalProofOk(h);
  const fallbackActive = !fullCritical && (h.fallbackActive === true || h.proof?.fallbackActive === true || inv?.coreFallbackActive === true);
  const fallbackTables = Array.from(new Set([...(h.fallbackTables || []), ...(h.proof?.fallbackTables || [])]));
  if (!inv || typeof inv !== 'object') {
    if (fallbackActive) return { known: true, className: 'warn', label: 'Supabase continuity működik, táblafallback aktív', detail: `A runtime checkpoint írható/olvasható. Fallback táblák: ${fallbackTables.join(', ') || 'trade_journal, venue_configs'}.` };
    return { known: false, className: 'warn', label: 'Adatbázis tartalom még nincs felmérve', detail: 'A következő Supabase kapcsolat- vagy karbantartás-ellenőrzés megmutatja az elérhető táblákat és a sorok számát.' };
  }
  const reachable = Number(inv.reachableTables || 0);
  const checked = Number(inv.checkedTables || 0);
  const knownRows = Number(inv.knownRows || 0);
  const failed = Array.isArray(inv.failed) ? inv.failed : [];
  const missing = Array.isArray(inv.missingTables) ? inv.missingTables : [];
  const permission = Array.isArray(inv.permissionDeniedTables) ? inv.permissionDeniedTables : (Array.isArray(h.inaccessibleTables) ? h.inaccessibleTables : []);
  const transient = Array.isArray(inv.transientTables) ? inv.transientTables : (Array.isArray(h.transientTables) ? h.transientTables : []);
  const largest = Array.isArray(inv.largest) ? inv.largest : [];
  const continuityEvidenceOk = inv.continuityEvidenceOk === true || fullCritical || fallbackActive;
  const measurementDegraded = inv.measurementDegraded === true && continuityEvidenceOk;
  const cls = missing.length ? 'bad' : ((permission.length || transient.length || failed.length || fallbackActive || measurementDegraded) ? 'warn' : (reachable > 0 ? 'ok' : 'warn'));
  const largestText = largest.length ? ` • legtöbb sor: ${largest.slice(0, 3).map(x => `${x.table}: ${Number(x.rowCount || 0).toLocaleString('hu-HU')}`).join(', ')}` : '';
  const labels = [];
  if (missing.length) labels.push(`hiányzik: ${missing.join(', ')}`);
  if (permission.length) labels.push(`engedély/RLS: ${permission.join(', ')}`);
  if (transient.length) labels.push(`átmeneti hiba: ${transient.join(', ')}`);
  if (failed.length) labels.push(`egyéb hiba: ${failed.map(x => x.table).join(', ')}`);
  if (fallbackActive) labels.push(`checkpoint fallback: ${fallbackTables.join(', ') || 'aktív'}`);
  return {
    known: true,
    className: cls,
    label: missing.length ? 'Supabase táblák ténylegesen hiányoznak' : (measurementDegraded ? 'Supabase inventory mérés átmenetileg korlátozott — persistence proof él' : (fallbackActive ? 'Supabase continuity működik, táblafallback aktív' : (reachable > 0 ? 'Supabase táblák ténylegesen elérhetők' : 'Supabase inventory részlegesen mérhető'))),
    detail: measurementDegraded
      ? `A közvetlen inventory lekérdezés most 0/${checked || 0} táblát tudott megszámolni, de friss runtime/persistence proof igazolja a tárolás folytonosságát. Ez mérési degradáció, nem automatikusan sémahiány.${labels.length ? ` • ${labels.join(' • ')}` : ''}`
      : `${reachable}/${checked || reachable} tábla közvetlenül elérhető • ismert sorok: ${knownRows.toLocaleString('hu-HU')}${largestText}${labels.length ? ` • ${labels.join(' • ')}` : ''}`
  };
}

function supabaseRetentionInstallInfo(h = {}, m = {}) {
  const installed = supabaseSqlRetentionInstalled(h, m);
  const cleanup = m.cleanupPerformed === true || m.applicationRestCleanup === true || m.lastResult?.cleanupPerformed === true || m.lastResult?.applicationRestCleanup === true;
  return {
    className: installed ? 'ok' : (cleanup ? 'warn' : 'bad'),
    label: installed ? 'SQL retention + DB cron telepítve' : (cleanup ? 'REST takarítás működik, DB cron hiányzik' : 'SQL retention nincs telepítve'),
    detail: installed
      ? 'A valódi Supabase RPC-k és az adatbázison belüli retention elérhetők.'
      : (cleanup
          ? 'A program ténylegesen tudott régi rekordokat törölni REST-en keresztül, de cloud újraindításakor csak a Supabase-oldali SQL/pg_cron biztosít folyamatos takarítást.'
          : 'A videón látható PGRST202 azt jelenti, hogy a run_nexus_* karbantartási RPC nincs telepítve. Futtasd az infra/supabase_tools.sql fájl supabase_repair.sql szekcióját a Supabase SQL Editorban.')
  };
}

function supabaseUsageInfo(h = {}, m = {}) {
  const raw = h.databaseUsage || m.databaseUsage || m.lastResult?.databaseUsage || null;
  if (!raw || typeof raw !== 'object') return { known: false, className: 'warn', label: 'Adatbázis méret még nincs mérve', detail: 'A méretméréshez futtasd egyszer az egységes infra/supabase_tools.sql fájl supabase_repair.sql szekcióját, majd a Supabase kapcsolat ellenőrzést.' };
  const bytes = Number(raw.databaseBytes || raw.database_bytes || 0);
  const quotaBytes = Number(raw.quotaBytes || raw.quota_bytes || (500 * 1024 * 1024));
  const pct = Number(raw.quotaPercent ?? raw.quota_percent ?? (bytes > 0 && quotaBytes > 0 ? bytes / quotaBytes * 100 : 0));
  const pretty = raw.databasePretty || raw.database_pretty || (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '-');
  const readOnly = !!(h.readOnlyDetected || h.quotaRestricted || raw.readOnlyDetected || raw.quotaRestricted);
  const near = readOnly || pct >= 85;
  return {
    known: bytes > 0,
    className: readOnly || pct >= 100 ? 'bad' : (near ? 'warn' : 'ok'),
    label: readOnly ? 'Kvóta/read-only védelem aktív' : (pct >= 100 ? 'Adatbázis kvóta felett' : (near ? 'Adatbázis közel a kvótához' : 'Adatbázis méret rendben')),
    detail: `${pretty}${pct > 0 ? ` • becsült kvótahasználat: ${pct.toFixed(1)}%` : ''}${raw.topTables?.length ? ` • legnagyobb: ${raw.topTables.slice(0, 3).map(x => `${x.table || x.relname}: ${x.totalPretty || x.total_pretty || '-'}`).join(', ')}` : ''}`
  };
}

function supabaseReadOnlyHint(h = {}) {
  if (!(h.readOnlyDetected || h.quotaRestricted || /READ_ONLY|QUOTA|402/i.test(String(h.status || h.lastError || '')))) return '';
  return `<div class="supabaseResult check bad"><b>Supabase kvóta / read-only mód észlelve</b><small>A REST olvasás még működhet, de az írás és a törlés blokkolódhat. Először futtasd a ZIP <b>infra/supabase_tools.sql</b> fájl <b>supabase_emergency_compact_v199_158.sql</b> szekcióját a Supabase SQL Editorban. Ez egyetlen trade journal sort sem töröl, viszont gyorsan felszabadítja a túlméretes AI/capital/event telemetria nagy részét. Ha a projekt újra írható, opcionálisan futtasd az <b>infra/supabase_tools.sql</b> fájl <b>supabase_trade_journal_compact_v199_158.sql</b> szekcióját, majd az <b>infra/supabase_tools.sql</b> <b>(supabase_repair.sql szekció)</b> telepíti a tartós retentiont/pg_cront.</small></div>`;
}

function renderSupabaseCheck() {
  const box = $('#supabaseCheck');
  if (!box) return;
  const h = S.supabaseHealth || {};
  const a = S.supabaseAudit || {};
  const m = S.databaseMaintenance || {};
  const proof = h.proof || {};
  const configured = supabaseConfiguredNow(h);
  const overallCls = supabaseOverallClass();
  const manualHealthOk = !!(lastSupabasePanelResult?._panel?.title && /Supabase kapcsolat OK|proof alapján OK/i.test(String(lastSupabasePanelResult._panel.title))) || !!(lastSupabasePanelResult?.ok === true && /database\/health|Supabase kapcsolat/i.test(String(lastSupabasePanelResult?.endpoint || lastSupabasePanelResult?.status || '')));
  const manualProofOk = !!(lastSupabasePanelResult?._panel?.title && /Írás\/olvasás proof OK|Teljes Supabase proof OK|Continuity proof OK/i.test(String(lastSupabasePanelResult._panel.title))) || !!(lastSupabasePanelResult?.ok === true && /database\/proof|Írás\/olvasás/i.test(String(lastSupabasePanelResult?.endpoint || lastSupabasePanelResult?.status || '')));
  const schemaWarn = supabaseSchemaWarn(h);
  const proofOk = supabaseProofOk(h) || manualProofOk;
  const fullProofOk = supabaseFullCriticalProofOk(h);
  const proofFallback = h.fallbackActive === true || proof.fallbackActive === true;
  const effectiveConnectionOk = supabaseConnectionOk(h) || h.restOk === true || manualHealthOk;
  const healthCls = effectiveConnectionOk ? 'ok' : (configured && proofOk ? 'warn' : 'bad');
  const effectiveSafeMode = (proofOk && effectiveConnectionOk && !schemaWarn) ? false : !!h.safeMode;
  const healthIcon = healthCls === 'ok' ? '✓' : (healthCls === 'warn' ? '!' : '×');
  const proofBlockedBySchema = schemaWarn && supabaseRuntimeSnapshotMissing(h) && !proofOk;
  const proofCls = fullProofOk ? 'ok' : (proofOk ? 'warn' : (proofBlockedBySchema ? 'warn' : (configured ? 'warn' : 'bad')));
  const auditCls = auditCurrentClass(a);
  const maintenanceCls = maintenanceCurrentClass(m);
  const maintenanceBusyResolved = supabaseMaintenanceBusyPanelStale(lastSupabasePanelResult, m);
  const autoPanel = (lastSupabasePanelResult && !maintenanceBusyResolved) ? null : supabaseAutoPanelSummary(h, a, m);
  const resolvedMaintenancePanel = maintenanceBusyResolved ? supabaseMaintenanceFinalPanel(m) : null;
  const healthHttpResolved = supabaseHealthHttpWarningResolved(lastSupabasePanelResult, h);
  const resolvedHealthPanel = healthHttpResolved ? supabaseHealthHttpFallbackPanel(h) : null;
  const resolvedBusyPanel = supabaseBusyPanelResolved(lastSupabasePanelResult, h, a, m);
  const latestPanel = resolvedMaintenancePanel || resolvedHealthPanel || resolvedBusyPanel || lastSupabasePanelResult?._panel || autoPanel || null;
  const latestStatus = latestPanel?.title || lastSupabasePanelResult?.status || lastSupabasePanelResult?.audit?.status || lastSupabasePanelResult?.maintenance?.status || null;
  const latestClass = latestPanel?.className || (lastSupabasePanelResult?.ok === false ? 'bad' : (lastSupabasePanelResult?.ok === true ? 'ok' : 'warn'));
  const usage = supabaseUsageInfo(h, m);
  const inventory = supabaseInventoryInfo(h, m);
  const retentionInstall = supabaseRetentionInstallInfo(h, m);
  const latestDetail = latestPanel?.detail || (lastSupabasePanelResult ? compactPanelText(lastSupabasePanelResult.humanStatus || lastSupabasePanelResult.message || lastSupabasePanelResult.error || lastSupabasePanelResult.status || 'Ellenőrzés lefutott, részletek nem szükségesek.', 3) : 'Automatikus ellenőrzés még nem adott teljes eredményt. Kézi ellenőrzés csak akkor kell, ha itt sárga/piros állapot marad.');
  const schemaHint = schemaWarn ? `<div class="supabaseResult check warn schemaRepairBox"><b>Supabase SQL séma javítás kell</b><small>Hiányzó/hibás táblák: ${escapeHtml(supabaseMissingTablesText(h) || 'ellenőrizd a táblákat')}. Ez nem trading-motor hiba. Futtasd a ZIP-ben lévő <b>${escapeHtml(h.schemaRepairSqlFile || 'infra/supabase_tools.sql')}</b> tartalmát a Supabase SQL Editorban, majd Railway-en redeploy/restart vagy Supabase kapcsolat újraellenőrzés.</small></div>` : '';
  box.innerHTML = `
    <div class="supabaseHeader">
      <div><h4>Supabase ellenőrzés</h4><small>A zöld kapcsolat és zöld proof azt jelenti, hogy a Supabase tényleg írható és olvasható. A régi audit hibaszám csak előzmény, nem rontja le az aktuális állapotot.</small></div>
      <span class="badge ${overallCls}">${escapeHtml(supabaseOverallLabel())}</span>
    </div>
    <div class="supabaseGrid">
      <div class="check ${healthCls}"><b>${healthIcon} Kapcsolat / REST</b><small>beállítva: ${boolLabel(configured)} • REST: ${effectiveConnectionOk ? 'igen' : boolLabel(h.restOk)} • safe mode: ${effectiveSafeMode ? 'igen' : 'nem'} • ${manualHealthOk ? 'kézi kapcsolat proof OK, snapshot frissítésre vár' : escapeHtml(supabaseHealthStatusText(h))}</small></div>
      <div class="check ${proofCls}"><b>${fullProofOk ? '✓' : '!'} Kritikus táblák írás/olvasás/törlés proof</b><small>${fullProofOk ? 'OK: runtime_snapshots + trade_journal + venue_configs külön bizonyítva' : (proofOk && proofFallback ? `Continuity OK, fallback aktív: ${(h.fallbackTables || proof.fallbackTables || []).join(', ') || 'trade_journal, venue_configs'}` : (proofBlockedBySchema ? 'A runtime_snapshots tábla hiányzik — SQL séma javítás kell' : 'Még nincs teljes háromtáblás proof'))} • utolsó: ${timeLabel(proof.lastProofAt || S.persistence?.lastProofAt)} • checkpoint írás: ${boolLabel(proof.writeOk)} • olvasás: ${boolLabel(proof.readOk)} • törlés: ${boolLabel(proof.deleteOk ?? S.persistence?.lastProofCleanupOk)}</small></div>
      <div class="check ${auditCls}"><b>${auditCls === 'ok' ? '✓' : '!'} Audit napló</b><small>${escapeHtml(auditCurrentText(a))} • utolsó: ${timeLabel(a.lastAuditAt)}</small></div>
      <div class="check ${maintenanceCls}"><b>${maintenanceCls === 'ok' ? '✓' : '!'} Adatkarbantartás</b><small>${escapeHtml(maintenanceCurrentText(m))} • utolsó: ${timeLabel(m.lastRunAt)}</small></div>
      <div class="check ${inventory.className}"><b>${inventory.className === 'ok' ? '✓' : inventory.className === 'bad' ? '×' : '!'} ${escapeHtml(inventory.label)}</b><small>${escapeHtml(inventory.detail)}</small></div>
      <div class="check ${retentionInstall.className}"><b>${retentionInstall.className === 'ok' ? '✓' : retentionInstall.className === 'bad' ? '×' : '!'} ${escapeHtml(retentionInstall.label)}</b><small>${escapeHtml(retentionInstall.detail)}</small></div>
      <div class="check ${usage.className}"><b>${usage.className === 'ok' ? '✓' : usage.className === 'bad' ? '×' : '!'} ${escapeHtml(usage.label)}</b><small>${escapeHtml(usage.detail)}</small></div>
    </div>
    <div class="actions supabaseActions">
      <button data-supabase-check="health">Supabase kapcsolat</button>
      <button data-supabase-check="proof" class="primary">${proofBlockedBySchema ? 'SQL séma kell a proofhoz' : 'Írás/olvasás proof'}</button>
      <button data-supabase-check="audit">Audit futtatás</button>
      <button data-supabase-check="maintenance">Karbantartás futtatás</button>
      <button data-supabase-check="emergency" class="danger">Vészhelyzeti DB takarítás</button>
    </div>
    ${schemaHint}
    ${supabaseReadOnlyHint(h)}
    <div class="supabaseResult check ${latestClass}"><b>Legutóbbi Supabase ellenőrzés: ${escapeHtml(compactLiveUiText(latestStatus || (proofBlockedBySchema ? 'SQL séma javítás szükséges' : 'még nem futott')))}</b><small>${supabasePanelBusy && !proofBlockedBySchema && !latestPanel ? 'Futtatás folyamatban...' : escapeHtml(compactPanelText(proofBlockedBySchema && !latestPanel ? 'Előbb futtasd a Supabase SQL javítást; amíg a runtime_snapshots tábla hiányzik, az írás/olvasás proof nem tud sikeres lenni.' : latestDetail, 3))}</small></div>
  `;
}

async function runSupabasePanelCheck(kind) {
  const endpoints = {
    health: '/api/database/health',
    proof: '/api/database/proof',
    audit: '/api/database/audit/run',
    maintenance: '/api/database/maintenance/run',
    emergency: '/api/database/maintenance/emergency'
  };
  const labels = {
    health: 'Supabase kapcsolat ellenőrzés',
    proof: 'Supabase írás/olvasás proof',
    audit: 'Supabase audit futtatás',
    maintenance: 'Supabase adatkarbantartás',
    emergency: 'Supabase vészhelyzeti adatbázis-takarítás'
  };
  const endpoint = endpoints[kind];
  if (!endpoint || supabasePanelBusy) return;
  if (kind === 'emergency' && !window.confirm('A vészhelyzeti takarítás csak régi, újragenerálható Supabase naplókat és snapshotokat töröl. A teljes trade journal és a venue konfiguráció megmarad. Folytatod?')) return;
  if (kind === 'proof' && supabaseRuntimeSnapshotMissing(S.supabaseHealth || {}) && !supabaseProofOk(S.supabaseHealth || {})) {
    const missing = supabaseMissingTablesText(S.supabaseHealth || {}) || 'runtime_snapshots';
    const file = S.supabaseHealth?.schemaRepairSqlFile || 'infra/supabase_tools.sql';
    lastSupabasePanelResult = {
      ok: false,
      schemaMissing: true,
      status: 'Írás/olvasás proof nem indítható — SQL séma javítás kell',
      endpoint,
      _panel: {
        className: 'warn',
        title: 'Írás/olvasás proof blokkolva — SQL séma javítás kell',
        detail: `Hiányzó/hibás táblák: ${missing}. Futtasd a ZIP-ben lévő ${file} tartalmát a Supabase SQL Editorban. A bot addig safe local/outbox persistence módban fut tovább.`
      }
    };
    renderSupabaseCheck();
    toast('Supabase proof: előbb SQL séma javítás kell');
    return;
  }
  supabasePanelBusy = true;
  lastSupabasePanelResult = { ok: null, status: labels[kind] + ' folyamatban', endpoint };
  renderSupabaseCheck();
  try {
    const timeoutMs = kind === 'proof' ? 22000 : ((kind === 'maintenance' || kind === 'emergency') ? 50000 : 16000);
    const result = await fetchJsonWithTimeout(endpoint, timeoutMs);
    const panel = manualPanelSummary(kind, result);
    lastSupabasePanelResult = { ...result, _panel: panel };
    toast(labels[kind] + ': ' + panel.title);
    supabasePanelBusy = false;
    renderSupabaseCheck();
    await refresh();
    if (kind === 'maintenance' && result.accepted === true) {
      window.setTimeout(() => refresh().catch(() => renderSupabaseCheck()), 5000);
      window.setTimeout(() => refresh().catch(() => renderSupabaseCheck()), 15000);
    }
  } catch (error) {
    const message = error.message || String(error);
    if (kind === 'maintenance' && /maintenance_busy/i.test(message)) {
      lastSupabasePanelResult = { ok: true, busy: true, skipped: true, status: 'Karbantartás már folyamatban', _panel: { className: 'warn', title: 'Karbantartás folyamatban — átmeneti állapot', detail: 'Nem indult párhuzamos futás. A meglévő karbantartás befejeződik a háttérben; friss snapshot után automatikusan zöld OK állapotra vált.' }, endpoint };
      toast('Karbantartás már folyamatban');
    } else if (kind === 'health' && supabaseHealthHttpWarningResolved({ status: labels[kind] + ' figyelmeztetés', error: message, endpoint }, S.supabaseHealth || {})) {
      const panel = supabaseHealthHttpFallbackPanel(S.supabaseHealth || {});
      lastSupabasePanelResult = { ok: true, status: panel.title, error: message, endpoint, recoveredByProof: true, _panel: panel };
      toast('Supabase kapcsolat: proof alapján OK');
    } else if (kind === 'proof' && supabaseSchemaWarn(S.supabaseHealth || {})) {
      const missing = supabaseMissingTablesText(S.supabaseHealth || {}) || 'runtime_snapshots, trade_journal';
      lastSupabasePanelResult = {
        ok: false,
        schemaMissing: true,
        status: 'Írás/olvasás proof nem teljes — séma javítás kell',
        error: message,
        endpoint,
        _panel: {
          className: 'warn',
          title: 'Írás/olvasás proof nem teljes — Supabase séma javítás kell',
          detail: `A kapcsolat él, de hiányzó/hibás táblák miatt a proof nem tud végigfutni: ${missing}. Ez nem trading-motor hiba; futtasd az infra/supabase_tools.sql fájl supabase_repair.sql szekcióját a Supabase SQL Editorban.`
        }
      };
      toast('Supabase proof: séma javítás kell');
    } else {
      lastSupabasePanelResult = { ok: false, status: labels[kind] + ' figyelmeztetés', error: message, endpoint, _panel: { className: 'warn', title: labels[kind] + ' figyelmeztetés', detail: message } };
      toast('Supabase ellenőrzési figyelmeztetés: ' + message);
    }
    supabasePanelBusy = false;
    await refresh().catch(() => renderSupabaseCheck());
  } finally {
    supabasePanelBusy = false;
    renderSupabaseCheck();
  }
}

function percentLabel(value) {
  const n = Number(value || 0);
  return Math.max(0, Math.min(100, Math.round(n))) + '%';
}

function conditionIcon(ok) {
  return ok ? '✓' : '!';
}

function conditionClass(ok, severity = 'warning') {
  if (ok) return 'ok';
  return severity === 'blocker' || severity === 'critical' ? 'bad' : 'warn';
}

function conditionsHtml(conditions) {
  const rows = Array.isArray(conditions) ? conditions : [];
  if (!rows.length) return '<div class="condition empty">Nincs részletes feltétel adat.</div>';
  return rows.map(c => {
    const ok = c.displayOk ?? c.ok;
    const severity = c.displaySeverity || c.severity;
    const detail = c.displayDetail || c.detail || '';
    return `<div class="condition ${conditionClass(ok, severity)}"><b>${conditionIcon(ok)} ${escapeHtml(cleanStatusLabel(c.label || c.key || '-'))}</b><small>${escapeHtml(compactLiveUiText(detail))}</small></div>`;
  }).join('');
}

function missingText(list, fallback) {
  const arr = Array.isArray(list) ? list.filter(Boolean) : [];
  return arr.length ? arr.map(x => '• ' + x).join('\n') : fallback;
}

function progressBar(value) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value || 0))));
  return `<div class="progress"><span style="width:${pct}%"></span></div>`;
}


function livePrivateAuthPanelState(lpa = {}) {
  const status = String(lpa.status || '');
  const checkRan = !!lpa.checkRan || !!lpa.lastRunAt || (status && status !== 'LIVE_PRIVATE_AUTH_NOT_RUN' && status !== 'not-run');
  const readEnabled = !!(lpa.realPrivateReadEnabled ?? lpa.livePrivateReadEnabled);
  const accountRead = !!(lpa.accountReadProofOk ?? lpa.realAccountReadProofOk);
  const tradingChecked = !!lpa.tradingPermissionChecked;
  const liveSubmitBlocked = lpa.realSubmitBlocked !== false;
  const ok = !!lpa.ok;
  const safelySkipped = !!lpa.safelySkipped || (checkRan && !readEnabled) || status === 'LIVE_PRIVATE_READ_SAFELY_SKIPPED';
  const cls = ok ? 'ok' : safelySkipped ? 'warn' : (checkRan ? 'warn' : 'bad');
  const title = ok
    ? 'Live private read/account proof lefutott'
    : safelySkipped
      ? 'Live private read nincs engedélyezve'
      : checkRan
        ? 'Live olvasási proof ellenőrizve, de még nem teljes'
        : 'Live olvasási proof nem futott le';
  const detail = lpa.detail || (safelySkipped
    ? 'Biztonságosan kihagyva: NEXUS_LIVE_PRIVATE_READ=true nincs beállítva. Account/balance read proof nem futott le. Valódi live submit továbbra is tiltva.'
    : 'Nyomd meg a Live olvasási proof gombot. Ez csak olvasási ellenőrzés, ordert nem küld.');
  const accountReadText = accountRead ? 'lefutott' : (safelySkipped ? 'biztonságosan kihagyva' : 'nem futott le');
  const tradingText = tradingChecked ? 'ellenőrizve' : (safelySkipped ? 'nem ellenőrizhető' : 'nem futott le');
  const rows = [
    `${checkRan ? '✓' : '×'} Live olvasási gomb: ${checkRan ? 'lefutott' : 'nem futott le'}`,
    `${readEnabled ? '✓' : '!'} Live private read: ${readEnabled ? 'engedélyezve' : 'nincs engedélyezve'}`,
    `${accountRead ? '✓' : safelySkipped ? '!' : '×'} Account/balance read proof: ${accountReadText}`,
    `${tradingChecked ? '✓' : safelySkipped ? '!' : '×'} Trading permission: ${tradingText}`,
    `${liveSubmitBlocked ? '✓' : '!'} Valódi live submit: ${liveSubmitBlocked ? 'továbbra is tiltva' : 'engedélyezve - kézi ellenőrzés szükséges'}`
  ];
  return { ok, cls, title, detail, rows, safelySkipped, checkRan, readEnabled, accountRead, tradingChecked, liveSubmitBlocked };
}


function liveReadonlyProofPersistencePanelState(p = {}) {
  const status = String(p.status || '');
  const ok = !!p.ok || !!p.completeOk || status === 'LIVE_READONLY_PROOF_PERSISTED_OK' || status === 'LIVE_READONLY_PROOF_REHYDRATED_OK';
  const partialOk = !!p.partialOk || (!!(p.lastOkAt || p.lastProofAt) && !ok);
  const proofAt = p.proofAt || p.lastOkAt || p.lastProofAt || null;
  const localOk = p.localStateStatus === 'OK' || !!p.localStateOk;
  const supaOk = p.supabaseEventStatus === 'OK' || p.lastSupabaseWriteOk === true || p.supabaseEventOk === true || status === 'LIVE_READONLY_PROOF_REHYDRATED_OK';
  const snapshotOk = p.runtimeSnapshotStatus === 'OK' || p.runtimeSnapshotOk === true || status === 'LIVE_READONLY_PROOF_REHYDRATED_OK';
  const rehydrated = p.rehydrateStatus === 'REHYDRATED' || !!p.lastHydratedAt || status === 'LIVE_READONLY_PROOF_REHYDRATED_OK';
  const cls = ok ? 'ok' : (partialOk ? 'warn' : 'bad');
  const title = p.statusLabel || (ok ? 'Live olvasási proof mentés teljesen OK' : partialOk ? 'Live olvasási proof mentés részben OK — nem live hiba' : 'Olvasási proof mentés még nincs');
  const detail = p.summary || (ok
    ? 'Helyi state, Supabase event_journal és runtime_snapshot mentés OK.'
    : partialOk
      ? 'Van proof előzmény. Egy Supabase mentési komponens még ellenőrizendő, de ez nem trade-vesztés és nem indít live módot.'
      : 'Futtasd a Live olvasási proofot sikeres live account read után.');
  const checks = Array.isArray(p.checks) ? p.checks : [];
  const rows = checks.length ? checks.map(c => `${c.ok ? '✓' : c.level === 'info' ? '•' : '!'} ${c.name}: ${c.detail || (c.ok ? 'OK' : 'ellenőrizendő')}`) : [
    `${localOk ? '✓' : '×'} Helyi state mentés: ${localOk ? 'OK' : (proofAt ? 'hiányzik / ellenőrizendő' : 'nincs proof előzmény')}`,
    `${supaOk ? '✓' : '!'} Supabase event_journal mentés: ${supaOk ? 'OK' : (p.lastSupabaseWriteError || 'hiányzik / ellenőrizendő')}`,
    `${snapshotOk ? '✓' : '!'} Supabase runtime_snapshot mentés: ${snapshotOk ? 'OK' : (p.lastSupabaseWriteError || 'hiányzik / ellenőrizendő')}`,
    `${rehydrated ? '✓' : '•'} Restart utáni visszaállítás: ${rehydrated ? 'igen' : 'még nem történt restart/rehydrate proof'}`,
    `Utolsó sikeres account read: ${timeLabel(proofAt)}`,
    `Venue: ${escapeHtml(p.lastSuccessfulVenue || '-')}`,
    `Valódi live submit: ${p.liveSubmitBlocked === false ? 'FIGYELEM: nem blokkolt' : 'továbbra is tiltva'}`
  ];
  if (!checks.length) {
    rows.splice(4, 0, `Utolsó mentés státusz check: ${timeLabel(p.lastStatusCheckAt)}`);
  } else {
    rows.push(`Utolsó sikeres account read: ${timeLabel(proofAt)}`);
    rows.push(`Venue: ${escapeHtml(p.lastSuccessfulVenue || '-')}`);
  }
  return { ok, partialOk, cls, title, detail, rows };
}


function liveRehydrateVerificationPanelState(v = {}) {
  const status = String(v.status || '');
  const ok = !!v.ok || status === 'RESTART_REHYDRATE_LIVE_PROOF_OK';
  const partialOk = !!v.partialOk || status === 'RESTART_REHYDRATE_LIVE_PROOF_PARTIAL';
  const cls = ok ? 'ok' : 'bad';
  const title = v.statusLabel || (ok ? 'Restart utáni live proof OK' : partialOk ? 'Restart utáni live proof részben OK' : 'Restart proof visszaállítás még nem bizonyított');
  const detail = v.summary || (ok
    ? 'Restart/redeploy után visszatöltődött a live olvasási proof, és a live submit továbbra is tiltva maradt.'
    : 'Restart vagy redeploy után nyomd meg az ellenőrző gombot, hogy látszódjon a visszatöltés bizonyítása.');
  const checks = Array.isArray(v.checks) ? v.checks : [];
  const rows = checks.length ? checks.map(c => `${c.ok ? '✓' : c.level === 'info' ? '•' : '!'} ${c.name}: ${c.detail || (c.ok ? 'OK' : 'ellenőrizendő')}`) : [
    `${v.restartDetected ? '✓' : '•'} Szerver restart/redeploy érzékelve: ${v.restartDetected ? 'igen' : 'még nincs előző manifest'}`,
    `${v.proofRecovered ? '✓' : '×'} Live olvasási proof visszatöltve: ${v.proofRecovered ? 'igen' : 'nem'}`,
    `${v.localStateRecovered ? '✓' : '×'} Helyi state rehydrate: ${v.localStateRecovered ? 'OK' : 'ellenőrizendő'}`,
    `${v.supabaseEventRecovered ? '✓' : '!'} Supabase event_journal rehydrate: ${v.supabaseEventRecovered ? 'OK' : 'ellenőrizendő'}`,
    `${v.runtimeSnapshotRecovered ? '✓' : '!'} Supabase runtime_snapshot rehydrate: ${v.runtimeSnapshotRecovered ? 'OK' : 'ellenőrizendő'}`,
    `${v.liveSubmitBlocked !== false ? '✓' : '!'} Valódi live submit: ${v.liveSubmitBlocked === false ? 'FIGYELEM: nem blokkolt' : 'továbbra is tiltva'}`,
    `Utolsó live account read: ${timeLabel(v.proofAt)}`,
    `Venue: ${escapeHtml(v.venue || '-')}`
  ];
  rows.push(`Előző boot: ${escapeHtml(v.previousBootId || '-')}`);
  rows.push(`Ellenőrzés ideje: ${timeLabel(v.verifiedAt || v.checkedAt || v.lastRunAt)}`);
  return { ok, partialOk, cls, title, detail, rows };
}


function finalPreflightLockPanelState(lock = {}) {
  const status = String(lock.status || '');
  const ok = !!lock.ok || status === 'FINAL_LIVE_PREFLIGHT_LOCK_OK' || status === 'FINAL_LIVE_PREFLIGHT_LOCK_OK_LOCKED';
  const partialOk = false;
  const cls = ok ? 'ok' : 'bad';
  const title = lock.statusLabel || (ok ? 'SAFE LOCK OK — live előkészítve, de szándékosan zárolva' : 'Végső live safe-lock még blokkolt');
  const detail = lock.summary || (ok
    ? 'Minden proof rendben. A live előkészített, de safe-lock alatt marad: a live engedély kikapcsolva, az éles orderküldés tiltva.'
    : 'A végső preflight lock még hiányzó proofot vagy veszélyes ENV beállítást lát.');
  const checks = Array.isArray(lock.checks) ? lock.checks : [];
  const rows = checks.length ? checks.map(c => `${c.ok ? '✓' : c.level === 'warning' || c.level === 'warn' ? '!' : '×'} ${c.name || c.label}: ${c.detail || (c.ok ? 'OK' : 'ellenőrizendő')}`) : [
    `Supabase: ${lock.supabaseOk ? 'OK' : 'ellenőrizendő'}`,
    `Paper/Staging/Testnet: ${lock.stagingReady ? 'OK' : 'ellenőrizendő'}`,
    `Live dry-run: ${lock.liveDryRunOk ? 'OK' : 'ellenőrizendő'}`,
    `Live read-only: ${lock.liveReadonlyOk ? 'OK' : 'ellenőrizendő'}`,
    `Rehydrate: ${lock.rehydrateOk ? 'OK' : 'ellenőrizendő'}`,
    `Live engedély: ${(lock.env?.NEXUS_ALLOW_LIVE || 'false') === 'true' ? 'bekapcsolva — kézi review kell' : 'kikapcsolva, ez biztonságos'}`,
    `Éles orderküldés: ${(lock.env?.NEXUS_LIVE_REAL_SUBMIT || 'false') === 'true' ? 'bekapcsolva — veszélyes' : 'tiltva'}`,
    `Dry-run mód: ${(lock.env?.DRY_RUN || 'false') === 'true' ? 'bekapcsolva' : 'ellenőrizendő'}`
  ];
  rows.push(`Kritikus hiány: ${ok ? 'nincs' : missingText(lock.blockers, 'nincs')}`);
  rows.push(`Megjegyzés / figyelmeztetés: ${missingText(lock.warnings, 'nincs')}`);
  if (ok) rows.push('Live státusz: előkészítve, de szándékosan zárolva');
  rows.push(`Utolsó ellenőrzés: ${timeLabel(lock.checkedAt || lock.lastRunAt)}`);
  return { ok, partialOk, cls, title, detail, rows };
}

function liveActivationDecisionPanelState(gate = {}) {
  const status = String(gate.status || '');
  const decision = String(gate.decision || '');
  const readyLocked = status === 'LIVE_ACTIVATION_READY_BUT_LOCKED' || decision === 'ready-but-locked';
  const review = status === 'LIVE_ACTIVATION_ENV_ENABLED_REVIEW_REQUIRED' || decision === 'manual-review-required';
  const blockedRealSubmit = status === 'LIVE_ACTIVATION_BLOCKED_REAL_SUBMIT_ENABLED' || decision === 'blocked-real-submit';
  const ok = !!gate.ok || readyLocked || review;
  const cls = blockedRealSubmit ? 'bad' : (readyLocked ? 'ok' : (review ? 'warn' : (ok ? 'ok' : 'warn')));
  const title = gate.label || (readyLocked
    ? 'Live aktiválási kapu OK — live előkészítve, de zárolva'
    : review
      ? 'Live aktiválási kapu: manuális review kell'
      : blockedRealSubmit
        ? 'Live aktiválási kapu blokkolva — real submit aktív'
        : 'Live aktiválási kapu még nem kész');
  const detail = gate.summary || 'A gate döntési státuszt ad, de nem kapcsol be live kereskedést.';
  const rows = [
    `Döntés: ${compactLiveUiText(gate.decision || gate.status || 'még nem futott')}`,
    `Végső safe-lock: ${gate.finalPreflightLock?.ok ? 'OK' : 'ellenőrizendő'}`,
    `Live előkészítés: ${gate.liveReadiness?.displayReady || gate.liveReadiness?.lockedButReady || gate.liveReadiness?.preActivationReady ? 'OK' : 'ellenőrizendő'}`,
    `Live engedély: ${(gate.env?.NEXUS_ALLOW_LIVE || 'false') === 'true' ? 'bekapcsolva — kézi ellenőrzés kell' : 'kikapcsolva'}`,
    `Éles orderküldés: ${(gate.env?.NEXUS_LIVE_REAL_SUBMIT || 'false') === 'true' ? 'bekapcsolva — veszélyes' : 'tiltva'}`,
    'Kapu szabály: ez a döntés nem kapcsol éles orderküldést',
    `Kritikus hiány: ${missingText(gate.blockers, 'nincs')}`,
    `Figyelmeztetés: ${missingText(gate.warnings, 'nincs')}`,
    `Utolsó ellenőrzés: ${timeLabel(gate.checkedAt || gate.lastRunAt)}`
  ];
  return { ok, cls, title, detail, rows, readyLocked, review, blockedRealSubmit };
}


function liveModeSafeLockPanelState(lock = {}, lr = {}) {
  const liveActive = !!lock.liveActive;
  const preparedButLocked = !!(lock.preparedButLocked || lr.lockedButReady || lr.displayReady);
  const realSubmitActive = !!lock.liveRealSubmitActive;
  const uiClass = lock.uiClass || (realSubmitActive ? 'bad' : (preparedButLocked || liveActive ? 'ok' : 'warn'));
  const icon = realSubmitActive ? '×' : (liveActive ? '✓' : (preparedButLocked ? '🔒' : '!'));
  const title = lock.label || (liveActive
    ? 'Live ENV aktív — submit tiltva'
    : preparedButLocked
      ? 'Live előkészítve — SAFE LOCK aktív'
      : 'Live safe-lock aktív');
  const detail = lock.detail || lr.summary || 'A live nem aktív, amíg nincs külön ENV/manual élesítési döntés.';
  const env = lock.env || {};
  const rows = [
    `Kereskedési mód: ${compactLiveUiText(lock.actualMode || S.mode || '-')}`,
    `Folyamatlépés: ${compactLiveUiText(lock.workflowStage || S.workflowStage || S.mode || '-')}`,
    `Live engedély: ${(env.NEXUS_ALLOW_LIVE || (lock.liveEnvLocked === false ? 'true' : 'false')) === 'true' ? 'bekapcsolva — kézi ellenőrzés kell' : 'kikapcsolva'}`,
    `Éles orderküldés: ${(env.NEXUS_LIVE_REAL_SUBMIT || (lock.liveSubmitBlocked === false ? 'true' : 'false')) === 'true' ? 'engedélyezve — veszélyes' : 'tiltva'}`,
    `Live indulhat most: ${lock.liveWillNotStart === false ? 'igen' : 'nem — safe-lock / manuális döntés kell'}`,
    'Címke szabály: a safe-lock nem tényleges live mód'
  ];
  return { uiClass, icon, title, detail, rows, liveActive, preparedButLocked, realSubmitActive };
}

function livePrivateReadEnvGuidePanel(guide = {}) {
  const ready = !!guide.readyForReadProof;
  const cls = ready ? 'ok' : 'warn';
  const steps = Array.isArray(guide.steps) ? guide.steps : [];
  const venues = Array.isArray(guide.venues) ? guide.venues : [];
  const env = guide.env || {};
  const stepHtml = steps.map(x => `<div class="check ${x.ok ? 'ok' : 'warn'}"><b>${x.ok ? '✓' : '!'} ${escapeHtml(envStepTitle(x))}</b><small>${escapeHtml(envStepDetail(x))}</small></div>`).join('') || '<div class="check warn"><b>ENV útmutató még nem töltött be</b><small>Nyomd meg az ENV útmutató gombot.</small></div>'; 
  const visibleVenues = venues.filter(v => v.inScope !== false || v.usableForReadProof || v.hasEnvCredentials || v.storedKeyAvailable);
  const venueHtml = visibleVenues.map(v => {
    const keyState = v.hasEnvCredentials || v.storedKeyAvailable ? 'kulcspár érzékelve' : 'kulcs ellenőrizendő';
    const endpoint = v.readOnlyEndpoint ? 'account olvasási endpoint' : '-';
    return `<div class="missingBox ${v.usableForReadProof ? 'ok' : 'warn'}"><b>${escapeHtml(v.label || v.venue)} ${v.usableForReadProof ? 'olvasási kulcs OK' : 'kulcs ellenőrizendő'}</b><small>${escapeHtml(compactLiveUiText(humanTechLabel(v.note || '')))}<br>Kulcs: ${escapeHtml(keyState)}<br>Olvasási végpont: ${escapeHtml(endpoint)}<br>Forrás: ${escapeHtml(cleanStatusLabel(v.credentialSource || '-'))}</small></div>`;
  }).join('');
  const manual = lastLiveEnvGuideResult?._panel;
  const lpaState = livePrivateAuthPanelState(S.livePrivateAuth || S.livePrivateAuthSummary || {});
  const persistState = liveReadonlyProofPersistencePanelState(S.liveReadonlyProofPersistence || {});
  const rehydrateState = liveRehydrateVerificationPanelState(S.liveProofRehydrateVerification || {});
  const lockState = finalPreflightLockPanelState(S.finalLivePreflightLock || {});
  const proofAlreadyOk = !!(ready && (lpaState.ok || persistState.ok || rehydrateState.ok || lockState.ok));
  const envDoneText = 'ENV útmutató rendben\nLive olvasási proof már OK, nincs további ENV teendő. A bot paper/staging módban fut tovább, safe-lock aktív.';
  const envReadyText = 'ENV útmutató rendben\nOlvasási proofhoz kész. A Live olvasási proof gombot csak újraellenőrzéshez kell megnyomni; éles ordert nem küld.';
  const manualText = proofAlreadyOk ? envDoneText : (manual ? `${manual.title}\n${manual.detail}` : (ready ? envReadyText : (guide.nextAction || 'Nyomd meg az ENV útmutató gombot.')));
  const manualClassName = proofAlreadyOk || ready ? 'ok' : (manual?.className || cls);
  return `
    <div class="promotionSection liveEnvGuide">
      <div class="promotionHeader">
        <div>
          <h4>Live olvasási ENV útmutató</h4>
          <small>Megmutatja az olvasási ellenőrzéshez szükséges biztonságos cloud/Railway beállításokat. Éles ordert nem kapcsol be.</small>
        </div>
        <span class="badge ${cls}">${escapeHtml(cleanStatusLabel(guide.status || (ready ? 'LIVE_PRIVATE_READ_ENV_READY' : 'LIVE_PRIVATE_READ_ENV_GUIDE_NEEDED')))}</span>
      </div>
      <div class="promotionCards">
        <div class="check ${cls}"><b>${ready ? '✓' : '!'} Olvasási proof előkészítés</b><small>${escapeHtml(compactLiveUiText(guide.summary || 'ENV állapot ellenőrzése szükséges'))}</small></div>
        <div class="check ${env.NEXUS_LIVE_PRIVATE_READ === 'true' ? 'ok' : 'warn'}"><b>Olvasási proof kapcsoló</b><small>${escapeHtml((env.NEXUS_LIVE_PRIVATE_READ || 'false') === 'true' ? 'bekapcsolva' : 'kikapcsolva')} • csak ez lehet bekapcsolva olvasási ellenőrzéshez</small></div>
        <div class="check ${env.NEXUS_LIVE_REAL_SUBMIT === 'false' ? 'ok' : 'bad'}"><b>Éles orderküldés zár</b><small>${escapeHtml((env.NEXUS_LIVE_REAL_SUBMIT || 'false') === 'true' ? 'bekapcsolva — veszélyes' : 'tiltva')} • olvasási proofhoz maradjon tiltva</small></div>
        <div class="check ${env.NEXUS_ALLOW_LIVE === 'false' ? 'ok' : 'warn'}"><b>Live engedély zár</b><small>${escapeHtml((env.NEXUS_ALLOW_LIVE || 'false') === 'true' ? 'bekapcsolva — kézi review kell' : 'kikapcsolva')} • safe-lock alatt maradjon kikapcsolva</small></div>
      </div>
      <div class="promotionColumns">
        <div class="promotionSection"><h4>Bekapcsolási lépések</h4>${stepHtml}</div>
        <div class="promotionSection"><h4>Live kulcsok / venue állapot</h4>${venueHtml || '<div class="missingBox warn"><b>Nincs venue kulcs infó</b><small>A mentett tőzsdéhez olvasási kulcspár szükséges.</small></div>'}<div class="missingBox ${manualClassName}"><b>ENV útmutató ellenőrzés</b><small>${escapeHtml(compactLiveUiText(liveEnvGuideBusy ? 'ENV útmutató frissítése...' : manualText))}</small></div></div>
      </div>
      <div class="actions promotionActions"><button data-live-env-guide>ENV útmutató frissítése</button></div>
    </div>
  `;
}

function renderLiveReadinessBlock() {
  const lr = S.liveReadiness || lastLiveReadinessResult?.liveReadiness || {};
  const displayReady = !!(lr.displayReady || lr.lockedButReady || lr.technicallyReady || promotionLiveLooksPrepared());
  const cls = lr.active ? 'ok' : (displayReady ? 'ok' : 'bad');
  const safeLock = S.liveModeSafeLock || lr.liveModeSafeLock || lastLiveReadinessResult?.liveModeSafeLock || {};
  const safeLockState = liveModeSafeLockPanelState(safeLock, lr);
  const checklist = conditionsHtml(lr.conditions || []);
  const blockers = missingText(lr.displayBlockers || lr.blockers, 'Nincs kritikus hiányzó feltétel. A live szándékosan zárolva marad.');
  const warnings = missingText(lr.warnings, 'Nincs aktív figyelmeztetés.');
  const warningsOk = /nincs aktív figyelmeztetés/i.test(warnings);
  const safeLockRowsCompact = compactDetailLines(safeLockState.rows, 3);
  const manual = lastLiveReadinessResult?._panel || null;
  const manualText = manual ? `${manual.title}
${manual.detail}` : 'Nyomd meg a Live előkészítés ellenőrzés gombot a kézi ellenőrzéshez.';
  const dry = lr.liveDryRunProof || S.liveDryRunProof || lastLiveDryRunResult?.liveDryRunProof || {};
  const dryOk = !!dry.ok || String(dry.status || '').includes('OK');
  const dryCls = dryOk ? 'ok' : (dry.status ? 'warn' : 'bad');
  const dryManual = lastLiveDryRunResult?._panel || null;
  const dryManualText = dryManual ? `${dryManual.title}
${dryManual.detail}` : (dry.detail || 'Nyomd meg a Live dry-run próba gombot. Ez nem küld valódi ordert.');
  const lpa = lr.livePrivateAuth || S.livePrivateAuth || lastLivePrivateAuthResult?.livePrivateAuthSummary || {};
  const lpaState = livePrivateAuthPanelState(lpa);
  const lpaOk = lpaState.ok;
  const lpaCls = lpaState.cls;
  const lpaManual = lastLivePrivateAuthResult?._panel || null;
  const lpaManualText = lpaManual ? `${lpaManual.title}
${lpaManual.detail}` : `${lpaState.title}
${lpaState.detail}`;
  const lpaDetailHtml = detailHtml(lpaState.detail, lpaState.rows, 4);
  const persistence = lastLiveProofPersistenceResult?.liveReadonlyProofPersistence || S.liveReadonlyProofPersistence || lpa.persistence || lr.liveReadonlyProofPersistence || {};
  const persistState = liveReadonlyProofPersistencePanelState(persistence);
  const persistManual = lastLiveProofPersistenceResult?._panel || null;
  const persistManualText = persistManual ? `${persistManual.title}
${persistManual.detail}` : `${persistState.title}
${persistState.detail}`;
  const persistDetailHtml = detailHtml(persistState.detail, persistState.rows, 5);
  const rehydrateVerification = lastLiveRehydrateVerificationResult?.liveProofRehydrateVerification || S.liveProofRehydrateVerification || lr.liveProofRehydrateVerification || {};
  const rehydrateState = liveRehydrateVerificationPanelState(rehydrateVerification);
  const rehydrateManual = lastLiveRehydrateVerificationResult?._panel || null;
  const rehydrateManualText = rehydrateManual ? `${rehydrateManual.title}
${rehydrateManual.detail}` : `${rehydrateState.title}
${rehydrateState.detail}`;
  const rehydrateDetailHtml = detailHtml(rehydrateState.detail, rehydrateState.rows, 4);
  const envGuide = lastLiveEnvGuideResult?.livePrivateReadEnvGuide || lpa.envGuide || lr.livePrivateReadEnvGuide || S.livePrivateReadEnvGuide || {};
  const finalLock = lastFinalPreflightLockResult?.finalLivePreflightLock || S.finalLivePreflightLock || lr.finalLivePreflightLock || {};
  const finalLockState = finalPreflightLockPanelState(finalLock);
  const finalLockManual = lastFinalPreflightLockResult?._panel || null;
  const finalLockManualText = finalLockManual ? `${finalLockManual.title}
${finalLockManual.detail}` : `${finalLockState.title}
${finalLockState.detail}`;
  const finalLockDetailHtml = detailHtml(finalLockState.detail, finalLockState.rows, 4);
  const rawActivationGate = lastLiveActivationDecisionResult?.liveActivationDecisionGate || S.liveActivationDecisionGate || lr.liveActivationDecisionGate || {};
  const rawActivationStatus = String(rawActivationGate.status || rawActivationGate.decision || '');
  const liveCapital = S.accountingMode?.realExchangeCapital || finalLock.liveCapital || rawActivationGate.liveCapital || {};
  const liveCapitalFunded = !!liveCapital.funded;
  const activationGate = (!lastLiveActivationDecisionResult && (rawActivationStatus === '' || rawActivationStatus === 'not-run' || rawActivationStatus === 'LIVE_ACTIVATION_NOT_READY') && finalLockState.ok && displayReady)
    ? {
        ...rawActivationGate,
        ok: liveCapitalFunded,
        status: liveCapitalFunded ? 'LIVE_ACTIVATION_READY_BUT_LOCKED' : 'LIVE_ACTIVATION_LOCKED_NO_REAL_CAPITAL',
        decision: liveCapitalFunded ? 'ready-but-locked' : 'locked-no-real-capital',
        label: liveCapitalFunded ? 'Live aktiválási kapu OK — safe-lock aktív' : 'Live aktiválási kapu zárolva — nincs valós tőke proof',
        summary: liveCapitalFunded ? 'Nincs teendő: a proofok rendben vannak, a live előkészített, de szándékosan zárolt. Éles order nem indul.' : 'Paper/staging proof rendben, de valós Binance/tőzsdei tőke nincs bizonyítva vagy nulla. A virtuális Net profit nem használható live méretezéshez.',
        checkedAt: rawActivationGate.checkedAt || finalLock.checkedAt || finalLock.lastRunAt || lr.checkedAt || null,
        finalPreflightLock: { ok: true },
        liveReadiness: { displayReady: true, lockedButReady: true },
        env: { ...(rawActivationGate.env || {}), NEXUS_ALLOW_LIVE: 'false', NEXUS_LIVE_REAL_SUBMIT: 'false' },
        liveCapital,
        blockers: liveCapitalFunded ? [] : ['Valós live tőke proof hiányzik'],
        warnings: rawActivationGate.warnings || []
      }
    : rawActivationGate;
  const activationGateState = liveActivationDecisionPanelState(activationGate);
  const readinessProofReady = !!(displayReady || finalLockState.ok || activationGateState.ok || safeLockState.preparedButLocked || safeLockState.preparedButLocked === true);
  const liveReadinessDisplayBusy = liveReadinessBusy && !readinessProofReady;
  const manualBoxClass = readinessProofReady ? 'ok' : (manual?.className || 'warn');
  const manualDisplayText = liveReadinessDisplayBusy
    ? 'Ellenőrzés folyamatban...'
    : (readinessProofReady
      ? 'Live előkészítés OK — safe-lock aktív\nA proofok alapján a live előkészített, de szándékosan zárolt. Éles order nem indul.'
      : manualText);
  const activationGateManual = lastLiveActivationDecisionResult?._panel || null;
  const activationGateManualText = activationGateManual ? `${activationGateManual.title}
${activationGateManual.detail}` : `${activationGateState.title}
${activationGateState.detail}`;
  const activationGateDetailHtml = detailHtml(activationGateState.detail, activationGateState.rows, 5);
  const readinessBtnClass = actionButtonClass({ done: readinessProofReady, next: !readinessProofReady && !liveReadinessBusy, busy: liveReadinessBusy });
  const dryBtnClass = actionButtonClass({ done: dryOk, next: !dryOk && !liveDryRunBusy, busy: liveDryRunBusy });
  const lpaBtnClass = actionButtonClass({ done: lpaOk, next: dryOk && !lpaOk && !livePrivateAuthBusy, warn: !dryOk, busy: livePrivateAuthBusy });
  const persistBtnClass = actionButtonClass({ done: persistState.ok || persistState.partialOk, next: lpaOk && !(persistState.ok || persistState.partialOk) && !liveProofPersistenceBusy, warn: !lpaOk, busy: liveProofPersistenceBusy });
  const rehydrateBtnClass = actionButtonClass({ done: rehydrateState.ok || rehydrateState.partialOk, next: (persistState.ok || persistState.partialOk) && !(rehydrateState.ok || rehydrateState.partialOk) && !liveRehydrateVerificationBusy, warn: !(persistState.ok || persistState.partialOk), busy: liveRehydrateVerificationBusy });
  const finalLockBtnClass = actionButtonClass({ done: finalLockState.ok, next: displayReady && !finalLockState.ok && !finalPreflightLockBusy, warn: !displayReady, busy: finalPreflightLockBusy });
  const activationBtnClass = actionButtonClass({ done: activationGateState.ok, next: finalLockState.ok && !activationGateState.ok && !liveActivationDecisionBusy, warn: !finalLockState.ok, danger: activationGateState.blockedRealSubmit, busy: liveActivationDecisionBusy });
  return `
    <div class="liveReadinessBox">
      <div class="promotionHeader">
        <div>
          <h4>Live előkészítés — safe-lock lista</h4>
          <small>Ez nem indít live kereskedést. Csak azt mutatja, hogy a live előkészítés biztonságosan zárolt-e.</small>
        </div>
        <span class="badge ${cls}">${escapeHtml(lr.statusLabel || 'Live még nem aktív')}</span>
      </div>
      <div class="promotionCards">
        <div class="check ${safeLockState.uiClass}"><b>${safeLockState.icon} ${escapeHtml(compactLiveUiText(safeLockState.title))}</b><small>${escapeHtml(compactLiveUiText(safeLockState.detail))} • ${percentLabel(lr.progress)}</small>${progressBar(lr.progress)}</div>
        <div class="check ${lr.env?.liveEnv ? 'warn' : (safeLock.preparedButLocked || lr.lockedButReady ? 'ok' : 'warn')}"><b>${lr.env?.liveEnv ? '!' : safeLock.preparedButLocked || lr.lockedButReady ? '🔒' : '!'} Live engedély safe-lock</b><small>${lr.env?.liveEnv ? 'Live engedély bekapcsolva: manuális review kell, ez önmagában nem küld ordert' : 'Live engedély kikapcsolva: szándékos zár, éles order nem indul'}</small></div>
        <div class="check ${lr.safety?.orderSubmitGuard ? 'ok' : 'bad'}"><b>${lr.safety?.orderSubmitGuard ? '🔒' : '!'} Orderküldés guard</b><small>${lr.safety?.orderSubmitGuard ? 'Valódi éles orderküldés külön védelem alatt / tiltva' : 'Éles orderküldés bekapcsolva: azonnali manuális ellenőrzés szükséges'}</small></div>
        <div class="check ${dryCls}"><b>${dryOk ? '✓' : '!'} Live dry-run próba</b><small>${escapeHtml(compactLiveUiText(dry.detail || dry.status || 'Még nem futott le'))} • utolsó: ${timeLabel(dry.lastRunAt)}</small></div>
        <div class="check ${lpaCls}"><b>${lpaOk ? '✓' : lpaState.safelySkipped ? '!' : '×'} ${escapeHtml(compactLiveUiText(lpaState.title))}</b><small>${lpaDetailHtml} • utolsó: ${timeLabel(lpa.lastRunAt)}</small></div>
        <div class="check ${persistState.cls}"><b>${persistState.ok ? '✓' : '!'} ${escapeHtml(compactLiveUiText(persistState.title))}</b><small>${persistDetailHtml}</small></div>
        <div class="check ${rehydrateState.cls}"><b>${rehydrateState.ok ? '✓' : rehydrateState.partialOk ? '!' : '×'} ${escapeHtml(compactLiveUiText(rehydrateState.title))}</b><small>${rehydrateDetailHtml}</small></div>
        <div class="check ${finalLockState.cls}"><b>${finalLockState.ok ? '✓' : finalLockState.partialOk ? '!' : '×'} ${escapeHtml(compactLiveUiText(finalLockState.title))}</b><small>${finalLockDetailHtml}</small></div>
        <div class="check ${activationGateState.cls}"><b>${activationGateState.ok ? '✓' : activationGateState.blockedRealSubmit ? '×' : '!'} ${escapeHtml(compactLiveUiText(activationGateState.title))}</b><small>${activationGateDetailHtml}</small></div>
        <div class="check ${lr.safety?.autoDowngradeActive ? 'ok' : 'bad'}"><b>${lr.safety?.autoDowngradeActive ? '✓' : '×'} Auto-visszazárás</b><small>Feltételsérülés esetén staging/paper safe mód.</small></div>
      </div>
      <div class="promotionColumns">
        <div class="promotionSection"><h4>Végső live checklist</h4>${checklist}</div>
        <div class="promotionSection">
          <h4>Hiányzó feltételek / figyelmeztetések</h4>
          <div class="missingBox ${displayReady ? 'ok' : 'bad'}"><b>${displayReady ? 'Live előkészítés OK, de nem live mód' : 'Live zárolás oka'}</b><small>${escapeHtml(compactLiveUiText(displayReady ? 'A zöld állapot előkészítést jelent. A tényleges live mód külön manuális élesítés nélkül nem indul.' : blockers))}</small></div>
          <div class="missingBox ${safeLockState.uiClass}"><b>${escapeHtml(compactLiveUiText(safeLockState.title))}</b><small>${escapeHtml(safeLockRowsCompact)}</small></div>
          <div class="missingBox ${warningsOk ? 'ok' : 'warn'}"><b>Figyelmeztetések</b><small>${escapeHtml(compactPanelText(warnings, 2))}</small></div>
          <div class="missingBox ${manualBoxClass}"><b>Legutóbbi kézi check</b><small>${escapeHtml(compactPanelText(manualDisplayText, 3))}</small></div>
          <div class="missingBox ${dryManual?.className || dryCls}"><b>Legutóbbi live dry-run próba</b><small>${escapeHtml(compactPanelText(liveDryRunBusy ? 'Live dry-run próba folyamatban...' : dryManualText, 3))}</small></div>
          <div class="missingBox ${lpaManual?.className || lpaCls}"><b>Legutóbbi live olvasási proof</b><small>${escapeHtml(compactPanelText(livePrivateAuthBusy ? 'Live olvasási proof folyamatban...' : lpaManualText, 3))}</small></div>
          <div class="missingBox ${persistManual?.className || persistState.cls}"><b>Live olvasási proof mentés</b><small>${escapeHtml(compactPanelText(liveProofPersistenceBusy ? ('Proof mentés ellenőrzése folyamatban. Utolsó ismert állapot: ' + persistState.title + ' — ' + persistState.detail) : persistManualText, 3))}</small></div>
          <div class="missingBox ${rehydrateManual?.className || rehydrateState.cls}"><b>Restart utáni live proof</b><small>${escapeHtml(compactPanelText(liveRehydrateVerificationBusy ? ('Restart/rehydrate ellenőrzés folyamatban. Utolsó ismert állapot: ' + rehydrateState.title + ' — ' + rehydrateState.detail) : rehydrateManualText, 3))}</small></div>
          <div class="missingBox ${finalLockManual?.className || finalLockState.cls}"><b>Végső live safe-lock</b><small>${escapeHtml(compactPanelText(finalPreflightLockBusy ? ('Végső safe-lock ellenőrzés folyamatban. Utolsó ismert állapot: ' + finalLockState.title + ' — ' + finalLockState.detail) : finalLockManualText, 3))}</small></div>
          <div class="missingBox ${activationGateManual?.className || activationGateState.cls}"><b>Live aktiválási döntési kapu</b><small>${escapeHtml(compactPanelText(liveActivationDecisionBusy ? ('Live aktiválási döntés folyamatban. Utolsó ismert állapot: ' + activationGateState.title + ' — ' + activationGateState.detail) : activationGateManualText, 3))}</small></div>
        </div>
      </div>
      ${livePrivateReadEnvGuidePanel(envGuide)}
      <div class="actions promotionActions">
        <button data-live-readiness-check class="${readinessBtnClass}">${actionPrefix(readinessProofReady, liveReadinessBusy)}Live előkészítés ellenőrzés</button>
        <button data-live-dry-run-proof class="${dryBtnClass}">${actionPrefix(dryOk, liveDryRunBusy)}Live dry-run próba</button>
        <button data-live-private-auth-check class="${lpaBtnClass}">${actionPrefix(lpaOk, livePrivateAuthBusy)}Live olvasási proof</button>
        <button data-live-proof-persistence class="${persistBtnClass}">${actionPrefix(persistState.ok || persistState.partialOk, liveProofPersistenceBusy)}Proof mentés ellenőrzés</button>
        <button data-live-rehydrate-verification class="${rehydrateBtnClass}">${actionPrefix(rehydrateState.ok || rehydrateState.partialOk, liveRehydrateVerificationBusy)}Visszatöltés proof</button>
        <button data-final-preflight-lock class="${finalLockBtnClass}">${actionPrefix(finalLockState.ok, finalPreflightLockBusy)}Végső safe-lock</button>
        <button data-live-activation-decision class="${activationBtnClass}">${actionPrefix(activationGateState.ok, liveActivationDecisionBusy)}Live aktiválási döntés</button>
      </div>
    </div>
  `;
}

function renderPromotion() {
  const p = S.promotion || {};
  const box = $('#promotionBox');
  if (!box) return;
  const paper = p.paper || {};
  const staging = p.staging || {};
  const live = p.live || {};
  const clarity = p.clarity || {};
  const execution = staging.executionProof || {};
  const paperCls = paper.ok ? 'ok' : 'warn';
  const stagingCls = staging.ok ? 'ok' : 'warn';
  const liveDisplayReady = !!(live.displayReady || live.lockedButReady || live.preActivationReady);
  const safeLock = S.liveModeSafeLock || S.liveReadiness?.liveModeSafeLock || {};
  const safeLockState = liveModeSafeLockPanelState(safeLock, S.liveReadiness || {});
  const liveCls = live.ok ? 'ok' : (liveDisplayReady ? 'ok' : (staging.ok ? 'warn' : 'bad'));
  const summaryCls = live.ok || liveDisplayReady ? 'ok' : (staging.ok ? 'warn' : 'bad');
  const modeHint = effectiveTradingModeUi().detail || (S.mode === 'staging' && staging.ok ? 'Staging használható' : (S.mode === 'staging' ? 'Staging kiválasztva, de még nem teljes proof' : `aktuális mód: ${S.mode || '-'}`));
  const promoFinalLockState = finalPreflightLockPanelState(S.finalLivePreflightLock || S.liveReadiness?.finalLivePreflightLock || {});
  const rawPromoActivationGate = S.liveActivationDecisionGate || S.liveReadiness?.liveActivationDecisionGate || {};
  const rawPromoActivationStatus = String(rawPromoActivationGate.status || rawPromoActivationGate.decision || '');
  const promoActivationGate = ((rawPromoActivationStatus === '' || rawPromoActivationStatus === 'not-run' || rawPromoActivationStatus === 'LIVE_ACTIVATION_NOT_READY') && promoFinalLockState.ok && liveDisplayReady)
    ? { ...rawPromoActivationGate, ok: true, status: 'LIVE_ACTIVATION_READY_BUT_LOCKED', decision: 'ready-but-locked', label: 'Live aktiválási kapu OK — safe-lock aktív', summary: 'Nincs teendő: a live előkészített, de safe-lock alatt marad.', blockers: [] }
    : rawPromoActivationGate;
  const promoActivationState = liveActivationDecisionPanelState(promoActivationGate);
  const promoPrivateOk = livePrivateAuthPanelState(S.livePrivateAuth || S.liveReadiness?.livePrivateAuth || {}).ok;
  const testnetBtnClass = actionButtonClass({ done: !!execution.ok, next: !execution.ok });
  const syncBtnClass = actionButtonClass({ done: !!staging.ok, next: !!execution.ok && !staging.ok, warn: !execution.ok });
  const stagingBtnClass = actionButtonClass({ done: S.mode === 'staging', next: !!staging.ok && S.mode !== 'staging', warn: !staging.ok });
  const readinessPromoBtnClass = actionButtonClass({ done: liveDisplayReady, next: !!staging.ok && !liveDisplayReady, warn: !staging.ok });
  const privatePromoBtnClass = actionButtonClass({ done: promoPrivateOk, next: liveDisplayReady && !promoPrivateOk, warn: !liveDisplayReady });
  const activationPromoBtnClass = actionButtonClass({ done: promoActivationState.ok, next: promoFinalLockState.ok && !promoActivationState.ok, warn: !promoFinalLockState.ok, danger: promoActivationState.blockedRealSubmit });
  const safeLockPromoBtnClass = actionButtonClass({ done: liveDisplayReady || safeLockState.preparedButLocked, warn: !liveDisplayReady });
  box.innerHTML = `
    <div class="promotionHeader">
      <div>
        <h4>Staging / Live feloldási állapot</h4>
        <small>Itt látszik külön, hogy mi kész, mi hiányzik, és miért marad zárolva a live. A live továbbra sem indul el ENV engedély nélkül.</small>
      </div>
      <span class="badge ${summaryCls}">${escapeHtml(compactLiveUiText(clarity.summary || (live.ok ? 'Live feloldva' : liveDisplayReady ? safeLockState.title : staging.ok ? 'Staging használható' : 'Staging/live még zárolva')))}</span>
    </div>
    <div class="promotionCards">
      <div class="check ${paperCls}">
        <b>${paper.ok ? '✓' : '!'} Paper bizonyítás</b>
        <small>${escapeHtml(compactLiveUiText(paper.statusLabel || (paper.ok ? 'OK' : 'zárolt')))} • ${percentLabel(paper.progress)}\n${escapeHtml(compactLiveUiText(paper.required || ''))}</small>
        ${progressBar(paper.progress)}
      </div>
      <div class="check ${stagingCls}">
        <b>${staging.ok ? '✓' : '!'} Staging bizonyítás</b>
        <small>${escapeHtml(compactLiveUiText(staging.statusLabel || (staging.ok ? 'Staging használható' : 'Staging még zárolva')))} • ${percentLabel(staging.progress)}\n${escapeHtml(compactLiveUiText(staging.required || ''))}</small>
        ${progressBar(staging.progress)}
      </div>
      <div class="check ${execution.ok ? 'ok' : 'warn'}">
        <b>${execution.ok ? '✓' : '!'} Helyi staging életút</b>
        <small>Valódi testnet: ${execution.realExchangeProof ? 'igazolt' : 'nincs igazolva'} • LIVE-feloldás: ${execution.livePromotionEligible ? 'külön engedély szükséges' : 'nem jogosult'}</small>
        <small>${execution.ok ? (execution.countFallback?.ok ? 'OK darabszám alapján' : 'OK') : 'Hiányzik'} • ${escapeHtml(cleanStatusLabel(execution.status || 'NO_EXECUTION_PROOF'))}\n${execution.countFallback?.ok ? escapeHtml(`${execution.countFallback.count}/${execution.countFallback.required} mentett staging proof`) : `tőzsde: ${escapeHtml(execution.venue || '-')} • utolsó: ${timeLabel(execution.latestAt || execution.time)}`}</small>
      </div>
      <div class="check ${liveCls}">
        <b>${live.ok ? '✓' : liveDisplayReady ? '🔒' : '×'} Live mód / safe-lock</b>
        <small>${escapeHtml(compactLiveUiText(live.ok ? (live.statusLabel || 'feloldva') : liveDisplayReady ? safeLockState.title : (live.statusLabel || 'zárolva')))} • ${percentLabel(liveDisplayReady && !live.ok ? 100 : live.progress)}\n${escapeHtml(compactLiveUiText(liveDisplayReady && !live.ok ? 'Előkészített állapot, de tényleges live mód külön live engedély nélkül nem indul.' : (live.nextAction || live.required || '')))}</small>
        ${progressBar(liveDisplayReady && !live.ok ? 100 : live.progress)}
      </div>
    </div>
    <div class="promotionColumns">
      <div class="promotionSection">
        <h4>Staging bizonyítás feltételei</h4>
        ${conditionsHtml(staging.conditions)}
        <div class="missingBox ${staging.ok ? 'ok' : 'warn'}"><b>${staging.ok ? 'Staging használható' : 'Mi hiányzik még staginghez?'}</b><small>${escapeHtml(compactLiveUiText(missingText(staging.missing, 'Minden staging feltétel teljesült.')))}</small></div>
      </div>
      <div class="promotionSection">
        <h4>Live feloldási feltételek</h4>
        ${conditionsHtml(live.conditions)}
        <div class="missingBox ${live.ok || liveDisplayReady ? 'ok' : 'bad'}"><b>${escapeHtml(live.ok ? 'Live feloldva' : liveDisplayReady ? safeLockState.title : 'Mi hiányzik még live előkészítéshez?')}</b><small>${escapeHtml(compactLiveUiText(liveDisplayReady ? 'Ez nem tényleges live mód. A safe-lock miatt a live engedély kikapcsolva, éles order nem indulhat.' : missingText(live.missing, 'Minden live feltétel teljesült.')))}</small></div>
      </div>
    </div>
    ${renderLiveReadinessBlock()}
    <div class="promotionFooter">
      <div class="check ${summaryCls}"><b>Következő teendő</b><small>${escapeHtml(compactLiveUiText(clarity.nextAction || staging.nextAction || live.nextAction || modeHint))}</small></div>
      <div class="actions promotionActions">
        <button data-testnet-action="execution" class="${testnetBtnClass}">${actionPrefix(!!execution.ok)}Staging order proof futtatás</button>
        <button data-testnet-action="sync" class="${syncBtnClass}">${actionPrefix(!!staging.ok)}Order sync bizonyítás</button>
        <button data-promo-action="staging" class="${stagingBtnClass}">${actionPrefix(S.mode === 'staging')}Staging mód</button>
        <button data-live-readiness-check class="${readinessPromoBtnClass}">${actionPrefix(liveDisplayReady)}Live előkészítés ellenőrzés</button>
        <button data-live-private-auth-check class="${privatePromoBtnClass}">${actionPrefix(promoPrivateOk)}Live olvasási proof</button>
        <button data-live-activation-decision class="${activationPromoBtnClass}">${actionPrefix(promoActivationState.ok)}Live aktiválási döntés</button>
        <button data-live-activation-decision class="${safeLockPromoBtnClass}">${actionPrefix(liveDisplayReady || safeLockState.preparedButLocked)}Live safe-lock ellenőrzés</button>
      </div>
    </div>
  `;
}


function renderRuntimeSafety() {
  const box = $('#runtimeSafetyBox');
  if (!box) return;
  const h = lastHandsOffSupervisorResult?.handsOff || S.autonomousHandsOff || S.autonomousSupervisor?.handsOff || {};
  const hScore = Number(h.healthScore || 0);
  const hCls = h.interventionRequired ? 'bad' : h.warnings?.length ? 'warn' : 'ok';
  const hChecks = Array.isArray(h.checks) ? h.checks : [];
  const hRows = hChecks.slice(0, 8).map(x => `<div class="check ${x.ok ? 'ok' : x.level === 'critical' ? 'bad' : 'warn'}"><b>${x.ok ? '✓' : '!'} ${escapeHtml(x.label || x.key || '-')}</b><small>${escapeHtml(humanTechLabel(x.detail || ''))}</small></div>`).join('');
  const r = S.runtimeSafety || {};
  const d = S.renderExitDiagnostics || {};
  const ok = !String(r.status || '').includes('error') && !String(r.status || '').includes('fallback-error');
  const cls = ok ? 'ok' : 'warn';
  const last = lastRuntimeSafetyResult || {};
  const diagCls = d.lastCrashAt ? (d.exitOnFatal ? 'bad' : 'warn') : 'ok';
  const diagPanel = lastCrashDiagnosticsResult?._panel || { title: d.lastCrashAt ? 'Process exit diagnosztika rögzítve' : 'Nincs rögzített process crash', detail: d.message || 'Cloud/Railway process crash esetén itt látszik majd az utolsó crash manifest.' };
  box.innerHTML = `
    <div class="supabaseHeader">
      <div><h4>Hands-off supervisor</h4><small>Önműködő felügyelet: csak akkor kér beavatkozást, ha valódi kritikus gond van.</small></div>
      <span class="badge ${hCls}">${escapeHtml(h.label || 'Hands-off supervisor ellenőrzés...')}</span>
    </div>
    <div class="cards compactCards">
      <div class="card"><small>EGÉSZSÉG PONTSZÁM</small><strong>${hScore || '-' }${hScore ? '%' : ''}</strong><em>${escapeHtml(runtimeFeatureLabel(h.status || 'not-run'))}</em></div>
      <div class="card"><small>BEAVATKOZÁS</small><strong>${h.interventionRequired ? 'KELL' : 'NEM KELL'}</strong><em>${escapeHtml(h.nextAction || 'ellenőrzés folyamatban')}</em></div>
      <div class="card"><small>FELÜGYELET</small><strong>${escapeHtml(runtimeFeatureLabel(S.autonomousSupervisor?.status || '-'))}</strong><em>automatikus újraindítás / beragadás-oldás / biztonsági szünet</em></div>
    </div>
    <div class="supabaseGrid">${hRows || '<div class="check warn"><b>Hands-off ellenőrzés még nem futott</b><small>Nyomd meg a Hands-off ellenőrzés gombot.</small></div>'}</div>
    <pre>${escapeHtml(humanTechLabel(h.summary || 'A hands-off supervisor státusz betöltése folyamatban.'))}</pre>
    <div class="actions"><button data-hands-off-check class="primary">Hands-off ellenőrzés</button><button data-action="safe">Safe mode</button></div>
    <div class="supabaseHeader">
      <div><h4>Runtime védelem</h4><small>Védi a runtime ciklust hiányzó/null mezők és régebbi order életút állapot ellen.</small></div>
      <span class="badge ${cls}">${escapeHtml(humanTechLabel(r.status || 'ready'))}</span>
    </div>
    <div class="supabaseGrid">
      <div class="check ${cls}"><b>${ok ? '✓' : '!'} Runtime biztonsági tartalék mód</b><small>helyreállítások: ${Number(r.recoveredCount || 0)} • javítások: ${Number(r.nullSafetyFixes || 0)}</small></div>
      <div class="check ${r.lastError ? 'warn' : 'ok'}"><b>${r.lastError ? 'Utolsó runtime hiba' : 'Nincs aktuális runtime hiba'}</b><small>${escapeHtml(humanTechLabel(r.lastError || 'OK'))} • ${timeLabel(r.lastErrorAt)}</small></div>
      <div class="check ok"><b>Proof állapotok védve</b><small>Supabase / paper / staging / testnet proof nem romlik le null-safety fallback miatt.</small></div>
    </div>
    <pre>${escapeHtml(humanTechLabel(r.lastSafeMessage || last.message || 'Runtime védelem készen áll.'))}</pre>
    <div class="supabaseHeader">
      <div><h4>Process exit / status 1 diagnosztika</h4><small>process crash jelzés után itt ellenőrizhető az utolsó process hiba és a crash_manifest.</small></div>
      <span class="badge ${diagCls}">${escapeHtml(humanTechLabel(d.status || 'ready'))}</span>
    </div>
    <div class="supabaseGrid">
      <div class="check ${diagCls}"><b>${d.lastCrashAt ? 'Utolsó crash rögzítve' : 'Nincs rögzített crash'}</b><small>${escapeHtml(humanTechLabel(d.lastReason || 'OK'))} • ${timeLabel(d.lastCrashAt)}</small></div>
      <div class="check ${d.exitOnFatal ? 'warn' : 'ok'}"><b>${d.exitOnFatal ? 'Exit fatal engedélyezve' : 'Exit 1 védelem aktív'}</b><small>NEXUS_EXIT_ON_FATAL=${escapeHtml(String(d.exitOnFatal === true))} • crash count: ${Number(d.crashCount || 0)}</small></div>
      <div class="check ${d.lastError ? 'warn' : 'ok'}"><b>${escapeHtml(humanTechLabel(diagPanel.title))}</b><small>${escapeHtml(humanTechLabel(diagPanel.detail || d.lastError || 'A szerver él, nincs aktuális exit diagnosztikai hiba.'))}</small></div>
    </div>
    <div class="actions"><button data-crash-diagnostics>Crash diagnosztika frissítés</button><button data-crash-diagnostics-clear>Crash diagnosztika törlés</button></div>
  `;
}

async function runRuntimeSafetyRepair() {
  if (runtimeSafetyBusy) return;
  runtimeSafetyBusy = true;
  try {
    const result = await api('/api/runtime/safety/repair', {});
    lastRuntimeSafetyResult = result;
    toast(result.message || 'Runtime védelem javítása lefutott.');
    await refresh();
  } catch (error) {
    toast('Runtime repair hiba: ' + error.message);
  } finally {
    runtimeSafetyBusy = false;
  }
}

async function runCrashDiagnostics(clear = false) {
  if (crashDiagnosticsBusy) return;
  crashDiagnosticsBusy = true;
  try {
    const endpoint = clear ? '/api/runtime/crash-diagnostics/clear' : '/api/runtime/crash-diagnostics';
    const response = await fetch(endpoint, { method: clear ? 'POST' : 'GET', cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || result.message || 'API hiba');
    const d = result.diagnostics || {};
    lastCrashDiagnosticsResult = { ...result, _panel: { className: d.lastCrashAt ? 'warn' : 'ok', title: clear ? 'Crash diagnosztika törölve' : (d.lastCrashAt ? 'Crash diagnosztika frissítve' : 'Nincs rögzített crash'), detail: d.lastError || d.message || 'OK' } };
    toast(lastCrashDiagnosticsResult._panel.title);
    await refresh();
  } catch (error) {
    lastCrashDiagnosticsResult = { ok: false, error: error.message || String(error), _panel: { className: 'warn', title: 'Crash diagnosztika API hiba', detail: error.message || 'API hiba' } };
    toast('Crash diagnosztika hiba');
  } finally {
    crashDiagnosticsBusy = false;
    renderRuntimeSafety();
  }
}

async function runHandsOffSupervisorCheck() {
  if (handsOffSupervisorBusy) return;
  handsOffSupervisorBusy = true;
  try {
    const result = await api('/api/supervisor/hands-off', { run: true });
    lastHandsOffSupervisorResult = result;
    toast(result.handsOff?.label || 'Hands-off supervisor ellenőrizve.');
    await refresh();
  } catch (error) {
    toast('Hands-off ellenőrzési hiba: ' + error.message);
  } finally {
    handsOffSupervisorBusy = false;
    renderRuntimeSafety();
  }
}

function renderEvents() {
  const events = S.events || [];
  const feed = $('#feed'); if (feed) feed.innerHTML = events.slice(0, 18).map(item).join('') || '<div class="item">Nincs esemény.</div>';
  const filtered = currentFilter === 'all' ? events : events.filter(e => e.type === currentFilter || (currentFilter === 'learning' && ['learning','ai'].includes(e.type)));
  const logs = $('#logsBox'); if (logs) logs.innerHTML = filtered.map(item).join('') || '<div class="item">A napló üres.</div>';
  const incidents = $('#incidentBox'); if (incidents) incidents.innerHTML = (S.incidents || []).map(item).join('') || '<div class="item">Nincs rögzített hiba.</div>';
  const queue = $('#queue'); if (queue) queue.innerHTML = (S.queue || []).map(item).join('') || '<div class="item">A queue üres.</div>';
}

function renderPipeline() {
  const steps = $('#steps');
  if (!steps) return;
  const names = ['MARKET_SCAN','SIGNAL_GENERATION','RISK_GATE','EXECUTION_INTENT','EXECUTION_RECONCILE','LEARNING_FEEDBACK'];
  steps.innerHTML = names.map(x => {
    const p = S.pipeline?.[x] || {};
    const cls = S.phase === x ? 'active' : p.blocked ? 'blocked' : '';
    const label = humanPhase(x, false);
    const raw = rawPhaseTitle(x);
    return `<button class="step ${cls}" data-detail="${x}" title="${escapeHtml(raw)}"><b>${escapeHtml(label)}</b><small>${escapeHtml(statusWord(p.status || 'waiting'))} • ${p.lastRun ? preciseTimeLabel(p.lastRun) : '-'}</small></button>`;
  }).join('');
  bindDetails();
}

function renderExchanges() {
  const exchanges = $('#exchangeList');
  const values = Object.values(S.exchanges || {});
  if (exchanges) {
    exchanges.innerHTML = values.length ? values.map(e => {
      const cls = exchangeStateClass(e);
      const title = exchangeStateTitle(e);
      const detail = exchangeStateDetail(e);
      const icon = cls === 'ok' ? '✓' : (cls === 'warn' ? '!' : '×');
      const venueKey = String(e.venue || e.exchange || '').toLowerCase();
      const cap = S.exchangeCapabilityRegistry?.venues?.[venueKey] || {};
      const truth = cap.truth ? ` • ${cap.truth}` : '';
      const execTruth = cap.privateReadConnected ? 'private read: IGEN' : 'private read: NEM';
      const liveTruth = cap.liveExecutionEnabled ? 'live execution: IGEN' : 'live execution: NEM';
      return `<div class="item check ${cls}"><b>${escapeHtml(e.venue)}</b> — ${icon} ${escapeHtml(title)}<br><small>${escapeHtml(detail)}${escapeHtml(truth)} • ${escapeHtml(execTruth)} • ${escapeHtml(liveTruth)}</small></div>`;
    }).join('') : '<div class="item">Nincs mentett tőzsde.</div>';
  }
  const venueSelect = $('#venue');
  const testnetToggle = $('#testnet');
  if (venueSelect && testnetToggle && document.activeElement !== testnetToggle) {
    const selectedVenue = String(venueSelect.value || '').toUpperCase();
    const selected = values.find(e => String(e.venue || e.exchange || '').toUpperCase() === selectedVenue);
    if (selected && typeof selected.testnet === 'boolean') testnetToggle.checked = selected.testnet;
  }
  const proofBox = $('#proof');
  if (proofBox) {
    const current = String(proofBox.textContent || '').trim();
    if (!current || current === 'Még nincs kapcsolat teszt.' || current.startsWith('Kapcsolat teszt állapot')) {
      proofBox.textContent = 'Kapcsolat teszt állapot\n' + exchangePanelSummary(values);
    }
  }
}

function stagingOrderStatusAccepted(status = '') {
  return /^(STAGING_DRY_RUN_ACCEPTED|STAGING_DRY_RUN_RECONCILED|TESTNET_ORDER_ACCEPTED|TESTNET_ORDER_RECONCILED|STAGING_EXECUTION_PROOF_OK|TESTNET_EXECUTION_PROOF_OK)$/i.test(String(status || '').trim());
}

function testnetExecutionSummary() {
  const executionProof = (S.testnetProofs || []).find(p => p.proof_type === 'execution_lifecycle' || p.type === 'execution_lifecycle' || p.execution_ok);
  const latestOrder = (S.testnetOrders || [])[0] || {};
  const latest = S.testnet?.lastExecutionProof || executionProof || S.promotion?.staging?.executionProof || {};
  const fallback = S.promotion?.staging?.executionProof?.countFallback || latest.countFallback || {};
  const latestStatus = latest.status || S.promotion?.staging?.executionProof?.status || '';
  const acceptedOrder = stagingOrderStatusAccepted(latestOrder.status);
  const acceptedProof = stagingOrderStatusAccepted(latestStatus);
  const ok = !!(latest.execution_ok || latest.ok || fallback.ok || S.promotionProof?.testnetExecutionOkEver || S.promotion?.staging?.executionProof?.ok || acceptedOrder || acceptedProof);
  return {
    ok,
    status: latestStatus || (acceptedOrder ? latestOrder.status : (ok ? 'STAGING_EXECUTION_PROOF_OK' : 'NO_EXECUTION_PROOF')),
    venue: latest.venue || S.promotionProof?.lastTestnetExecutionVenue || latestOrder.venue || latestOrder.exchange || '-',
    time: latest.time || latest.latestAt || S.promotionProof?.lastTestnetExecutionProofAt || latestOrder.time || latestOrder.createdAt || null,
    orderId: latest.exchangeOrderId || latest.orderId || latestOrder.exchangeOrderId || latestOrder.id || '-',
    lifecycle: latest.lifecycleSteps || S.promotion?.staging?.executionProof?.lifecycle || [],
    latestOrderAccepted: acceptedOrder
  };
}

function renderTestnetProofPanel() {
  const box = $('#testnetProofPanel');
  if (!box) return;
  const summary = testnetExecutionSummary();
  const latestProof = (S.testnetProofs || [])[0] || {};
  const latestOrder = (S.testnetOrders || [])[0] || {};
  const cls = summary.ok ? 'ok' : (latestProof.status ? 'warn' : 'bad');
  const latestPanel = lastTestnetPanelResult?._panel || null;
  const proofAlreadyOk = !!(summary.ok || summary.latestOrderAccepted || S.promotion?.staging?.executionProof?.ok || S.promotionProof?.testnetExecutionOkEver);
  const latestTitle = latestPanel?.title || lastTestnetPanelResult?.status || (proofAlreadyOk ? 'Staging order proof OK' : 'még nem futott');
  const latestClass = latestPanel?.className || (lastTestnetPanelResult?.ok || proofAlreadyOk ? 'ok' : (lastTestnetPanelResult ? 'warn' : 'warn'));
  const latestDetail = latestPanel?.detail || (lastTestnetPanelResult
    ? shortJson(lastTestnetPanelResult)
    : (proofAlreadyOk
      ? `Korábbi/mentett staging order proof alapján elfogadva. Venue: ${summary.venue || '-'} • order: ${summary.orderId || latestOrder.exchangeOrderId || latestOrder.id || '-'} • utolsó: ${timeLabel(summary.time)}. Új API proof futtatás nem kötelező.`
      : 'Nyomd meg a Staging order proof gombot. Alapból dry-run, nem küld valódi ordert.'));
  const safeInfo = testnetSafeModeInfo(latestProof, summary);
  const summaryStatus = exchangeTechLabel(summary.status);
  const latestOrderStatus = exchangeTechLabel(latestOrder.status || 'még nincs');
  const showRunning = testnetPanelBusy && !(lastTestnetPanelResult && lastTestnetPanelResult._panel);
  box.innerHTML = `
    <div class="supabaseHeader">
      <div><h4>Staging order proof</h4><small>Staging/live feloldás előtt bizonyítja az order életutat: orderterv → proof kapu → dry-run/orderküldés → szinkron → proof napló.</small></div>
      <span class="badge ${cls}">${summary.ok ? 'Order proof OK' : 'Order proof szükséges'}</span>
    </div>
    <div class="supabaseGrid">
      <div class="check ${cls}"><b>${summary.ok ? '✓' : '!'} Order életút</b><small>státusz: ${escapeHtml(summaryStatus)} • venue: ${escapeHtml(summary.venue)} • utolsó: ${timeLabel(summary.time)}</small></div>
      <div class="check ${safeInfo.className}"><b>${safeInfo.orderProofOk || latestProof.hardened_ready ? '✓' : '!'} ${escapeHtml(safeInfo.title)}</b><small>${escapeHtml(safeInfo.detail)}</small></div>
      <div class="check ${summary.latestOrderAccepted ? 'ok' : (latestOrder.status ? 'warn' : 'warn')}"><b>${summary.latestOrderAccepted ? '✓' : '!'} Legutóbbi staging/testnet proof</b><small>${escapeHtml(latestOrderStatus)} • ${escapeHtml(latestOrder.symbol || '-')} • ${escapeHtml(latestOrder.exchangeOrderId || latestOrder.id || '-')}</small></div>
      <div class="check ${S.promotion?.staging?.ok ? 'ok' : 'warn'}"><b>${S.promotion?.staging?.ok ? '✓' : '!'} Feloldási védelem</b><small>${escapeHtml(S.promotion?.staging?.required || '-')} • progress: ${S.promotion?.staging?.progress || 0}%</small></div>
    </div>
    <div class="actions supabaseActions">
      <button data-testnet-action="proof">Base proof</button>
      <button data-testnet-action="balances">Egyenleg proof</button>
      <button data-testnet-action="execution" class="primary">Staging order proof</button>
      <button data-testnet-action="sync">Order sync</button>
    </div>
    <div class="supabaseResult check ${latestClass}"><b>Legutóbbi staging/testnet ellenőrzés: ${escapeHtml(latestTitle)}</b><small>${showRunning ? 'Futtatás folyamatban...' : escapeHtml(latestDetail)}</small></div>
  `;
}

function testnetManualSummary(kind, result) {
  if (kind === 'execution') {
    const fallback = result.executionProof?.countFallback || result.promotion?.staging?.executionProof?.countFallback || {};
    const okByFallback = !!(fallback.ok || result.promotion?.staging?.executionProof?.ok);
    return {
      className: result.ok || okByFallback ? 'ok' : 'warn',
      title: result.ok || okByFallback ? 'Staging order proof OK' : 'Staging order proof figyelmeztetés',
      detail: result.ok
        ? 'Lifecycle végigment: intent, proof gate, submit/dry-run, sync/reconcile és proof journal.'
        : (okByFallback ? `Korábbi staging proof darabszám alapján elfogadva (${fallback.count || result.promotion?.staging?.orders || '-'}/${fallback.required || result.promotion?.staging?.requiredOrders || '-'}). Új API proof nem kötelező.` : `Staging proof gond: ${result.error || result.status || result.reason || 'nézd meg a részleteket'}`)
    };
  }
  if (kind === 'proof') {
    const detail = (result.proofs || []).map(p => `${p.venue}:${exchangeTechLabel(p.status)}${p.balance_read_status ? ' / balance: ' + exchangeTechLabel(p.balance_read_status) : ''}`).join(', ') || exchangeTechLabel(result.status || '-');
    const safeDryRunNote = !S.testnet?.realSubmitEnabled ? ' Safe dry-run/paper alatt a testnet-not-enabled figyelmeztetés nem élő kereskedési hiba.' : '';
    return { className: result.ok ? 'ok' : 'warn', title: result.ok ? 'Alap staging proof lefutott' : 'Base proof figyelmeztetés', detail: `Proofok: ${detail}.${safeDryRunNote}` };
  }
  if (kind === 'balances') return { className: result.ok ? 'ok' : 'warn', title: result.ok ? 'Egyenleg proof OK' : 'Egyenleg proof figyelmeztetés', detail: exchangeTechLabel(result.status || result.error || '-') };
  if (kind === 'sync') return { className: result.ok ? 'ok' : 'warn', title: result.ok ? 'Order sync lefutott' : 'Order sync figyelmeztetés', detail: `${result.count || 0} order ellenőrizve` };
  return { className: result.ok ? 'ok' : 'warn', title: result.status || (result.ok ? 'OK' : 'WARN'), detail: shortJson(result) };
}

async function runTestnetAction(kind) {
  const venue = $('#venue')?.value || 'Binance';
  const endpoints = {
    proof: '/api/exchanges/proof',
    balances: '/api/testnet/balances',
    execution: '/api/testnet/execution-proof',
    sync: '/api/testnet/sync'
  };
  const endpoint = endpoints[kind];
  if (!endpoint || testnetPanelBusy) return;
  testnetPanelBusy = true;
  lastTestnetPanelResult = { ok: null, status: `${kind} folyamatban`, endpoint, venue };
  renderTestnetProofPanel();
  try {
    const result = await apiSoft(endpoint, { venue });
    const panel = testnetManualSummary(kind, result);
    lastTestnetPanelResult = { ...result, _panel: panel };
    testnetPanelBusy = false;
    renderTestnetProofPanel();
    toast(panel.title);
    await refresh();
  } catch (error) {
    lastTestnetPanelResult = { ok: false, status: `${kind} hiba`, error: error.message || String(error), endpoint, venue };
    toast('Staging proof ellenőrzési figyelmeztetés: ' + (error.message || 'API válasz nem elérhető'));
    await refresh().catch(() => renderTestnetProofPanel());
  } finally {
    testnetPanelBusy = false;
    renderTestnetProofPanel();
  }
}

async function runLiveReadinessCheck() {
  if (liveReadinessBusy) return;
  liveReadinessBusy = true;
  lastLiveReadinessResult = { ok: null, liveReadiness: S.liveReadiness || {}, _panel: { className: 'warn', title: 'Live előkészítés ellenőrzés folyamatban', detail: 'Ellenőrzés fut...' } };
  renderPromotion();
  try {
    const response = await fetch('/api/live/readiness/check');
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.apiOk === false) throw new Error(result.message || result.error || 'API hiba');
    const lr = result.liveReadiness || {};
    const ready = !!(result.readinessOk ?? lr.technicallyReady);
    const blocked = result.blocked === true || (!ready && Array.isArray(lr.blockers) && lr.blockers.length > 0);
    lastLiveReadinessResult = {
      ...result,
      ok: true,
      _panel: {
        className: ready ? 'ok' : 'warn',
        title: ready ? (lr.statusLabel || 'Live előkészítés OK') : 'Live előkészítés ellenőrizve',
        detail: lr.summary || lr.nextAction || result.message || (blocked ? 'Live továbbra is biztonságosan zárolva.' : '-')
      }
    };
    toast(lastLiveReadinessResult._panel.title);
    await refresh();
  } catch (error) {
    const fallback = S.liveReadiness || {};
    const fallbackDetail = fallback.summary || fallback.nextAction || error.message || 'API hiba';
    lastLiveReadinessResult = { ok: false, error: error.message || String(error), liveReadiness: fallback, _panel: { className: 'warn', title: 'Live előkészítés API átmeneti hiba', detail: fallbackDetail } };
    toast('Live előkészítés ellenőrzés: dashboard állapotból mutatva');
  } finally {
    liveReadinessBusy = false;
    renderPromotion();
  }
}


async function runLiveDryRunProof() {
  if (liveDryRunBusy) return;
  liveDryRunBusy = true;
  lastLiveDryRunResult = { ok: null, _panel: { className: 'warn', title: 'Live dry-run próba folyamatban', detail: 'Live orderterv + guard + blokkolt orderküldés ellenőrzés fut. Valódi order nem kerül kiküldésre.' } };
  renderPromotion();
  try {
    const response = await fetch('/api/live/dry-run-proof', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || result.error || 'API hiba');
    const proof = result.liveDryRunProof || {};
    const ok = !!result.ok || String(proof.status || '').includes('OK');
    lastLiveDryRunResult = { ...result, _panel: { className: ok ? 'ok' : 'warn', title: ok ? 'Live dry-run próba OK' : 'Live dry-run próba figyelmeztetés', detail: proof.humanSummary || proof.status || result.status || '-' } };
    toast(lastLiveDryRunResult._panel.title);
    await refresh();
  } catch (error) {
    lastLiveDryRunResult = { ok: false, error: error.message || String(error), _panel: { className: 'bad', title: 'Live dry-run próba hiba', detail: error.message || 'API hiba' } };
    toast('Live dry-run próba hiba: ' + (error.message || 'API hiba'));
  } finally {
    liveDryRunBusy = false;
    renderPromotion();
  }
}



async function runLiveEnvGuide() {
  if (liveEnvGuideBusy) return;
  liveEnvGuideBusy = true;
  lastLiveEnvGuideResult = { ok: null, _panel: { className: 'warn', title: 'ENV útmutató frissítése', detail: 'Railway ENV állapot olvasása folyamatban. Kulcsértékeket nem jelenít meg.' } };
  renderPromotion();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('/api/live/private-read/env-guide', { signal: controller.signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.message || result.error || 'API hiba');
    const guide = result.livePrivateReadEnvGuide || {};
    lastLiveEnvGuideResult = { ...result, _panel: { className: guide.readyForReadProof ? 'ok' : 'warn', title: guide.readyForReadProof ? 'ENV olvasási proofhoz kész' : 'ENV útmutató ellenőrizve', detail: guide.summary || guide.nextAction || '-' } };
    toast(lastLiveEnvGuideResult._panel.title);
    await refresh();
  } catch (error) {
    const timeout = error.name === 'AbortError';
    const guide = S.livePrivateReadEnvGuide || S.liveReadiness?.livePrivateReadEnvGuide || {};
    const known = !!(guide.readyForReadProof || guide.summary || guide.nextAction);
    lastLiveEnvGuideResult = { ok: known, error: error.message || String(error), livePrivateReadEnvGuide: guide, _panel: { className: known && guide.readyForReadProof ? 'ok' : 'warn', title: timeout ? 'ENV útmutató ellenőrzés lezárva' : 'ENV útmutató átmeneti hiba', detail: known ? (guide.summary || guide.nextAction || 'Utolsó ismert ENV állapot betöltve a dashboardból.') : (timeout ? 'A Railway környezet lassan válaszolt. Ez nem live hiba; a kulcsok nem jelennek meg.' : (error.message || 'API hiba')) } };
    toast(timeout ? 'ENV útmutató: időtúllépés, állapot lezárva' : 'ENV útmutató: dashboard állapotból mutatva');
  } finally {
    clearTimeout(timer);
    liveEnvGuideBusy = false;
    renderPromotion();
  }
}


async function runLiveProofPersistenceCheck() {
  if (liveProofPersistenceBusy) return;
  liveProofPersistenceBusy = true;
  lastLiveProofPersistenceResult = { _panel: { className: 'warn', title: 'Proof mentés ellenőrzés folyamatban', detail: 'Állapot lekérése...' } };
  renderAll();
  try {
    const response = await fetch('/api/live/readonly-proof/persistence/check?run=true', { method: 'POST' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || result.message || 'API hiba');
    const persistence = result.liveReadonlyProofPersistence || {};
    const panel = liveReadonlyProofPersistencePanelState(persistence);
    lastLiveProofPersistenceResult = { ...result, _panel: { className: panel.cls, title: panel.title, detail: panel.detail + '\n' + panel.rows.join('\n') } };
    toast(panel.title);
  } catch (error) {
    lastLiveProofPersistenceResult = { ok: false, error: error.message || String(error), _panel: { className: 'warn', title: 'Proof mentés API átmeneti hiba', detail: error.message || 'API hiba' } };
    toast('Proof mentés ellenőrzés hiba');
  } finally {
    liveProofPersistenceBusy = false;
    renderAll();
  }
}

async function runLiveRehydrateVerificationCheck() {
  if (liveRehydrateVerificationBusy) return;
  liveRehydrateVerificationBusy = true;
  lastLiveRehydrateVerificationResult = { _panel: { className: 'warn', title: 'Restart/rehydrate ellenőrzés folyamatban', detail: 'Live olvasási proof visszatöltés vizsgálata...' } };
  renderAll();
  try {
    const response = await fetch('/api/live/readonly-proof/restart-verification?run=true', { method: 'POST' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || result.message || 'API hiba');
    const verification = result.liveProofRehydrateVerification || {};
    const panel = liveRehydrateVerificationPanelState(verification);
    lastLiveRehydrateVerificationResult = { ...result, _panel: { className: panel.cls, title: panel.title, detail: panel.detail + '\n' + panel.rows.join('\n') } };
    toast(panel.title);
    await refresh();
  } catch (error) {
    lastLiveRehydrateVerificationResult = { ok: false, error: error.message || String(error), _panel: { className: 'warn', title: 'Restart/rehydrate API átmeneti hiba', detail: error.message || 'API hiba' } };
    toast('Restart/rehydrate ellenőrzés hiba');
  } finally {
    liveRehydrateVerificationBusy = false;
    renderAll();
  }
}


async function runFinalPreflightLockCheck() {
  if (finalPreflightLockBusy) return;
  finalPreflightLockBusy = true;
  lastFinalPreflightLockResult = { _panel: { className: 'warn', title: 'Végső safe-lock gyors ellenőrzés folyamatban', detail: 'Mentett proof állapotok gyors ellenőrzése. Nem futtat drága Supabase/proof javítást minden kattintáskor.' } };
  renderAll();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('/api/live/final-preflight-lock?run=true&fast=true', { method: 'POST', signal: controller.signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || result.message || 'API hiba');
    const lock = result.finalLivePreflightLock || {};
    const panel = finalPreflightLockPanelState(lock);
    lastFinalPreflightLockResult = { ...result, _panel: { className: panel.cls, title: panel.title, detail: panel.detail + '\n' + panel.rows.join('\n') } };
    toast(panel.title);
    await refresh();
  } catch (error) {
    const timeout = error.name === 'AbortError';
    lastFinalPreflightLockResult = { ok: false, error: error.message || String(error), _panel: { className: 'warn', title: timeout ? 'Végső safe-lock időtúllépés — nem live hiba' : 'Végső safe-lock API átmeneti hiba', detail: timeout ? 'A kérés 30 másodperc után megszakadt. A bot nem állt le, éles order nem indult. A safe-lock változatlanul aktív; a következő snapshot az utolsó ismert OK állapotot visszaolvassa.' : (error.message || 'API hiba') } };
    toast(timeout ? 'Végső safe-lock: időtúllépés, safe-lock aktív' : 'Végső safe-lock ellenőrzés figyelmeztetés');
  } finally {
    clearTimeout(timer);
    finalPreflightLockBusy = false;
    renderAll();
  }
}

async function runLiveActivationDecisionGate() {
  if (liveActivationDecisionBusy) return;
  liveActivationDecisionBusy = true;
  lastLiveActivationDecisionResult = { _panel: { className: 'warn', title: 'Live aktiválási döntés folyamatban', detail: 'Gyors döntési kapu ellenőrzés. Nem kapcsol be live ENV-et és nem küld valódi ordert.' } };
  renderAll();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('/api/live/activation-decision?run=true', { method: 'POST', signal: controller.signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || result.message || 'API hiba');
    const gate = result.liveActivationDecisionGate || {};
    const panel = liveActivationDecisionPanelState(gate);
    lastLiveActivationDecisionResult = { ...result, _panel: { className: panel.cls, title: panel.title, detail: panel.detail + '\n' + panel.rows.join('\n') } };
    toast(panel.title);
    await refresh();
  } catch (error) {
    const timeout = error.name === 'AbortError';
    lastLiveActivationDecisionResult = { ok: false, error: error.message || String(error), _panel: { className: 'warn', title: timeout ? 'Live aktiválási döntés időtúllépés — nem live hiba' : 'Live aktiválási döntés API hiba', detail: timeout ? 'A döntési kapu 20 másodperc után megszakadt. Ez nem indította el a live kereskedést, a safe-lock maradt aktív; a következő snapshot visszahozza az ismert állapotot.' : (error.message || 'API hiba') } };
    toast(timeout ? 'Live aktiválási döntés: időtúllépés, nem indult live' : 'Live aktiválási döntés figyelmeztetés');
  } finally {
    clearTimeout(timer);
    liveActivationDecisionBusy = false;
    renderAll();
  }
}


async function runLivePrivateAuthCheck() {
  if (livePrivateAuthBusy) return;
  livePrivateAuthBusy = true;
  lastLivePrivateAuthResult = { ok: null, _panel: { className: 'warn', title: 'Live olvasási proof folyamatban', detail: 'Live account/balance olvasási proof fut. Valódi order nem kerül kiküldésre.' } };
  renderPromotion();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('/api/live/private-auth/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.message || result.error || 'API hiba');
    const proof = result.livePrivateAuth || {};
    const summary = result.livePrivateAuthSummary || {};
    const panelState = livePrivateAuthPanelState(summary);
    const ok = !!(result.readinessOk ?? summary.ok ?? proof.ok);
    lastLivePrivateAuthResult = { ...result, _panel: { className: panelState.cls, title: ok ? 'Live olvasási proof OK' : panelState.title, detail: proof.humanSummary || summary.detail || panelState.detail || result.status || '-' } };
    if (result.liveReadonlyProofPersistence) {
      const persistencePanel = liveReadonlyProofPersistencePanelState(result.liveReadonlyProofPersistence);
      lastLiveProofPersistenceResult = { ...result, _panel: { className: persistencePanel.cls, title: persistencePanel.title, detail: persistencePanel.detail + '\n' + persistencePanel.rows.join('\n') } };
    }
    toast(lastLivePrivateAuthResult._panel.title);
    await refresh();
  } catch (error) {
    const timeout = error.name === 'AbortError';
    const fallback = S.livePrivateAuth || S.liveReadiness?.livePrivateAuth || lastLivePrivateAuthResult?.livePrivateAuthSummary || {};
    const panelState = livePrivateAuthPanelState(fallback);
    const known = !!(fallback.ok || fallback.status || fallback.lastRunAt || fallback.accountReadProofOk || fallback.realAccountReadProofOk);
    lastLivePrivateAuthResult = { ok: known ? panelState.ok : false, error: error.message || String(error), livePrivateAuthSummary: fallback, _panel: { className: known ? panelState.cls : 'warn', title: timeout ? (known ? 'Live olvasási proof ismert állapotból lezárva' : 'Live olvasási proof időtúllépés — nem live hiba') : 'Live olvasási proof átmeneti hiba', detail: known ? (panelState.title + ' — ' + panelState.detail) : (timeout ? 'A kérés 30 másodperc után lezárva. A bot tovább fut paper/staging módban, éles order nem indult. A háttérben befejeződő proofot a következő snapshot visszahozza.' : (fallback.detail || error.message || 'API hiba')) } };
    toast(timeout ? 'Live olvasási proof: hosszú válasz, dashboard állapot megőrizve' : 'Live olvasási proof: dashboard állapotból mutatva');
  } finally {
    clearTimeout(timer);
    livePrivateAuthBusy = false;
    renderPromotion();
  }
}


function usd(value) { const n = Number(value || 0); const digits = n !== 0 && Math.abs(n) < 0.01 ? 4 : 2; return '$' + n.toFixed(digits); }

function scalingReasonLabel(reason) {
  const raw = String(reason || '');
  const map = {
    normal_scaling: 'normál skálázás',
    normal_venue_scaling: 'tőzsde-szintű normál skálázás',
    venue_supervisor_ai_paused: 'portfolio-supervisor: venue szünetel',
    venue_supervisor_ai_reduce: 'portfolio-supervisor: venue kockázat csökkentve',
    venue_supervisor_ai_promote: 'portfolio-supervisor: venue előléptetve',
    venue_loss_streak_reduce: 'tőzsde-szintű vesztes széria védelem',
    venue_hard_loss_streak_reduce: 'tőzsde-szintű erős veszteségvédelem',
    venue_soft_drawdown_reduce: 'tőzsde-szintű drawdown óvatosság',
    venue_hard_drawdown_protection: 'tőzsde-szintű drawdown stop',
    recent_winrate_supports_scale_up: 'jó winrate → méretnövelés',
    recent_winrate_reduce: 'gyengébb winrate → óvatosabb méret',
    active_capital_growth: 'profit-visszaforgatás',
    learning_guard_quality_boost: 'erős minta → nagyobb méret',
    learning_guard_size_reduce_no_trade_stop: 'gyengébb minta → kisebb méret',
    strategy_evaluation_scale_up: 'stratégia boost',
    strategy_evaluation_reduce: 'stratégia óvatosság',
    loss_streak_reduce: 'vesztes széria védelem',
    soft_drawdown_reduce: 'drawdown óvatosság',
    verified_market_warmup_legacy_boosts_disabled: 'verified minta gyűlik: legacy boostok tiltva',
    high_volatility_reduce: 'magas volatilitás',
    medium_volatility_reduce: 'közepes volatilitás',
    withdrawal_reserve_protected: 'kivételi tartalék védve',
    portfolio_exposure_cap_reached: 'portfólió exposure limit',
    profit_velocity_strong_scale_up: 'profit-velocity erősítés',
    profit_velocity_positive_scale_up: 'profit alapján méretnövelés',
    profit_velocity_reduce: 'profit-védelem méretcsökkentés',
    profit_velocity_neutral: 'profit-velocity semleges',
    fresh_market_data_required: 'friss public market adatra vár',
    market_data_stale_trade_block: 'stale adat: új journal tiltva',
    verified_market_warmup_legacy_boosts_disabled: 'verified minta gyűlik: legacy boostok tiltva'
  };
  return map[raw] || raw.replace(/_/g, ' ');
}


function venueCapitalModeInfo(row = {}) {
  const mode = String(row.mode || 'cautious').toLowerCase();
  const reason = String(row.reason || '').toLowerCase();
  const allowed = row.tradeAllowed !== false;
  if (reason === 'no-own-venue-market') return { cls: 'bad', label: 'PIACRA VÁR' };
  if (!allowed || mode === 'paused') return { cls: 'bad', label: 'SZÜNETEL' };
  if (mode === 'protective') return { cls: 'warn', label: 'VÉDETT' };
  if (mode === 'cautious') return { cls: 'warn', label: 'ÓVATOS' };
  if (mode === 'promoted') return { cls: 'ok', label: 'KIEMELT' };
  return { cls: 'ok', label: 'KERESKEDHET' };
}

function venueCapitalCardHtml(row = {}, compact = false) {
  const venue = String(row.venue || '-').toUpperCase();
  const info = venueCapitalModeInfo(row);
  const current = row.currentEngine || {};
  const discovery = row.discovery || {};
  const observed = row.observedExchangeBalance || {};
  const wr = current.winRate == null ? 'N/A' : `${Number(current.winRate).toFixed(1)}%`;
  const pnl = Number(row.realizedPnlUsd || 0);
  const pnlClass = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : '';
  const tradeText = row.tradeAllowed === false ? 'NEM' : 'IGEN';
  const discoveryText = discovery.allowed === true ? `kész • max ${usd(discovery.maxNotionalUsd || 0)}` : String(discovery.status || 'vár');
  const observedText = observed.verified === true && observed.equity != null ? `read-only ${usd(observed.equity)}` : 'nincs privát proof';
  const privateText = row.privateConnected === true ? 'PRIVÁT API OK' : 'csak public tanulás';
  const agent = row.agent || {};
  const adaptive = row.adaptiveCapital || agent.adaptiveCapital || {};
  const w20 = adaptive.windows?.last20 || {};
  const w50 = adaptive.windows?.last50 || {};
  const w100 = adaptive.windows?.last100 || {};
  const topStrategy = String(row.topStrategy || agent.topStrategy || '-').toUpperCase();
  const agentScore = Number(row.agentPerformanceScore ?? agent.performanceScore ?? adaptive.performanceScore ?? 50);
  const capitalMultiplier = Number(row.agentRiskMultiplier ?? agent.capitalMultiplier ?? adaptive.multiplier ?? 0.78);
  const adaptiveState = String(row.adaptiveCapitalState || agent.capitalState || adaptive.state || 'warmup').toUpperCase();
  const shadowSamples = Number(agent.shadowSamples || 0);
  const exitAI = S.adaptiveExitAI || {};
  const exitProfile = (exitAI.recentProfiles || []).find(p => String(p.venue || '').toUpperCase() === venue) || null;
  const exitAIText = exitProfile
    ? `${String(exitProfile.status || 'warmup').toUpperCase()} • conf ${Number(exitProfile.confidence || 0).toFixed(0)}% • TP ${Number(exitProfile.takeProfitPct || 0).toFixed(3)}% / SL ${Number(exitProfile.stopLossPct || 0).toFixed(3)}% • max ${Math.round(Number(exitProfile.hardHoldMs || 0)/1000)}s`
    : `${String(exitAI.status || 'WARMUP').toUpperCase()} • profil gyűlik`;
  const regimeChampions = Object.entries(agent.championByRegime || {})
    .filter(([, data]) => data?.champion?.strategy)
    .slice(0, 3)
    .map(([regime, data]) => `${String(regime).toUpperCase()}:${String(data.champion.strategy).toUpperCase()}`)
    .join(' • ');
  return `<div class="venueCapitalCard ${info.cls}">
    <div class="venueCapitalHeader"><b>${escapeHtml(venue)}</b><span class="badge ${info.cls}">${escapeHtml(info.label)}</span></div>
    <strong>${usd(row.equityUsd || 0)}</strong>
    <div class="venueCapitalRows">
      <span>Szabad tőke <b>${usd(row.availableCapitalUsd || 0)}</b></span>
      <span>Realizált PnL <b class="${pnlClass}">${usd(pnl)}</b></span>
      <span>Nyitott kitettség <b>${usd(row.openExposureUsd || 0)}</b></span>
      <span>Risk budget <b>${usd(row.riskBudgetUsd || 0)}</b></span>
    </div>
    <small>AI: ${escapeHtml(String(row.mode || 'cautious').toUpperCase())} • kereskedhet: ${tradeText} • score ${Number(row.score || 0).toFixed(1)} • ${escapeHtml(privateText)}</small>
    <small>Current engine: ${Number(current.trades || 0)} trade • WR ${wr} • loss streak ${Number(current.lossStreak || 0)}</small>
    <small>Venue AI agent: score ${agentScore.toFixed(1)} • tőkeszorzó ${capitalMultiplier.toFixed(3)}x • ${escapeHtml(adaptiveState)} • top stratégia: ${escapeHtml(topStrategy)}</small>
    <small>Friss teljesítmény: 20T PF ${Number(w20.profitFactor || 0).toFixed(2)} / exp ${usd(w20.expectancyUsd || 0)} • 50T PF ${Number(w50.profitFactor || 0).toFixed(2)} • 100T PF ${Number(w100.profitFactor || 0).toFixed(2)}</small>
    <small>Shadow lab: ${shadowSamples} lezárt tréningminta${regimeChampions ? ` • ${escapeHtml(regimeChampions)}` : ' • champion warmup'}</small>
    <small>Adaptive Exit AI: ${escapeHtml(exitAIText)}</small>
    <small>Tanuló mikroorder: ${escapeHtml(discoveryText)}${compact ? '' : ` • privát egyenleg: ${escapeHtml(observedText)}`}</small>
  </div>`;
}

function renderVenueCapitalQuick() {
  const box = $('#venueCapitalQuickBox');
  if (!box) return;
  const capital = S.venueCapital || {};
  const supervisor = S.portfolioSupervisorAI || {};
  const venues = ['binance','bybit','okx','kraken'];
  const rows = venues.map(v => capital.venues?.[v] || { venue: v, tradeAllowed: false, mode: 'cautious', equityUsd: 0, availableCapitalUsd: 0, riskBudgetUsd: 0, currentEngine: {}, discovery: {} });
  const activeCount = rows.filter(r => r.tradeAllowed !== false).length;
  const selected = String(supervisor.selectedExecutionVenue || supervisor.selectedVenue || '-').toUpperCase();
  const learningSelected = String(supervisor.selectedLearningVenue || '-').toUpperCase();
  const privateCount = Number(supervisor.privateConnectedCount || 0);
  const sim = S.paperSimulation || {};
  const market = S.marketDataHealth || {};
  const fresh = Number(market.freshMarketCount || 0);
  const expected = Number(market.expectedMarketCount || 12);
  const continuity = market.continuityPump || {};
  const hardResetCount = Number(continuity.hardResetCount || 0);
  const endpointFanout = Number(continuity.endpointFanout || 0);
  const tph = Number(sim.processTradesPerHour ?? sim.tradesPerHour ?? 0);
  const flowLabel = fresh > 0 && activeCount > 0 ? 'AKTÍV' : 'HELYREÁLLÍTÁS';
  const shadowLab = S.shadowStrategyLab || {};
  const shadowText = shadowLab.enabled === false ? 'shadow lab kikapcsolva' : `shadow ${Number(shadowLab.totalSettled || 0)} lezárt / ${Number(shadowLab.pending || 0)} függő`;
  const exitAIQuick = S.adaptiveExitAI || {};
  const exitText = exitAIQuick.enabled === false ? 'exit AI kikapcsolva' : `exit AI ${String(exitAIQuick.status || 'warmup').toUpperCase()} • ${Number(exitAIQuick.evidenceBackedProfiles || 0)} bizonyított profil`;
  const marketRecoveryNote = fresh < expected
    ? `self-heal • fair körforgás • REST fanout ${endpointFanout || 2}${hardResetCount ? ` • hard reset ${hardResetCount}x` : ''}`
    : 'teljes lefedettség';
  box.innerHTML = `<div class="venueCapitalSummary venueTradeflowSummary">
    <div><small>FOLYAMATOS TRADEFLOW</small><b>${escapeHtml(flowLabel)}</b><em>${tph.toFixed(1)} trade/óra • párhuzamos venue-agentek • ${escapeHtml(shadowText)} • ${escapeHtml(exitText)}</em></div>
    <div><small>FRISS SAJÁT PIAC</small><b>${fresh}/${expected}</b><em>${escapeHtml(marketRecoveryNote)}</em></div>
    <div><small>HELYI TANULÁSI TŐZSDÉK</small><b>${activeCount}/4</b><em>külön tőke + külön risk</em></div>
    <div><small>SUPERVISOR EXECUTION</small><b>${escapeHtml(selected)}</b><em>${privateCount}/4 privát API • tanulási fókusz: ${escapeHtml(learningSelected)} • pénzmozgatás: TILTVA</em></div>
  </div><div class="venueCapitalBoard">${rows.map(r => venueCapitalCardHtml(r, true)).join('')}</div>`;
}

function renderPortfolio() {
  const portfolio = $('#portfolioBox');
  if (!portfolio) return;
  const capital = S.venueCapital || {};
  const supervisor = S.portfolioSupervisorAI || {};
  const scaling = S.portfolioRiskScaling || S.portfolio?.riskScaling || {};
  const rows = ['binance','bybit','okx','kraken'].map(v => capital.venues?.[v] || { venue: v, tradeAllowed: false, mode: 'cautious', currentEngine: {}, discovery: {} });
  const activeVenues = rows.filter(r => r.tradeAllowed !== false).map(r => String(r.venue).toUpperCase());
  const pausedVenues = rows.filter(r => r.tradeAllowed === false).map(r => String(r.venue).toUpperCase());
  const selectedVenue = String(supervisor.selectedExecutionVenue || supervisor.selectedVenue || scaling.decisionVenue || '-').toUpperCase();
  const learningSelectedVenue = String(supervisor.selectedLearningVenue || '-').toUpperCase();
  portfolio.innerHTML = `
    <div class="capitalExplain"><b>4 külön kassza + 1 felső supervisor AI</b><span>Minden tőzsde a saját paper/staging pénzéből kereskedik. Egy venue vesztesége nem vehet el pénzt a másiktól és nem fagyaszthatja le automatikusan a másik hármat.</span></div>
    <div class="venueCapitalSummary">
      <div><small>ÖSSZES TŐKE</small><b>${usd(capital.totalEquityUsd || 0)}</b></div>
      <div><small>ÖSSZES SZABAD</small><b>${usd(capital.totalAvailableCapitalUsd || 0)}</b></div>
      <div><small>AKTÍV VENUE</small><b>${activeVenues.length}/4</b><em>${escapeHtml(activeVenues.join(', ') || 'nincs')}</em></div>
      <div><small>SUPERVISOR</small><b>${escapeHtml(String(supervisor.status || 'warming-up').toUpperCase())}</b><em>execution: ${escapeHtml(selectedVenue)} • tanulás: ${escapeHtml(learningSelectedVenue)}${pausedVenues.length ? ` • szünetel: ${escapeHtml(pausedVenues.join(', '))}` : ''}</em></div>
    </div>
    <div class="venueCapitalBoard">${rows.map(r => venueCapitalCardHtml(r, false)).join('')}</div>
    <details class="devDetails"><summary>Fejlesztői részletek</summary><pre>${escapeHtml(JSON.stringify({ venueCapital: capital, portfolioSupervisorAI: supervisor, riskScaling: scaling }, null, 2))}</pre></details>`;
}
function vaultCardsHtml() {
  const integrity = S.marketIntegrity || {};
  const c = integrity.enabled ? (integrity.verifiedCapital || {}) : (S.capital || {});
  const legacy = integrity.legacySnapshot || {};
  const verifiedClosed = Number(integrity.verifiedStats?.closedTrades || 0);
  const legacyClosed = Math.max(Number(legacy.closedTrades || 0), Math.max(0, Number(S.aggregateStats?.closedTrades || 0) - verifiedClosed));
  const legacyPnl = Number(legacy.closedTrades || 0) > 0 ? Number(legacy.netPnl || 0) : Number(S.aggregateStats?.netPnl || 0) - Number(integrity.verifiedStats?.netPnl || 0);
  const r = S.portfolioRiskScaling || S.portfolio?.riskScaling || {};
  const waiting = verifiedClosed === 0;
  return `<div class="cards"><div class="card"><small>VERIFIED VIRTUÁLIS TŐKE</small><strong>${usd(c.activeTradingCapital || 0)}</strong><em>csak verified public-market journal alapján</em></div><div class="card"><small>VERIFIED REALIZÁLT PROFIT</small><strong>${usd(c.realizedProfit || 0)}</strong><em>legacy eredmény kizárva</em></div><div class="card"><small>VERIFIED VISSZAFORGATOTT PROFIT</small><strong>${usd(c.reinvestedProfit || 0)}</strong><em>${waiting ? 'verified trade-re vár' : 'verified visszaforgatási alap'}</em></div><div class="card"><small>VERIFIED PAPER KIVEHETŐ PROFIT</small><strong>${usd(c.withdrawableProfit || 0)}</strong><em>nem Binance kiutalás</em></div><div class="card"><small>VERIFIED HETI PROFIT</small><strong>${usd(c.weeklyProfit || 0)}</strong><em>csak verified aktuális hét</em></div><div class="card"><small>LEGACY REFERENCIA</small><strong>${legacyClosed} trade</strong><em>${usd(legacyPnl)} korábbi szimulációs PnL • karanténban</em></div><div class="card"><small>KIVÉTELI TARTALÉK</small><strong>${usd(c.reservedForWithdrawal || c.pendingWithdrawal || 0)}</strong><em>csak verified epoch könyvelés</em></div><div class="card"><small>MÁR KIVETT PROFIT</small><strong>${usd(c.totalWithdrawn || 0)}</strong><em>verified epoch kivétel</em></div><div class="card"><small>VIRTUÁLIS KEZDŐ TŐKE</small><strong>${usd(c.initialCapital || 10000)}</strong><em>verified paper/staging alap</em></div><div class="card"><small>RISK SZORZÓ</small><strong>${Number(r.finalRiskMultiplier || 0).toFixed(3)}</strong><em>verified drawdown/winrate alapján</em></div><div class="card"><small>PROFIT SKÁLA</small><strong>${Number(r.compoundingFactor || 1).toFixed(3)}x</strong><em>verified warmup alatt max. 1.000x</em></div><div class="card"><small>TANULÁSI MÉRET</small><strong>${Number(r.learningFactor || 1).toFixed(3)}x</strong><em>verified + súlyozott történeti quality routing</em></div><div class="card"><small>PROFIT-VELOCITY</small><strong>${Number(r.profitVelocityFactor || 1).toFixed(3)}x</strong><em>PF ${Number(r.recentProfitFactor || 0).toFixed(2)}, exp/trade ${usd(r.recentExpectancyUsd || 0)}</em></div><div class="card"><small>CÉL POZÍCIÓMÉRET</small><strong>${Number(r.targetPositionSizePct || 0).toFixed(3)}%</strong><em>${S.marketDataHealth?.degraded ? 'friss marketre vár' : usd(r.nextOrderNotionalUsd || 0) + ' verified virtuális paper order'}</em></div></div>`;
}

function renderProfitVault() {
  const box = $('#profitVaultBox');
  if (box) box.innerHTML = vaultCardsHtml();
  const portfolioBox = $('#profitVaultPortfolioBox');
  if (portfolioBox) portfolioBox.innerHTML = vaultCardsHtml();
  const withdrawals = S.withdrawals || [];
  const withdrawalBox = $('#withdrawalBox');
  if (withdrawalBox) {
    withdrawalBox.innerHTML = withdrawals.length ? withdrawals.slice(0, 12).map(w => `<div class="item"><b>${escapeHtml(w.status || '-').toUpperCase()} • ${usd(w.amount)}</b><br><small>${new Date(w.time || w.created_at || Date.now()).toLocaleString('hu-HU')} • ${escapeHtml(w.note || '')}</small></div>`).join('') : '<div class="item">Még nincs kivételi tartalék.</div>';
  }
}


function pctValue(value) {
  return value === null || value === undefined || value === '' ? 'N/A' : Number(value || 0).toFixed(1) + '%';
}

function pfValue(value) {
  if (value === null || value === undefined || value === '') return 'N/A';
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '0.00x';
  if (n >= 90) return '∞';
  return n.toFixed(2) + 'x';
}

function trendLabel(value) {
  const raw = String(value || 'unknown').toLowerCase();
  if (raw.includes('javul')) return 'JAVUL';
  if (raw.includes('romlik')) return 'FIGYELNI';
  if (raw.includes('azonos minta')) return 'AZONOS MINTA';
  if (raw.includes('részleges')) return 'RÉSZLEGES';
  if (raw.includes('vegyes')) return 'VEGYES MINTA';
  if (raw.includes('nem összehasonlítható')) return 'NINCS MÉG';
  if (raw.includes('stabil')) return 'STABIL';
  return 'ADATGYŰJTÉS';
}

function trendBadgeClass(value) {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('javul') || raw.includes('stabil')) return 'ok';
  if (raw.includes('romlik') || raw.includes('figyelés')) return 'warn';
  if (raw.includes('részleges') || raw.includes('vegyes') || raw.includes('nem összehasonlítható')) return 'neutral';
  return 'neutral';
}

function compactObservationReason(reason) {
  const raw = String(reason || 'normál megfigyelés');
  const map = {
    normal_scaling: 'normál skálázás',
    active_capital_growth: 'aktív tőke nő',
    recent_winrate_supports_scale_up: 'winrate támogatja a növelést',
    recent_winrate_reduce: 'winrate óvatosság',
    learning_guard_quality_boost: 'tanult erős minta',
    learning_guard_size_reduce_no_trade_stop: 'gyengébb minta: kisebb méret',
    learning_degradation_guard_watch_reduce: 'fejlődési romlás: óvatos méret',
    learning_degradation_guard_protective_reduce: 'fejlődési romlás: védőmód',
    learning_degradation_pauses_compounding_velocity_boosts: 'romlásnál boost szünet',
    profit_velocity_strong_scale_up: 'erős profit-velocity',
    profit_velocity_positive_scale_up: 'profit alapján növelhető',
    profit_velocity_reduce: 'profit-védelem',
    profit_velocity_neutral: 'profit-velocity semleges',
    strategy_evaluation_scale_up: 'stratégiaértékelés: növelhető',
    strategy_evaluation_reduce: 'stratégiaértékelés: óvatosság',
    high_volatility_reduce: 'magas volatilitás miatt kisebb méret',
    medium_volatility_reduce: 'közepes volatilitás miatt óvatosabb méret',
    portfolio_exposure_cap_reached: 'portfólió exposure limit elérve',
    withdrawal_reserve_protected: 'kivételi tartalék védve',
    loss_streak_reduce: 'vesztes széria védelem',
    soft_drawdown_reduce: 'drawdown óvatosság',
    verified_market_warmup_legacy_boosts_disabled: 'verified minta gyűlik: legacy boostok tiltva'
  };
  if (map[raw]) return map[raw];
  let text = raw;
  Object.entries(map).forEach(([key, label]) => { text = text.replace(new RegExp(key, 'gi'), label); });
  return compactLiveUiText(text.replace(/_/g, ' '));
}

function observationWindowSourceLabel(w = {}) {
  if (w.source === 'aggregate-delta-history') return w.partialHistory ? `részleges aggregált delta • ${Number(w.historyCoveragePct || 0).toFixed(0)}% fedés` : 'teljes aggregált delta';
  if (w.source === 'count-fallback') return 'darabszám fallback';
  if (w.source === 'timestamp-window') return 'időbélyeges ablak';
  if (w.source === 'detailed-cache') return 'részletes cache';
  return w.source || 'minta';
}


function observationWindowSampleLabel(w = {}) {
  const q = w.sampleQuality || {};
  if (q.label) return q.label;
  const trades = Number(w.summary?.trades || 0);
  if (w.key === '1h' && trades > 0 && trades < 20) return 'kis minta — nem döntési alap';
  if (w.key === '6h' && trades > 0 && trades < 80) return 'korlátozott minta';
  if (w.key === '24h' && trades > 0 && trades < 160) return 'korlátozott minta';
  return trades > 0 ? 'minta OK' : 'minta gyűlik';
}

function observationWindowSampleClass(w = {}) {
  const level = String(w.sampleQuality?.level || '').toLowerCase();
  if (level === 'tiny' || level === 'empty') return 'tinySample';
  if (level === 'limited') return 'limitedSample';
  if (level === 'ok' || level === 'strong') return 'okSample';
  return '';
}

function observationWindowRangeLabel(w = {}) {
  if (!w.windowStartAt || !w.windowEndAt || !w.ms) return '';
  return `${preciseTimeLabel(w.windowStartAt, { ms: false })}–${preciseTimeLabel(w.windowEndAt, { ms: false })}`;
}

function observationWindowCards(windows = []) {
  return `<div class="cards observationWindows">${asList(windows).map(w => {
    const m = w.summary || {};
    const fallbackNote = w.fallback && w.source !== 'aggregate-delta-history' ? `fallback ${w.fallbackTrades || m.trades || 0} trade` : '';
    const sampleLabel = observationWindowSampleLabel(w);
    const sampleClass = observationWindowSampleClass(w);
    const cls = [w.source === 'aggregate-delta-history' && !w.partialHistory ? 'okSoft' : (w.source === 'count-fallback' ? 'warnSoft' : ''), sampleClass].filter(Boolean).join(' ');
    const sourceText = [observationWindowSourceLabel(w), observationWindowRangeLabel(w), fallbackNote, w.fallbackReason].filter(Boolean).join(' • ');
    return `<div class="card ${cls}"><small>${escapeHtml(w.label || w.key)}</small><strong>${pctValue(m.winRate)}</strong><em>${escapeHtml(m.trades || 0)} trade • PF ${escapeHtml(pfValue(m.profitFactor))}</em><em>Net PnL: ${usd(m.netPnl || 0)}</em><em class="sampleLine">${escapeHtml(sampleLabel)}</em><em class="sourceLine">${escapeHtml(sourceText)}</em></div>`;
  }).join('')}</div>`;
}


function observationSetupLabel(value = '') {
  const raw = String(value || '').trim();
  const norm = raw.toUpperCase().replace(/[_-]+/g, ' ');
  const map = {
    'TRENDING BULL': 'Emelkedő trend',
    'TRENDING BEAR': 'Eső trend',
    'RANGE': 'Oldalazó piac',
    'RISK OFF': 'Risk-off védelem',
    'RISK ON': 'Risk-on piac',
    'BREAKOUT': 'Kitörés',
    'MEAN REVERSION': 'Visszatérés átlaghoz',
    'MOMENTUM': 'Momentum'
  };
  return map[norm] || norm.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
}

function observationSideLabel(value = '') {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'BUY' || raw === 'LONG') return 'LONG / vétel';
  if (raw === 'SELL' || raw === 'SHORT') return 'SHORT / eladás';
  return raw || '-';
}

function observationRegimeLabel(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  const map = { high: 'magas confidence', medium: 'közepes confidence', low: 'alacsony confidence', volatile: 'volatilis', calm: 'nyugodt' };
  return map[raw] || (raw ? raw.replace(/_/g, ' ') : '-');
}

function observationKeyHtml(key = '') {
  const raw = String(key || '-');
  const parts = raw.split('|').map(x => x.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const [setup, symbol, side, regime] = parts;
    return `<span class="setupKey"><b>${escapeHtml(observationSetupLabel(setup))}</b><small>${escapeHtml(symbol || '')} • ${escapeHtml(observationSideLabel(side))}${regime ? ' • ' + escapeHtml(observationRegimeLabel(regime)) : ''}</small></span>`;
  }
  return `<span class="setupKey"><b>${escapeHtml(raw.replace(/_/g, ' '))}</b></span>`;
}

function observationMetric(label, value) {
  return `<span class="obsMetric"><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></span>`;
}

function observationTable(title, rows = [], empty = 'Még nincs elég minta.', options = {}) {
  const limit = options.limit || 8;
  const safeRows = asList(rows);
  const body = safeRows.length ? `<div class="obsList">${safeRows.slice(0, limit).map(r => {
    const reason = r.reason ? `<small class="tableReason obsReason">${escapeHtml(r.reason)}</small>` : '';
    return `<div class="obsRow"><div class="obsMain">${observationKeyHtml(r.key || '-')}${reason}</div><div class="obsMetrics">${observationMetric('Trade', r.trades || 0)}${observationMetric('Winrate', pctValue(r.winRate))}${observationMetric('PF', pfValue(r.profitFactor))}${observationMetric('Net PnL', usd(r.netPnl || 0))}${observationMetric('Pont', Number(r.score || 0).toFixed(1))}</div></div>`;
  }).join('')}</div>` : `<div class="item">${escapeHtml(empty)}</div>`;
  return `<div class="observationTable"><h4>${escapeHtml(title)}</h4>${body}</div>`;
}

function confidenceCalibrationTable(rows = []) {
  const safeRows = asList(rows);
  const body = safeRows.length ? `<table class="miniTable calibrationTable"><thead><tr><th>Sáv</th><th>Trade</th><th>Valós WR</th><th>Átlag conf.</th><th>Eltérés</th></tr></thead><tbody>${safeRows.slice(0, 8).map(r => {
    const gap = Number(r.calibrationGap || 0);
    const gapLabel = (gap > 0 ? '+' : '') + gap.toFixed(1) + '%';
    return `<tr><td>${escapeHtml(r.bucket || '-')}</td><td>${escapeHtml(r.samples || 0)}</td><td>${pctValue(r.actualWinRate)}</td><td>${pctValue(r.expectedWinRate)}</td><td>${escapeHtml(gapLabel)}</td></tr>`;
  }).join('')}</tbody></table>` : '<div class="item">Még nincs kalibrációs minta.</div>';
  return `<div class="observationTable"><h4>Confidence kalibráció</h4>${body}<small class="tableReason">Pozitív eltérés = a confidence optimistább volt, mint a valós találati arány.</small></div>`;
}

function renderRegistryPolicyDetails(registry={}) {
  const search=S.continuousRetraining?.lastResult?.policySearch || {},risk=S.portfolioRisk2 || {},equity=S.equityCurvePolicy || {};
  const stateLabels={candidate:'kísérleti',validated:'validált',champion:'champion',retired:'visszavont'};
  const rows=asList(registry.entries).slice(0,30).map(e=>`<tr><td>${escapeHtml(e.id)}${e.revalidationOf?`<br><small>Újraértékelés: ${escapeHtml(e.revalidationOf)}</small>`:''}</td><td>${escapeHtml(stateLabels[e.status] || e.status)}</td><td>${Number(e.prospectiveEvidence?.rows || 0)} / PF ${Number(e.prospectiveEvidence?.metrics?.profitFactor || 0).toFixed(2)}</td><td>${e.riskIncreaseEligible?'Saját route proof is szükséges':'Nincs kockázatemelés'}${e.status==='retired'?`<br><button class="mini" data-revalidate-model="${escapeHtml(e.id)}">Új paper értékelés</button>`:''}</td></tr>`).join('');
  const experiments=asList(registry.entries).filter(e=>e.paperRuntime).map(e=>`<div class="item"><b>Önálló paper stratégia: ${escapeHtml(e.artifact?.scope?.venue)} ${escapeHtml(e.artifact?.scope?.symbol)}</b><br><small>${escapeHtml(e.artifact?.policy?.family)} • ${escapeHtml(e.paperRuntime.status)} • ${e.paperRuntime.closedTradesCount ?? e.paperRuntime.trades?.length ?? 0} lezárt • nettó ${usd(e.paperRuntime.realizedNetPnl)} • külön virtuális keret ${usd(e.paperRuntime.equityUsd)}<br>Utolsó saját tick: ${escapeHtml(preciseTimeLabel(e.paperRuntime.lastQuoteAt,{missing:'még nincs'}))} • ${e.paperRuntime.state?.position?'nyitott paper pozíció':'nincs nyitott pozíció'} • fő számla PnL-jétől külön</small></div>`).join('');
  const events=asList(registry.events).slice(0,12).map(e=>`<li>${escapeHtml(preciseTimeLabel(e.at,{missing:'nincs időbélyeg'}))} • ${escapeHtml(e.type)} • ${escapeHtml(e.modelId || '-')}</li>`).join('');
  return `<details id="registryPolicyDetails"${S.registryPolicyDetailsOpen?' open':''}><summary>Modellek, validáció és kockázati keret</summary><p>Aktív kísérlet: ${escapeHtml(registry.experimentId || 'még nincs')} • mentés: ${escapeHtml(S.learningDurability?.status || 'még nem igazolt')}</p><div style="overflow:auto"><table style="width:100%;overflow-wrap:anywhere"><thead><tr><th>Modell</th><th>Állapot</th><th>Saját forward minta</th><th>Jogosultság</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Még nincs modell.</td></tr>'}</tbody></table></div><p>Paraméterkeresés: ${Number(search.variants || 0)} /6 változat • train-only kiválasztás • külön holdout • élő jogosultság nincs.</p><p>Portfóliókockázat: ${risk.passed===false?'blokkolt':risk.passed===true?'értékelt':'még nincs értékelés'} • korrelált exposure ${usd(risk.globalCorrelatedRiskUsd || 0)} • ${escapeHtml(asList(risk.failures).join(', ') || 'hiányzó korreláció: konzervatív 1')}</p><p>Equity: ${Number(equity.trades || 0)} saját minta • compounding ${equity.qualified?'jogosult':'nem jogosult'} • faktor ${Number(equity.riskMultiplier || 1).toFixed(3)}. LIVE tiltva.</p>${experiments}<ul>${events}</ul></details>`;
}
async function revalidateRetiredModel(id) {
  try {const result=await api('/api/models/revalidation',{id});S.modelRegistry=result.registry;renderLearningObservation();toast(result.created?'Új, saját forward mintát igénylő paper értékelés létrehozva.':'A meglévő újraértékelési kísérlet megmaradt.');}
  catch(error){toast('Újraértékelés: '+(error.message || 'hiba'));}
}

function renderLearningObservation() {
  const box = $('#learningObservationBox');
  if (!box) return;
  const o = S.learningObservation || {};
  const trend = o.trend || {};
  const c = o.compounding || {};
  const rg = o.riskGate || {};
  const ad = o.aggregateDelta || {};
  const scope = o.observationScope || {};
  const dg = o.degradationGuard || {};
  const sc = o.strategyScorecard || {};
  const historical = S.marketIntegrity?.historicalLearning || {};
  const mh = S.marketLearningHeartbeat || {};
  const wf = mh.lastWalkForward || {};
  const wfText = Number(mh.walkForwardValidations || 0) > 0
    ? ` • WF értékelés: ${escapeHtml(mh.walkForwardApproved || 0)} szigorú / ${escapeHtml(mh.walkForwardProvisionalApproved || 0)} kontrollált exploration / ${escapeHtml(mh.walkForwardRejected || 0)} kizárt / ${escapeHtml(mh.walkForwardValidations || 0)} ténylegesen értékelt • kihagyott ciklus ${escapeHtml(mh.walkForwardSkipped || 0)} • utolsó ${escapeHtml(wf.validationTier || '-')} / ${escapeHtml(wf.sampleCount || 0)} minta / ${Number(wf.hitRate || 0).toFixed(1)}% hit / PF ${Number(wf.profitFactor || 0).toFixed(2)} / ${Number(wf.averageNetPct || 0).toFixed(4)}% átlag / hasonlóság ${Number(wf.averageSimilarity || 0).toFixed(0)}%`
    : ` • WF tényleges értékelés még gyűlik • kihagyott ciklus ${escapeHtml(mh.walkForwardSkipped || 0)}`;
  const marketLearningLine = Number(mh.observations || 0) > 0
    ? `<div class="observationNote"><b>Élő piaci tanulás:</b> ${escapeHtml(mh.status || 'adatgyűjtés')} • ${escapeHtml(mh.trustedObservations || 0)} friss public minta • ${escapeHtml(mh.technicalReadyObservations || 0)} technikailag kész minta • utolsó: ${escapeHtml(mh.lastSymbol || '-')} / ${escapeHtml(String(mh.lastSourceVenue || '-').toUpperCase())} / ${escapeHtml(mh.lastMomentumSide || 'HOLD')} ${Number(mh.lastMomentumScore || 0).toFixed(1)} pont${wfText}.</div>`
    : `<div class="observationNote warn"><b>Élő piaci tanulás:</b> még nincs friss public megfigyelés. A bot nem nyit trade-et stale vagy szimulált árból.</div>`;
  const detailedHistorical = Number(historical.acceptedDetailedTrades ?? scope.detailedClosedTrades ?? 0);
  const aggregateHistorical = Number(historical.aggregateFallbackTrades ?? Math.max(0, Number(scope.totalClosedTrades || 0) - detailedHistorical));
  const historyAvailabilityLine = aggregateHistorical > 0 && aggregateHistorical > detailedHistorical
    ? `<div class="observationNote warn"><b>Történeti adatok valós elérhetősége:</b> a Supabase-ben jelenleg ${escapeHtml(detailedHistorical)} részletes régi trade rekord maradt. További ${escapeHtml(aggregateHistorical)} korábbi trade csak aggregált tanulási priorként áll rendelkezésre; a már törölt szimbólum-, stratégia- és belépési részletek nem állíthatók vissza. Az új trade-ek részletesen és védetten kerülnek mentésre.</div>`
    : '';
  const status = statusWord(o.status || 'not-run');
  const deltaLine = ad.historyPoints ? `Aggregált delta história: ${escapeHtml(ad.historyPoints)} pont • ${escapeHtml(statusWord(ad.status || 'gyűlik'))} • ${escapeHtml(ad.note || '')}` : 'Aggregált delta história most indul.';
  const protection = scope.monotonicProtection || {};
  const protectionLine = protection.active ? ` • Lezárt trade számláló védve: részleges olvasás ${escapeHtml(protection.incomingClosedTrades || 0)}, megőrzött érték ${escapeHtml(protection.protectedClosedTrades || scope.totalClosedTrades || 0)}` : '';
  const shortWindowLine = trend.shortWindowLowSample && trend.shortWindowNote ? `<br><small>${escapeHtml(trend.shortWindowNote)}</small>` : '';
  const degradationLine = dg.active ? `<div class="observationNote warn"><b>Fejlődési romlás őr aktív:</b> ${escapeHtml(dg.action || dg.status || 'óvatos méretezés')}<br><small>Friss ablak: ${escapeHtml(dg.shortWindow?.label || '-')} ${pctValue(dg.shortWindow?.winRate)} / referencia: ${escapeHtml(dg.referenceWindow?.label || '-')} ${pctValue(dg.referenceWindow?.winRate)} • esés: ${escapeHtml(dg.dropPct || 0)}% • méret faktor: ${Number(dg.sizeFactor || 1).toFixed(3)}x</small></div>` : '';
  const scopeNote = scope.fallbackActive || Number(scope.aggregateVsCacheGap || 0) > 0 || ad.historyPoints || protection.active || trend.shortWindowLowSample ? `<div class="observationNote"><b>Mérési megjegyzés:</b> ${escapeHtml(scope.note || 'A részletes cache és a teljes aggregált statisztika eltérhet.')} ${scope.countFallbackActive ? 'A darabszám fallback csak becslés; a pontosabb delta história mostantól gyűlik.' : ''}${shortWindowLine}<br><small>Teljes aggregált: ${escapeHtml(scope.totalClosedTrades || 0)} trade / ${pctValue(scope.totalWinRate)} • részletes minta: ${escapeHtml(scope.detailedClosedTrades || 0)} trade / ${pctValue(scope.detailedWinRate)} • ${escapeHtml(deltaLine + protectionLine)}</small></div>` : '';
  const scorecardNote = `<div class="observationNote"><b>Strategy Scorecard 2.0:</b> ${escapeHtml(sc.note || 'Részletes route-minta gyűjtése folyamatban.')}<br><small>Authority: ${escapeHtml(sc.authority || 'observe-only')} • részletes trade: ${escapeHtml(sc.totalDetailedTrades || 0)} • minimum minta/route: ${escapeHtml(sc.minSamples || 8)} • összes PF: ${pfValue(sc.overall?.profitFactor)} • expectancy/trade: ${usd(sc.overall?.expectancyUsd || 0)}. A scorecard ebben a verzióban nem blokkol és nem méretez ordert.</small></div>`;
  const mr = S.modelRegistry || {};
  const cr = S.continuousRetraining || {};
  const qa2 = S.strategyQualityAutopilot2 || {};
  const mi2 = S.marketIntelligence2 || {};
  const opp = S.opportunityRanking || {};
  const cap = S.exchangeCapabilityRegistry || {};
  const stress = S.marketStressValidation || {};
  const sim = S.marketSimulationLab || {};
  const glc = S.globalLearningCoordinator || {};
  const micro = S.microstructureIntelligence || {};
  const funding = S.fundingIntelligence || {};
  const selectedMarket = mi2.lastSelected ? `${String(mi2.lastSelected.venue || '-').toUpperCase()} ${mi2.lastSelected.symbol || '-'}` : '-';
  const selectedRoute = mi2.lastSelected ? (mi2.routes?.[`${String(mi2.lastSelected.venue || '').toLowerCase()}|${mi2.lastSelected.symbol}`] || {}) : {};
  const selectedMicro = mi2.lastSelected ? (micro.routes?.[`${String(mi2.lastSelected.venue || '').toLowerCase()}|${mi2.lastSelected.symbol}`] || {}) : {};
  const selectedFunding = mi2.lastSelected ? (funding.routes?.[`${String(mi2.lastSelected.venue || '').toLowerCase()}|${mi2.lastSelected.symbol}`] || {}) : {};
  const intelligenceNote = `<div class="observationNote"><b>Market Intelligence 2.0:</b> ${escapeHtml(selectedMarket)} • rezsim ${escapeHtml(selectedRoute.regimeTransition?.effectiveRegime || '-')} (${escapeHtml(selectedRoute.regimeTransition?.phase || 'warmup')}) • MTF ${escapeHtml(selectedRoute.multiTimeframe?.consensusSide || 'HOLD')} ${Number(selectedRoute.multiTimeframe?.alignmentPct || 0).toFixed(0)}% • cross-market ${escapeHtml(selectedRoute.crossMarket?.marketBias || 'mixed')}<br><small>Opportunity: ${escapeHtml(opp.selected?.symbol || '-')} / ${escapeHtml(opp.selected?.side || 'HOLD')} • stress ${escapeHtml(stress.state || selectedRoute.marketStressValidation?.state || 'warmup')} ${Number(stress.score || selectedRoute.marketStressValidation?.score || 0).toFixed(0)}/100 • Simulation Lab resilience ${Number(sim.summary?.resilienceScore || 0).toFixed(0)}/100 (nem verified bizonyíték) • Global learning: ${escapeHtml(glc.transferablePatterns || 0)} átvihető minta, csak shadow ranking • orderbook: ${escapeHtml(selectedMicro.orderbook?.dataStatus || 'nincs validált depth')} • funding: ${escapeHtml(selectedFunding.status || 'nem alkalmazható/hiányzik')} • capability registry: ${escapeHtml(Object.keys(cap.venues || {}).length)} venue. Ezek a rétegek rangsorolnak és kockázatot módosítanak; önálló live belépési authorityt nem kapnak.</small></div>`;
  const registryNote = `<div class="observationNote"><b>Model Registry:</b> champion ${escapeHtml(mr.champion?.id || 'még nincs')} • candidate ${escapeHtml(mr.counts?.candidate || 0)} • validated ${escapeHtml(mr.counts?.validated || 0)} • retired ${escapeHtml(mr.counts?.retired || 0)}<br><small>Continuous retraining: ${escapeHtml(cr.running ? 'fut' : (cr.lastResult?.skipped ? cr.lastResult?.reason : cr.lastRunAt ? 'legutóbb lefutott' : 'még nem futott'))} • Strategy Quality Autopilot 2.0: ${escapeHtml(qa2.status || 'warmup')} • authority: ${escapeHtml(qa2.authority || 'bounded-risk-only')}</small></div>`;
  box.innerHTML = `<div class="supabaseHeader"><div><b>Fejlődés megfigyelése</b><small>${escapeHtml(o.summary || 'Még nincs megfigyelési adat.')}</small></div><span class="badge ${trendBadgeClass(trend.winRateDirection)}">${escapeHtml(status)}</span></div>${marketLearningLine}${observationWindowCards(o.windows || [])}${historyAvailabilityLine}${degradationLine}${scopeNote}${scorecardNote}${registryNote}${renderRegistryPolicyDetails(mr)}${intelligenceNote}<div class="cards"><div class="card"><small>WINRATE TREND</small><strong>${escapeHtml(trendLabel(trend.winRateDirection))}</strong><em>${escapeHtml(trend.winRateBasis || trend.winRateDirection || 'adatgyűjtés')}</em></div><div class="card"><small>PROFIT FACTOR TREND</small><strong>${escapeHtml(trendLabel(trend.profitFactorDirection))}</strong><em>${escapeHtml(trend.profitFactorBasis || trend.profitFactorDirection || 'adatgyűjtés')}</em></div><div class="card ${(Number(ad.windowsReady || 0) === 0 && Number(ad.historyPoints || 0) > 0) ? 'limitedSample' : ''}"><small>AGGREGÁLT DELTA</small><strong>${Number(ad.windowsReady || 0) > 0 ? escapeHtml((ad.windowsReady || 0) + '/3 teljes') : 'delta gyűlik'}</strong><em>${escapeHtml(ad.partialWindows || ad.windowsWithTrades || 0)} részleges • ${escapeHtml(ad.historyPoints || 0)} pont</em></div><div class="card ${Number(rg.samples || 0) < 20 ? 'limitedSample' : ''}"><small>RISK GATE BLOKK</small><strong>${Number(rg.blockRate || 0).toFixed(1)}%</strong><em>${escapeHtml(rg.blocked || 0)} blokk / ${escapeHtml(rg.samples || 0)} minta • ${escapeHtml(rg.qualityLabel || 'minta gyűlik')}</em></div><div class="card ${dg.active ? 'limitedSample' : ''}"><small>FEJLŐDÉSI ŐR</small><strong>${escapeHtml(dg.status || 'stabil')}</strong><em>${dg.active ? `méret ${Number(dg.sizeFactor || 1).toFixed(3)}x • confidence +${escapeHtml(dg.confidenceLiftPct || 0)}%` : 'nincs bizonyított romlás'}</em></div><div class="card"><small>PROFIT-VISSZAFORGATÁS</small><strong>${Number(c.compoundingFactor || 1).toFixed(3)}x</strong><em>aktív tőke: ${usd(c.activeTradingCapital || 0)}</em></div><div class="card"><small>PROFIT-VELOCITY</small><strong>${Number(c.profitVelocityFactor || 1).toFixed(3)}x</strong><em>PF ${pfValue(c.recentProfitFactor)} • exp/trade ${usd(c.recentExpectancyUsd || 0)}</em></div><div class="card"><small>VIRTUÁLIS KÖVETKEZŐ ORDER</small><strong>${usd(c.nextOrderNotionalUsd || 0)}</strong><em>paper/staging méret, nem Binance order • ${Number(c.targetPositionSizePct || 0).toFixed(3)}%</em></div></div><div class="observationNote"><b>Következő döntés:</b> ${escapeHtml(o.nextObservation || trend.note || 'Várjunk további adatra.')}<br><small>Live submit továbbra is tiltva. Romlásnál a rendszer nem állítja le a botot, hanem automatikusan méretet csökkent és szünetelteti a virtuális boostokat.</small></div><div class="observationGrid observationMasonry">${observationTable('Legjobb symbolok', o.bestSymbols || [], 'Még nincs elég erős symbol minta.')}${observationTable('Figyelendő symbolok', o.weakSymbols || [], 'Nincs valóban gyenge symbol minta.')}${observationTable('Legjobb stratégiaminták', o.bestStrategies || [], 'Még nincs elég erős stratégiaminta.')}${observationTable('Volatilis, de profitábilis minták', o.volatileStrategies || [], 'Nincs külön volatilis-profitábilis minta.', { limit: 6 })}${observationTable('Figyelendő stratégiaminták', o.weakStrategies || [], 'Nincs valóban gyenge stratégiaminta.')}${observationTable('Strategy Scorecard — legerősebb route-ok', sc.bestRoutes || [], 'Még nincs minősített pozitív route-minta.', { limit: 8 })}${observationTable('Strategy Scorecard — figyelendő route-ok', sc.watchRoutes || [], 'Nincs minősített gyenge route-minta.', { limit: 8 })}</div><div class="observationGrid narrow">${confidenceCalibrationTable(o.confidenceCalibration || [])}<div class="observationTable"><h4>Risk gate utolsó blokkok</h4>${asList(rg.lastBlockers).length ? asList(rg.lastBlockers).map(b => `<div class="item"><b>${escapeHtml(preciseTimeLabel(b.time, { missing: 'nincs időbélyeg' }))}</b><br><small>${escapeHtml(compactLiveUiText(b.reason || 'blocked'))}</small></div>`).join('') : '<div class="item">Nincs friss risk gate blokk.</div>'}</div><div class="observationTable"><h4>Méretezési okok</h4>${asList(c.reasons).length ? asList(c.reasons).map(r => `<span class="tag">${escapeHtml(compactObservationReason(r))}</span>`).join('') : '<div class="item">Normál méretezés.</div>'}</div></div>`;
  const details=box.querySelector('#registryPolicyDetails');if(details)details.addEventListener('toggle',()=>{S.registryPolicyDetailsOpen=details.open;});
  box.querySelectorAll('[data-revalidate-model]').forEach(button=>button.addEventListener('click',()=>revalidateRetiredModel(button.dataset.revalidateModel)));

}

async function refreshLearningObservation() {
  try {
    const result = await api('/api/learning/observation?run=true', {});
    if (result.learningObservation) S.learningObservation = result.learningObservation;
    toast(result.message || 'Tanulási megfigyelő frissítve.');
    await refresh();
  } catch (error) {
    toast('Megfigyelő hiba: ' + (error.message || 'API hiba'));
  }
}


function renderStrategyGraphSvg(graph={}) {
  const nodes=asList(graph.nodes).slice(0,20),edges=asList(graph.edges).slice(0,40);
  const positions=new Map(nodes.map((n,i)=>[n.id,{x:20+(Math.floor(i/2)%2?1-i%2:i%2)*290,y:25+Math.floor(i/2)*115}]));
  const height=Math.max(160,Math.ceil(nodes.length/2)*115+30);
  const links=edges.map(e=>{const a=positions.get(e.from),b=positions.get(e.to);if(!a || !b)return '';
    const sameRow=a.y===b.y,right=b.x>a.x;
    const x1=sameRow?(right?a.x+250:a.x):a.x+125,y1=sameRow?a.y+31:a.y+62;
    const x2=sameRow?(right?b.x:b.x+250):b.x+125,y2=sameRow?b.y+31:b.y;
    return `<path d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="#75b697" stroke-width="2" marker-end="url(#nexus-strategy-arrow)"/>`;}).join('');
  const boxes=nodes.map(n=>{const p=positions.get(n.id);return `<g><title>${escapeHtml(String(n.label))}</title><rect x="${p.x}" y="${p.y}" width="250" height="62" rx="12" fill="#152c35" stroke="#61dc78"/><text x="${p.x+125}" y="${p.y+35}" text-anchor="middle" fill="#edf8f0" font-size="12">${escapeHtml(String(n.label).slice(0,38))}</text></g>`;}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Stratégia adat- és védelmi kapui" viewBox="0 0 580 ${height}" style="width:100%;max-width:680px;height:auto;display:block;margin-top:16px"><defs><marker id="nexus-strategy-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#75b697"/></marker></defs>${links}${boxes}</svg>`;
}
function renderStrategyBuilderState(payload = null) {
  const box = $('#strategyBuilderResult');
  if (!box) return;
  const src = payload || S.strategyBuilder || {};
  const preview = src.preview || src.lastPreview || {};
  const graph = src.graph || src.lastGraph || {};
  if (!preview?.config) { box.innerHTML = 'Még nincs Strategy Builder előnézet.'; return; }
  const unresolved = asList(preview.unresolved);
  const nodes = asList(graph.nodes);
  box.innerHTML = `<b>${escapeHtml(preview.status || 'előnézet')}</b> • ${escapeHtml(preview.id || '-')}<br><small>Stratégia: ${escapeHtml(preview.config.family || '-')} • rezsim: ${escapeHtml(preview.config.regime || '-')} • irány: ${escapeHtml(preview.config.side || '-')} • timeframe: ${escapeHtml(preview.config.timeframe || '-')} • max risk: ${Number(preview.config.risk?.maxRiskPct || 0).toFixed(2)}% • indulás: ${escapeHtml(preview.config.deployment?.initialMode || 'shadow')}</small>${unresolved.length ? `<br><small>Figyelmeztetés: ${escapeHtml(unresolved.join(' | '))}</small>` : ''}${nodes.length ? `<br><small>Grafikus stratégianézet — shadow, nincs végrehajtási jogosultság</small>${renderStrategyGraphSvg(graph)}` : ''}`;
}

async function previewStrategyBuilder() {
  const text = $('#strategyBuilderText')?.value || '';
  try {
    const result = await api('/api/strategy/builder/preview', { text });
    S.strategyBuilder = { ...(S.strategyBuilder || {}), lastPreview:result.preview, lastGraph:result.graph };
    renderStrategyBuilderState(result);
    toast(result.message || 'Strategy Builder előnézet elkészült.');
  } catch (error) { toast('Strategy Builder hiba: ' + (error.message || 'API hiba')); }
}

async function simulateStrategyBuilder() {
  const text = $('#strategyBuilderText')?.value || '';
  try {
    const result = await api('/api/strategy/builder/simulate', { text });
    const box = $('#strategyBuilderResult');
    const summary = result.simulation?.summary || {};
    if (box) box.innerHTML = `<b>Shadow szimuláció kész</b> • live authority: NINCS<br><small>Szcenáriók: ${escapeHtml(summary.scenarioCount || 0)} • értékelhető: ${escapeHtml(summary.evaluableCount || 0)} • nyereséges: ${Number(summary.profitablePct || 0).toFixed(1)}% • legrosszabb DD: ${Number(summary.worstDrawdownPct || 0).toFixed(2)}% • resilience: ${Number(summary.resilienceScore || 0).toFixed(1)}/100. A szintetikus eredmény nem számít verified trade bizonyítéknak.</small>`;
    toast('Shadow szimuláció elkészült.');
  } catch (error) { toast('Szimuláció hiba: ' + (error.message || 'API hiba')); }
}

function renderModules() {
  renderStrategyControl();
  const modules = $('#moduleBox');
  if (!modules) return;
  const entries = Object.entries(S.modules || {});
  modules.innerHTML = entries.length
    ? entries.map(([k, m]) => `<div class="module"><h3>${escapeHtml(moduleNameLabel(m?.name || k))}</h3><b>${escapeHtml(statusWord(m?.status))} • ${escapeHtml(m?.score ?? '-')}%</b><p>${escapeHtml(moduleDescLabel(m?.desc || 'Moduladat betöltve.'))}</p><button data-detail="${escapeHtml(k)}">Részletek</button></div>`).join('')
    : '<div class="item">AI alrendszer adatok betöltése folyamatban...</div>';
  bindDetails();
}

function strategyControlStatusLabel(status, blocked, reduced) {
  const raw = String(status || '').toLowerCase();
  if (raw === 'protective-block' || blocked > 0) return 'Védelem aktív';
  if (raw === 'risk-reduced' || reduced > 0) return 'Óvatos méretezés';
  if (raw === 'ready' || raw === 'ok' || raw === 'running') return 'OK';
  return status || 'not-run';
}

function strategyControlModeLabel(c, blocked, reduced) {
  const raw = String(c.status || c.mode || '').toLowerCase();
  if (raw === 'protective-block' || blocked > 0) return 'Gyenge minták blokkolva — ez védelem, nem runtime hiba.';
  if (raw === 'risk-reduced' || reduced > 0) return 'Óvatosabb pozícióméret aktív.';
  return c.mode || 'observe';
}

function learningGuardStatusLabel(g = {}) {
  const raw = String(g.status || '').toLowerCase();
  if (raw === 'trade-flow-quality-routing') return 'Aktivitás + minőség routing';
  if (raw === 'quality-filtering') return 'Winrate szűrő aktív';
  if (raw === 'target-watch') return 'Cél felett, őrzés';
  if (raw === 'balanced-learning') return 'Kiegyensúlyozott tanulás';
  if (raw === 'learning-warmup') return 'Minta gyűjtés';
  return g.status || 'nincs futás';
}

function renderStrategyControl() {
  const box = $('#strategyControlBox');
  if (!box) return;
  const c = S.strategyAutopilotControl || {};
  const risk = c.riskAdjustment || {};
  const blocked = (c.blockedStrategies || []).length + (c.blockedSymbols || []).length + (c.blockedRegimes || []).length;
  const reduced = (c.reducedStrategies || []).length + (c.reducedSymbols || []).length + (c.reducedRegimes || []).length;
  const boosted = (c.boostedStrategies || []).length + (c.boostedSymbols || []).length + (c.boostedRegimes || []).length;
  const g = S.learningGuard || {};
  const strongLearning = (g.strongPatterns || []).length;
  const watchLearning = (g.watchPatterns || []).length;
  const guardBadgeClass = String(g.status || '').includes('filter') || watchLearning ? 'warn' : 'ok';
  const badgeClass = blocked || reduced ? 'warn' : 'ok';
  const statusLabel = strategyControlStatusLabel(c.status, blocked, reduced);
  const modeLabel = strategyControlModeLabel(c, blocked, reduced);
  const learningLabel = learningGuardStatusLabel(g);
  box.innerHTML = `<div class="supabaseHeader"><div><b>Stratégia-minőség autopilot</b><small>${escapeHtml(c.actionLabel || 'Még nincs strategy control futás.')}</small></div><span class="badge ${badgeClass}">${escapeHtml(statusLabel)}</span></div><div class="cards"><div class="card"><small>MINŐSÉG PONTSZÁM</small><strong>${escapeHtml(c.healthScore ?? '-')}%</strong><em>${escapeHtml(modeLabel)}</em></div><div class="card"><small>RISK SZORZÓ</small><strong>${Number(risk.riskMultiplier || 1).toFixed(2)}</strong><em>bizalom +${Number(risk.minConfidenceAdjustment || 0).toFixed(1)}%</em></div><div class="card"><small>Blokkolt minták</small><strong>${blocked}</strong><em>védelmi tiltás, nem hiba</em></div><div class="card"><small>Visszafogott minták</small><strong>${reduced}</strong><em>óvatos méretezés</em></div><div class="card"><small>Erős minták</small><strong>${boosted}</strong><em>csak proof alapján</em></div></div><div class="supabaseHeader mini"><div><b>Winrate tanulási guard</b><small>${escapeHtml(g.actionLabel || 'Még nincs tanulási guard futás.')}</small></div><span class="badge ${guardBadgeClass}">${escapeHtml(learningLabel)}</span></div><div class="cards"><div class="card"><small>CÉL WINRATE</small><strong>${escapeHtml(g.targetWinRate ?? 82)}%</strong><em>cél, nem garancia</em></div><div class="card"><small>TRADE AKTIVITÁS</small><strong>${g.tradeFlowProtection === false ? 'SZŰRŐ' : 'TARTVA'}</strong><em>${escapeHtml(g.sizingPolicy || 'méretezéssel tanul')}</em></div><div class="card"><small>ADAPTÍV KÜSZÖB</small><strong>${escapeHtml(g.confidenceFloor ?? '-')}%</strong><em>hard blokk csak ${escapeHtml(g.hardBlockConfidence ?? 58)}% alatt</em></div><div class="card"><small>AKTUÁLIS WINRATE</small><strong>${g.currentWinRate == null ? 'N/A' : escapeHtml(g.currentWinRate) + '%'}</strong><em>${escapeHtml(g.sampleCount ?? 0)} lezárt trade alapján${g.currentWinRateEstimated ? ' • részletes minta' : ''}</em></div><div class="card"><small>ERŐS TANULT MINTÁK</small><strong>${strongLearning}</strong><em>nagyobb prioritás/méret</em></div><div class="card"><small>FIGYELT / GYENGE MINTÁK</small><strong>${watchLearning}</strong><em>kisebb méret, nem trade-stop</em></div></div><div class="actions"><button data-strategy-control class="primary">Stratégia kontroll frissítés</button><button data-action="strategy-evaluate">Stratégiaértékelés</button><button data-action="learning-guard">Winrate guard frissítés</button></div>`;
}

async function runStrategyControl() {
  try {
    const result = await api('/api/strategy/autopilot-control', {});
    if (result.strategyAutopilotControl || result.control) S.strategyAutopilotControl = result.strategyAutopilotControl || result.control;
    if (result.learningGuard) S.learningGuard = result.learningGuard;
    toast(result.message || 'Strategy quality autopilot frissítve.');
    await refresh();
  } catch (error) {
    toast('Strategy control hiba: ' + (error.message || 'API hiba'));
    await refresh().catch(() => {});
  }
}

async function loadOrderJournalView() {
  if (orderViewLoadBusy) return;
  orderViewLoadBusy = true;
  try {
    const result = await api('/api/trades/journal?limit=100');
    if (Array.isArray(result.trades)) S.tradeJournal = result.trades;
    if (Array.isArray(result.orders)) S.orders = result.orders;
    if (result.orderViewSource) S.orderViewSource = result.orderViewSource;
    if (result.metrics) S.metrics = { ...(S.metrics || {}), ...result.metrics };
    renderOrders();
  } catch (error) {
    console.warn('Order/journal részletes betöltés hiba', error);
    renderOrders(error);
  } finally {
    orderViewLoadBusy = false;
  }
}

async function loadLearningObservationView() {
  if (observationViewLoadBusy) return;
  const current = S.learningObservation || {};
  if (asList(current.windows).length && current.summary) {
    renderLearningObservation();
  renderStrategyBuilderState();
    return;
  }
  observationViewLoadBusy = true;
  const box = $('#learningObservationBox');
  if (box && !box.innerHTML.trim()) box.innerHTML = '<div class="item">Tanulási megfigyelő adatok betöltése...</div>';
  try {
    const result = await api('/api/learning/observation');
    if (result.learningObservation) S.learningObservation = result.learningObservation;
    renderLearningObservation();
  renderStrategyBuilderState();
  } catch (error) {
    console.warn('Tanulási megfigyelő részletes betöltés hiba', error);
    if (box) box.innerHTML = `<div class="item">A tanulási nézet átmenetileg nem tölthető be: ${escapeHtml(error.message || 'API hiba')}</div>`;
  } finally {
    observationViewLoadBusy = false;
  }
}

function frontendBooleanTrue(value) {
  if (value === true || value === 1) return true;
  return ['true', '1', 'yes', 'on', 'ok', 'verified', 'trusted'].includes(String(value ?? '').trim().toLowerCase());
}

function frontendIntegrityVersion(value) {
  const match = String(value || '').match(/v199[_-](\d+)/i);
  return match ? Number(match[1]) : 0;
}


function frontendNormalizeSymbol(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function frontendTradeSymbolPriceIntegrity(trade = {}) {
  const status = [trade.status, trade.integrityStatus, trade.quarantineReason].map(value => String(value || '').toLowerCase()).join(' ');
  if (trade.quarantined === true || /quarantin|cross[_ -]?symbol|symbol[_ -]?price[_ -]?mismatch/.test(status)) return { ok: false, reason: trade.quarantineReason || 'karantén' };
  const symbol = frontendNormalizeSymbol(trade.symbol || trade.marketSymbol || '');
  const snapshotSymbols = [
    trade.entryMarketSymbol, trade.entrySnapshotSymbol, trade.entryMarketSnapshot?.symbol, trade.marketSnapshotAtEntry?.symbol, trade.marketSnapshot?.symbol,
    trade.exitMarketSymbol, trade.exitSnapshotSymbol, trade.exitMarketSnapshot?.symbol, trade.marketSnapshotAtExit?.symbol, trade.reconcileMarketSnapshot?.symbol
  ].map(frontendNormalizeSymbol).filter(Boolean);
  if (symbol && snapshotSymbols.some(value => value !== symbol)) return { ok: false, reason: 'market-snapshot-symbol-mismatch' };
  const version = Math.max(frontendIntegrityVersion(trade.journalIntegrityVersion || trade.marketIntegrityVersion || trade.epochVersion), frontendIntegrityVersion(trade.strategyVersion));
  const entry = Number(trade.entryPrice || trade.openPrice || trade.avgEntryPrice || 0);
  const exit = Number(trade.exitPrice || trade.closePrice || trade.avgExitPrice || 0);
  const openedMs = Date.parse(trade.openedAt || trade.entryTime || trade.time || '');
  const closedMs = Date.parse(trade.closedAt || trade.exitTime || trade.created_at || '');
  const holdingMs = Number.isFinite(Number(trade.holdingMs)) ? Math.max(0, Number(trade.holdingMs)) : (Number.isFinite(openedMs) && Number.isFinite(closedMs) && closedMs >= openedMs ? closedMs - openedMs : 0);
  const movePct = entry > 0 && exit > 0 ? Math.abs(exit / entry - 1) * 100 : 0;
  const maxMove = holdingMs <= 15 * 60 * 1000 || holdingMs === 0 ? 12 : holdingMs <= 60 * 60 * 1000 ? 20 : holdingMs <= 6 * 60 * 60 * 1000 ? 40 : 70;
  if (version >= 141 && movePct > maxMove) return { ok: false, reason: 'implausible-cross-symbol-price-move', movePct };
  return { ok: true, reason: 'ok' };
}

function frontendVerifiedTradeEvidence(trade = {}) {
  const symbolPriceIntegrity = frontendTradeSymbolPriceIntegrity(trade);
  if (!symbolPriceIntegrity.ok) return { verified: false, strict: false, recovered: false, reason: symbolPriceIntegrity.reason, quarantined: true };
  const version = frontendIntegrityVersion(trade.journalIntegrityVersion || trade.marketIntegrityVersion || trade.epochVersion);
  const trusted = [
    trade.marketDataTrusted,
    trade.entryMarketDataTrusted,
    trade.marketSnapshot?.marketDataTrusted,
    trade.marketDataQuality?.learningTrusted,
    trade.marketSnapshot?.marketDataQuality?.learningTrusted
  ].some(frontendBooleanTrue);
  const sources = [trade.priceSource, trade.marketSource, trade.entryPriceSource, trade.exitPriceSource, trade.marketSnapshot?.source, trade.marketSnapshot?.priceSource]
    .map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
  const transports = [trade.marketTransport, trade.entryMarketTransport, trade.exitMarketTransport, trade.marketSnapshot?.marketTransport, trade.marketSnapshot?.transport]
    .map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
  const sourceOk = sources.some(value => ['live_public', 'live-public', 'public_live', 'public-live'].includes(value));
  const transportOk = transports.some(value => ['websocket', 'ws', 'rest'].includes(value));
  const pricesOk = Number(trade.entryPrice || trade.openPrice || trade.avgEntryPrice || 0) > 0 && Number(trade.exitPrice || trade.closePrice || trade.avgExitPrice || 0) > 0;
  const provenance = [trade.source, trade.proofSource, trade.fillState, trade.status, trade.journalStatus, ...asList(trade.lifecycle)].map(value => String(value || '')).join(' ').toLowerCase();
  const recoveryProof = version >= 137 && (/paper\s*\+\s*proof|verified[ _-]?market|fresh[ _-]?market|journal[ _-]?saved/.test(provenance)
    || frontendBooleanTrue(trade.verifiedMarketEpoch)
    || frontendBooleanTrue(trade.marketProofVerified)
    || frontendBooleanTrue(trade.publicMarketProof));
  const strict = version >= 131 && trusted && sourceOk && transportOk && pricesOk;
  const recovered = !strict && version >= 131 && trusted && transportOk && pricesOk && recoveryProof;
  return { verified: strict || recovered, strict, recovered, reason: strict ? 'strict' : recovered ? 'rehydrated-compatible' : 'incomplete' };
}

function orderHasExternalExchangeProof(order = {}) {
  const source = String(order.source || order.provenance || '').toLowerCase();
  const status = String(order.status || order.currentStep || '').toUpperCase();
  return order.realTestnetSubmitted === true || order.testnetRealSubmit === true
    || Boolean(order.exchangeOrderId || order.externalOrderId || order.binanceOrderId)
    || /real[-_ ]?testnet|live[-_ ]?submit|exchange[-_ ]?submit/.test(source)
    || /TESTNET_ORDER_ACCEPTED|LIVE_ORDER_ACCEPTED|EXCHANGE_ORDER_ID/.test(status)
    || String(order.mode || '').toLowerCase() === 'live';
}

function lifecycleDisplayLabel(step, external) {
  if (external) return step;
  const map = {
    ORDER_SUBMITTED: 'LOCAL_INTENT_RECORDED',
    EXCHANGE_ACCEPTED: 'LOCAL_SIMULATION_ACCEPTED',
    ORDER_PARTIALLY_FILLED: 'SIMULATED_PARTIAL_FILL',
    ORDER_FILLED: 'SIMULATED_FILL',
    POSITION_OPENED: 'SIMULATED_POSITION_OPEN',
    POSITION_CLOSED: 'SIMULATED_POSITION_CLOSED'
  };
  return map[step] || step;
}

function renderOrders(loadError = null) {
  const orderBox = $('#orderBox');
  const trades = asList(S.tradeJournal);
  let orders = asList(S.orders);
  if (!orders.length && trades.length) {
    orders = trades.slice(0, 20).map(t => ({
      id: t.orderId || t.order_id || t.id,
      symbol: t.symbol || '-',
      side: t.side || '-',
      venue: t.venue || t.exchange || 'BINANCE',
      status: 'JOURNAL_SAVED',
      source: t.source || 'trade-journal-reconstructed',
      lifecycle: asList(t.lifecycle).length ? asList(t.lifecycle).filter(step => step !== 'TESTNET_ORDER_SUBMITTED' || t.realTestnetSubmitted === true || t.testnetRealSubmit === true) : ['JOURNAL_SAVED'],
      recoveredFromTradeJournal: true,
      verifiedTrade: frontendVerifiedTradeEvidence(t).verified
    }));
  }
  if (orderBox) {
    if (orders.length) {
      orderBox.innerHTML = orders.slice(0, 20).map(o => {
        const status = String(o.status || '-');
        const legacyQuarantined = status.toLowerCase().includes('quarantined') || String(o.currentStep || '').toUpperCase() === 'LEGACY_QUARANTINED';
        const verifiedEntry = frontendVerifiedTradeEvidence(o).verified;
        const externalExchangeProof = orderHasExternalExchangeProof(o);
        const simulationTag = !externalExchangeProof && !legacyQuarantined ? ' • HELYI SZIMULÁCIÓ' : '';
        const headingTag = legacyQuarantined ? ' • LEGACY KARANTÉN' : (verifiedEntry || o.verifiedTrade ? ' • VERIFIED MARKET' : '') + simulationTag;
        const detail = legacyQuarantined
          ? (o.quarantineReason || 'Régi/nem bizonyított market belépés; nem zárható le verified journalba.')
          : `${status} / ${o.source || '-'}${externalExchangeProof ? ' • külső exchange proof' : ' • nincs private exchange submit'}${o.recoveredFromTradeJournal ? ' • journalból visszaállítva' : ''}`;
        return `<div class="order ${legacyQuarantined ? 'warnSoft' : ''}"><h3>${escapeHtml(o.symbol)} • ${escapeHtml(o.side)} • ${escapeHtml(o.venue)}${escapeHtml(headingTag)}</h3><small>${escapeHtml(detail)}</small><div class="lifecycle">${asList(S.orderLifecycleTemplate).map(step => `<span class="${asList(o.lifecycle).includes(step) ? 'done' : ''}">${escapeHtml(lifecycleDisplayLabel(step, externalExchangeProof))}</span>`).join('')}</div></div>`;
      }).join('');
    } else if (Number(S.metrics?.closedTrades || 0) > 0) {
      orderBox.innerHTML = `<div class="item">${loadError ? 'A részletes order lista átmenetileg nem tölthető be.' : 'A legacy számláló megvan; verified order lifecycle új, friss public-market orderre vár.'}</div>`;
    } else {
      orderBox.innerHTML = '<div class="item">Még nincs order lifecycle. Az élő követőpanelen látszik, hogy a rendszer új belépést keres-e.</div>';
    }
  }
  const journal = $('#tradeJournal');
  if (journal) {
    if (trades.length) {
      journal.innerHTML = trades.slice(0, 80).map(t => {
        const verification = frontendVerifiedTradeEvidence(t);
        const verified = verification.verified;
        const badge = verified ? 'VERIFIED MARKET' : 'LEGACY / NEM VERIFIED';
        const note = verified ? (verification.recovered ? 'Supabase-ből kompatibilitással visszaállított verified rekord; tanulásra és verified statisztikára használható' : 'tanulásra és verified statisztikára használható') : 'referencia; csak minősített történeti súllyal használható, verified pénzügyi elszámolásból kizárva';
        return `<div class="item ${verified ? '' : 'warnSoft'}"><b>${escapeHtml(t.symbol)} ${escapeHtml(t.side)} • ${usd(t.netPnl || 0)} • ${badge}</b><br><small>${escapeHtml(t.mode || 'paper')} / ${escapeHtml(t.source || '-')} / entry ${escapeHtml(t.entryPrice ?? '-')} → exit ${escapeHtml(t.exitPrice ?? '-')} / fee ${escapeHtml(t.fee ?? '-')} / slippage ${escapeHtml(t.slippage ?? '-')} • ${note}</small></div>`;
      }).join('');
    } else if (Number(S.metrics?.closedTrades || 0) > 0) {
      journal.innerHTML = `<div class="item">${loadError ? 'A részletes trade journal átmenetileg nem tölthető be, de a legacy számláló megmaradt.' : 'Verified trade journal még üres; friss public-market lezárásra vár.'}</div>`;
    } else {
      journal.innerHTML = '<div class="item">Még nincs lezárt paper trade. A nyitott pozíció és a zárási visszaszámlálás az Állapot áttekintésen látható.</div>';
    }
  }
}

async function act(action) {
  try {
    let result;
    if (action === 'start') {
      try { result = await api('/api/runtime/hard-start', { forceUnlock: true, source: 'frontend-start-primary' }); }
      catch (firstError) {
        try { result = await api('/api/start', { forceUnlock: true, firstError: firstError.message }); }
        catch (secondError) {
          try { result = await api('/api/recovery/hard-start', { forceUnlock: true, firstError: firstError.message, secondError: secondError.message }); }
          catch (thirdError) {
            await api('/api/recovery/ready', { reason: 'frontend-start-final-ready' }).catch(() => ({}));
            result = await api('/api/recovery/unlock-start', { forceUnlock: true, firstError: firstError.message, secondError: secondError.message, thirdError: thirdError.message });
          }
        }
      }
	    } else {
	      result = await apiSoft('/api/action', { action });
	    }
	    if (result.state) S = result.state;
	    const blocked = result.ok === false || result.blocked || result.expectedBlock;
	    toast(blocked ? (result.message || ('Blokkolva: ' + action)) : (result.message || ('Végrehajtva: ' + action)));
	    await refresh();
  } catch (error) {
    toast('Hiba: ' + (error.message || 'API hiba'));
    await refresh().catch(() => {});
  }
}

async function run(name) {
  try {
    if (name === 'learning') await api('/api/learning/run', {});
    if (name === 'backtest') await api('/api/backtest/run', {});
    if (name === 'rebalance') await api('/api/rebalance/run', {});
    toast('Futtatva: ' + name);
    await refresh();
  } catch (error) {
    toast('Hiba: ' + error.message);
  }
}

async function detail(moduleName) {
  try {
    const data = await api('/api/details?module=' + encodeURIComponent(moduleName));
    $('#modalTitle').textContent = data.title;
    $('#modalTable').innerHTML = data.rows.map(r => `<tr><td>${escapeHtml(r[0])}</td><td>${escapeHtml(r[1])}</td></tr>`).join('');
    $('#modal').classList.remove('hidden');
  } catch (error) {
    toast('Hiba: ' + error.message);
  }
}

function closeModal() { $('#modal').classList.add('hidden'); }
window.closeModal = closeModal;

function bindDetails() {
  $$('[data-detail]').forEach(button => {
    if (button.dataset.bound) return;
    button.dataset.bound = '1';
    button.onclick = () => detail(button.dataset.detail);
  });
}

function latestReservedWithdrawal() {
  return (S.withdrawals || []).find(w => ['reserved','pending','requested'].includes(String(w.status || '').toLowerCase()));
}

async function reserveWithdrawal() {
  const amount = Number($('#withdrawAmount')?.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return toast('Adj meg pozitív USD összeget.');
  try {
    const result = await api('/api/capital/withdraw', { amount, note: 'manual dashboard reserve' });
    toast(result.message || `Kivételi tartalék rögzítve: ${amount.toFixed(2)} USD`);
    if ($('#withdrawAmount')) $('#withdrawAmount').value = '';
    await refresh();
  } catch (error) {
    toast('Kivételi hiba: ' + error.message);
  }
}

async function executeWithdrawal() {
  const row = latestReservedWithdrawal();
  if (!row) return toast('Nincs véglegesíthető reserved kivétel.');
  try {
    const result = await api('/api/capital/withdraw/execute', { id: row.id, note: 'manual dashboard execute' });
    toast(result.message || 'Kivétel véglegesítve.');
    await refresh();
  } catch (error) {
    toast('Véglegesítési hiba: ' + error.message);
  }
}

async function cancelWithdrawal() {
  const row = latestReservedWithdrawal();
  if (!row) return toast('Nincs törölhető reserved kivétel.');
  try {
    const result = await api('/api/capital/withdraw/cancel', { id: row.id, note: 'manual dashboard cancel' });
    toast(result.message || 'Kivételi tartalék törölve.');
    await refresh();
  } catch (error) {
    toast('Törlési hiba: ' + error.message);
  }
}

async function rebuildCapital() {
  try {
    await api('/api/capital/rebuild', {});
    toast('Capital vault újraszámolva.');
    await refresh();
  } catch (error) {
    toast('Rebuild hiba: ' + error.message);
  }
}

function updatePassphraseField() {
  const venue = String($('#venue')?.value || 'Binance').toLowerCase();
  const field = $('#passphrase');
  if (!field) return;
  const needsPassphrase = venue === 'okx';
  field.disabled = !needsPassphrase;
  field.placeholder = needsPassphrase ? 'OKX API passphrase' : 'Passphrase (csak OKX)';
  if (!needsPassphrase) field.value = '';
  field.title = needsPassphrase
    ? 'OKX API kulcshoz tartozó passphrase.'
    : 'Ehhez a tőzsdéhez nem kell passphrase. Binance esetén hagyd üresen.';
}

function exchangeTestText(test = {}, venue = 'Binance', selectedTestnet = false) {
  const priv = test.privateAuth || {};
  const pub = test.publicMarket || {};
  const sourceLabel = priv.credentialSource ? `credential forrás: ${priv.credentialSource}` : '';
  return [
    test.ok ? 'PRIVÁT API KAPCSOLAT OK' : 'PRIVÁT API KAPCSOLAT NINCS',
    `${venue}: ${priv.status || test.status?.status || test.error || '-'}`,
    `privát auth: ${priv.verified ? 'VALÓDI signed read OK' : 'NINCS BIZONYÍTVA'}`,
    `beállított mód: ${priv.mode || (selectedTestnet ? 'testnet' : 'live-readonly')}`,
    priv.detectedMode ? `felismert kulcs mód: ${priv.detectedMode}` : '',
    sourceLabel,
    `public market: ${pub.ok ? 'OK' : 'RECONNECT / VÁR'}${pub.error ? ' — ' + String(pub.error).slice(0, 300) : ''}`,
    priv.error ? `auth hiba: ${priv.error}` : '',
    priv.diagnostic?.stage ? `Binance diagnosztika: ${priv.diagnostic.stage}` : '',
    priv.diagnostic?.keyAccepted === true ? 'API kulcs elfogadva: IGEN' : '',
    priv.diagnostic?.ipRestrict !== undefined && priv.diagnostic?.ipRestrict !== null ? `IP-korlátozás: ${priv.diagnostic.ipRestrict ? 'IGEN' : 'NEM'}` : '',
    priv.diagnostic?.enableReading !== undefined && priv.diagnostic?.enableReading !== null ? `Enable Reading: ${priv.diagnostic.enableReading ? 'IGEN' : 'NEM'}` : '',
    priv.diagnostic?.enableSpotAndMarginTrading !== undefined && priv.diagnostic?.enableSpotAndMarginTrading !== null ? `Spot/Margin trading jog: ${priv.diagnostic.enableSpotAndMarginTrading ? 'IGEN' : 'NEM'}` : '',
    priv.hint || '',
    String(venue).toLowerCase() === 'okx'
      ? 'OKX: API key + API secret + passphrase szükséges.'
      : 'Passphrase nem szükséges ehhez a tőzsdéhez.',
    selectedTestnet
      ? 'Testnet pipa aktív: csak az adott tőzsde megfelelő testnet/demo kulcsa használható.'
      : 'Read-only signed teszt: account adatot olvas, ordert nem küld.'
  ].filter(Boolean).join('\n');
}

async function saveExchange() {
  const venue = $('#venue').value;
  const isOkx = String(venue || '').toLowerCase() === 'okx';
  const data = {
    venue,
    apiKey: $('#apiKey').value,
    apiSecret: $('#apiSecret').value,
    passphrase: isOkx ? $('#passphrase').value : '',
    marketType: $('#marketType').value,
    leverage: $('#leverage').value,
    testnet: $('#testnet').checked
  };
  try {
    const result = await api('/api/exchanges/save', data);
    $('#apiKey').value = '';
    $('#apiSecret').value = '';
    $('#passphrase').value = '';
    const test = result.autoTest || await apiSoft('/api/exchanges/test', { venue: data.venue });
    $('#proof').textContent = exchangeTestText(test, data.venue, data.testnet);
    toast(test.ok ? `${data.venue} privát API kapcsolat OK` : `${data.venue} kulcs mentve, de a signed auth nem sikerült`);
    await refresh();
  } catch (error) {
    $('#proof').textContent = 'Mentés/teszt hiba: ' + error.message;
    toast('Mentés/teszt hiba');
  }
}

async function testExchange() {
  const venue = $('#venue')?.value || 'Binance';
  try {
    // A sikertelen signed auth diagnosztikai eredmény, nem transport/API kivétel.
    const result = await apiSoft('/api/exchanges/test', { venue });
    $('#proof').textContent = exchangeTestText(result, venue, !!$('#testnet')?.checked);
    toast(result.ok ? 'Privát API kapcsolat OK' : 'Privát API kapcsolat nincs — részletek a panelen');
    await refresh();
  } catch (error) {
    $('#proof').textContent = 'Teszt hiba: ' + error.message;
    toast('Teszt hiba');
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-observation-refresh]');
  if (!button) return;
  event.preventDefault();
  refreshLearningObservation();
});
$$('[data-view]').forEach(button => button.onclick = () => switchView(button.dataset.view));
$$('[data-action]').forEach(button => button.onclick = () => act(button.dataset.action));
$$('[data-run]').forEach(button => button.onclick = () => run(button.dataset.run));
$$('[data-filter]').forEach(button => button.onclick = () => { currentFilter = button.dataset.filter; $$('[data-filter]').forEach(b => b.classList.toggle('active', b === button)); renderEvents(); });
document.addEventListener('click', event => {
  const button = event.target.closest('[data-supabase-check]');
  if (!button) return;
  event.preventDefault();
  runSupabasePanelCheck(button.dataset.supabaseCheck);
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-testnet-action]');
  if (!button) return;
  event.preventDefault();
  runTestnetAction(button.dataset.testnetAction);
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-promo-action]');
  if (!button) return;
  event.preventDefault();
  act(button.dataset.promoAction);
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-live-readiness-check]');
  if (!button) return;
  event.preventDefault();
  runLiveReadinessCheck();
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-live-dry-run-proof]');
  if (!button) return;
  event.preventDefault();
  runLiveDryRunProof();
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-live-env-guide]');
  if (!button) return;
  event.preventDefault();
  runLiveEnvGuide();
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-live-proof-persistence]');
  if (!button) return;
  event.preventDefault();
  runLiveProofPersistenceCheck();
});


document.addEventListener('click', event => {
  const button = event.target.closest('[data-live-rehydrate-verification]');
  if (!button) return;
  event.preventDefault();
  runLiveRehydrateVerificationCheck();
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-final-preflight-lock]');
  if (!button) return;
  event.preventDefault();
  runFinalPreflightLockCheck();
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-live-activation-decision]');
  if (!button) return;
  event.preventDefault();
  runLiveActivationDecisionGate();
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-live-private-auth-check]');
  if (!button) return;
  event.preventDefault();
  runLivePrivateAuthCheck();
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-runtime-safety-repair]');
  if (!button) return;
  event.preventDefault();
  runRuntimeSafetyRepair();
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-crash-diagnostics]');
  if (!button) return;
  event.preventDefault();
  runCrashDiagnostics(false);
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-crash-diagnostics-clear]');
  if (!button) return;
  event.preventDefault();
  runCrashDiagnostics(true);
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-hands-off-check]');
  if (!button) return;
  event.preventDefault();
  runHandsOffSupervisorCheck();
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-strategy-control]');
  if (!button) return;
  event.preventDefault();
  runStrategyControl();
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-strategy-builder-preview]');
  if (!button) return;
  event.preventDefault();
  previewStrategyBuilder();
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-strategy-builder-simulate]');
  if (!button) return;
  event.preventDefault();
  simulateStrategyBuilder();
});
const venueSelectForCredentials = $('#venue');
if (venueSelectForCredentials) venueSelectForCredentials.addEventListener('change', updatePassphraseField);
updatePassphraseField();
const saveBtn = $('#saveExchange'); if (saveBtn) saveBtn.onclick = saveExchange;
const testBtn = $('#testExchange'); if (testBtn) testBtn.onclick = testExchange;
const quickTest = $('#quickTest'); if (quickTest) quickTest.onclick = testExchange;
const reserveBtn = $('#reserveWithdrawal'); if (reserveBtn) reserveBtn.onclick = reserveWithdrawal;
const executeBtn = $('#executeWithdrawal'); if (executeBtn) executeBtn.onclick = executeWithdrawal;
const cancelBtn = $('#cancelWithdrawal'); if (cancelBtn) cancelBtn.onclick = cancelWithdrawal;
const rebuildBtn = $('#rebuildCapital'); if (rebuildBtn) rebuildBtn.onclick = rebuildCapital;

async function autoHydrateStartupProofSync() {
  if (startupProofHydrateDone) return;
  startupProofHydrateDone = true;
  try {
    const result = await api('/api/startup/proof-state-sync?auto=true&run=true', {});
    if (result.startupProofStateSync) {
      S = { ...S, startupProofStateSync: result.startupProofStateSync, startupAutoProof: result.startupAutoProof || S.startupAutoProof, readinessCheck: result.readiness || S.readinessCheck };
      render();
    }
  } catch (error) {
    console.warn('startup proof auto hydrate skipped', error);
  }
}

try {
  const es = new EventSource('/events');
  es.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.type === 'hello') {
      const next = applyStableRecoveryOverlay(message.payload);
      if (!shouldKeepCurrentState(next)) S = next;
      rememberStableDashboardState(S);
    } else if (message.type === 'state') {
      const delta = message.payload || {};
      const next = applyStableRecoveryOverlay({ ...S, ...delta });
      if (!shouldKeepCurrentState(next)) S = next;
      rememberStableDashboardState(S);
    } else if (message.type === 'event') {
      const entry = message.payload || {};
      S = { ...S, events: [entry, ...(S.events || []).filter(x => x.id !== entry.id)].slice(0, 18) };
    } else if (message.type === 'runtime') {
      const entry = message.payload || {};
      const pipeline = { ...(S.pipeline || {}) };
      if (entry.step) pipeline[entry.step] = { ...(pipeline[entry.step] || {}), step: entry.step, status: entry.status, lastRun: entry.time, blocked: entry.status === 'blocked' };
      S = { ...S, runtime: [entry, ...(S.runtime || []).filter(x => x.id !== entry.id)].slice(0, 12), pipeline };
    }
    render();
  };
} catch {}

setInterval(() => {
  if (lastServerTimeMs > 0 && lastServerTimeClientAt > 0) {
    const estimated = lastServerTimeMs + (Date.now() - lastServerTimeClientAt);
    setText('#srv', new Date(estimated).toLocaleTimeString('hu-HU'));
  }
}, 1000);
setInterval(() => { void refresh(); }, 45000);
autoHydrateStartupProofSync().then(refresh).catch(error => toast('Kapcsolódási hiba: ' + error.message));
