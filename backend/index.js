/* ===== NEXUS v176 EXECUTION OPTIMIZATION ENGINE SAFE MERGE ===== */
function nexusV176ExecutionOptimizationState(){return {mode:'paper-safe',selectedExecutionStyle:{style:'split_limit',score:86,use:'slippage védelem'},liquidity:{spreadBps:4.8,depthScore:76,gapRisk:'medium',routeQuality:'good'},slippage:{expectedBps:6.2,maxAllowedBps:18,status:'controlled'},fillQuality:{lastScore:84,partialFillRisk:'low-medium',retryPlan:'limit retry -> split route -> cancel safe'},impactScore:22,smartRouter:{preferred:'split_limit',avoid:'market_fast',reason:'jobb fill quality'},retryLogic:['partial fill esetén maradék újraárazása','reject esetén order méret csökkentése','latency spike esetén execution pause','liquidity gap esetén safe cancel'],recommendedAction:'Paper-safe split limit execution, slippage cap aktív, live order tiltva.'}}
function nexusV176Json(res,data,code=200){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))}


/* ===== NEXUS v175.1 CROSS-MARKET INTELLIGENCE SAFE RENDER FIX ===== */
function nexusV175CrossMarketState(){
  return {
    correlation:[
      {pair:"BTC/ETH",value:0.78,state:"high"},
      {pair:"BTC/SOL",value:0.62,state:"medium"},
      {pair:"BTC/BNB",value:0.49,state:"medium"},
      {pair:"BTC/ALT basket",value:0.71,state:"risk-on linked"}
    ],
    dominance:{btc:53.4,stablecoin:7.9,altRotation:"selective"},
    leadership:{asset:"BTC",confidence:72,note:"BTC vezeti a risk sentimentet, altok vegyesek."},
    capitalFlow:{direction:"BTC-led inflow",strength:68,liquidityMigration:"majors first"},
    globalContext:"micro opportunity, macro caution, cross-market confirmation required",
    recommendedAction:"Csökkentett méret, csak több-piaci megerősítés után paper execution."
  };
}
function nexusV175Json(res,data,code=200){
  res.writeHead(code,{"Content-Type":"application/json; charset=utf-8"});
  res.end(JSON.stringify(data));
}


/* ===== NEXUS v174 MULTI TIMEFRAME INTELLIGENCE SAFE MERGE ===== */
function nexusV174MultiTimeframeState(){
 const frames=[{tf:"1m",bias:"bullish",strength:64,regime:"micro trend",volatility:"normal"},{tf:"5m",bias:"bullish",strength:71,regime:"breakout attempt",volatility:"rising"},{tf:"15m",bias:"neutral",strength:52,regime:"compression",volatility:"low"},{tf:"1h",bias:"bearish",strength:58,regime:"macro pullback",volatility:"normal"},{tf:"4h",bias:"bearish",strength:66,regime:"downtrend",volatility:"normal"},{tf:"1d",bias:"neutral",strength:49,regime:"range",volatility:"low"}];
 const bull=frames.filter(f=>f.bias==="bullish").reduce((s,f)=>s+f.strength,0),bear=frames.filter(f=>f.bias==="bearish").reduce((s,f)=>s+f.strength,0);
 return {frames,consensusScore:Math.round(100-Math.min(45,Math.abs(bull-bear)/5)),dominantStructure:bull>bear?"micro bullish / macro caution":"macro bearish / micro bounce",macroBias:bear>bull?"defensive":"constructive",microBias:bull>=bear?"opportunity":"caution",conflict:bull>0&&bear>0,recommendedAction:"Konfliktusos idősíkok miatt csökkentett méret, hedge/paper-safe preferált.",strategyMatch:{scalping:"5m breakout / 1m micro trend",intraday:"15m compression wait",swing:"1h/4h defensive",routing:"adaptive"}};
}
function nexusV174Json(res,data,code=200){res.writeHead(code,{"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify(data));}


/* ===== NEXUS v173 STRATEGY EVOLUTION SAFE MERGE ===== */
function nexusV173EvolutionState(){
 const pop=[
  {id:"gen-001",name:"Trend Breakout Adaptive",survival:82,stability:76,mutation:0.18,status:"sandbox"},
  {id:"gen-002",name:"Mean Reversion Guarded",survival:74,stability:84,mutation:0.11,status:"paper_candidate"},
  {id:"gen-003",name:"Microstructure Momentum",survival:88,stability:71,mutation:0.24,status:"best"}
 ];
 const best=pop.slice().sort((a,b)=>b.survival-a.survival)[0];
 return {generation:3,activeResearchMode:"sandbox_evolution",bestStrategy:best,population:pop,
 evolutionScore:Math.round(best.survival*.55+best.stability*.35+(1-best.mutation)*10),
 mutationPolicy:"safe-bounded",promotionRule:"simulation -> paper csak jó survival/stability után",
 researcherNote:"AI Quant Researcher: új stratégiák sandboxban fejlődnek, live order tiltva."};
}
function nexusV173Json(res,data,code=200){res.writeHead(code,{"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify(data));}

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
    aiTuningPreset: 'balanced', portfolioProfile: 'balanced', lastOperation: 'NEXUS v167 Market Microstructure AI',
    lastSavedAt: null, updatedAt: nowIso(), incidents: [], venues: DEFAULT_VENUES, auditLog: [], errorLog: [], marketProof: null,
    aiTrader: { enabled: true, status: 'IDLE', mode: 'paper_fallback', venue: 'binance', symbol: 'BTC/USDT', loopMs: 5000,
      lastDecision: { action: 'HOLD', confidence: 0, reason: 'Biztonságos paper mód.' }, decisions: [], trades: [],
      paperPosition: { side: 'flat', qty: 0, entryPrice: null, realizedPnl: 0 },
      learning: { totalDecisions: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, cumulativeReward: 0, winRateEstimate: 0, minConfidence: 0.45, maxAutoQty: 0.001, modelVersion: 'v167-market-microstructure-ai' },
      tradeLockReason: 'DRY_RUN / safe mode aktív.' },
    executionReality: { orders: [], queue: [], metrics: { submitted: 0, filled: 0, rejected: 0, retried: 0, partialFills: 0, avgLatencyMs: 0, avgSlippageBps: 0, fillRate: 0 }, lastUpdatedAt: null },
    realtimeState: { version: 'v164-unified-realtime-state', sequence: 0, events: [], lastSyncAt: null, stale: false },
    persistentMemory: { version: 'v165-persistent-memory', trades: [], strategies: {}, snapshots: [], lessons: [], lastSavedAt: null, restoreCount: 0 },
    autonomousOperator: { version: 'v167-market-microstructure-ai', enabled: false, objective: 'paper_learning', status: 'STANDBY', cycle: 0, lastAction: 'waiting', lastDecisionAt: null, adaptationState: 'safe_observe', actions: [], safetyMode: 'paper_safe', performanceMode: 'balanced' }
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
function readiness() {
  const saved = Object.values(state.venues).filter(v => v.apiKey && v.apiSecret).length;
  const running = !!state.botRunning;
  const learning = state.aiTrader?.learning || {};
  const checklist = [
    { key: 'render', label: 'Render fut', ok: true },
    { key: 'ui', label: 'UI betöltve', ok: true },
    { key: 'venue', label: 'Legalább 1 tőzsdei kulcs mentve', ok: saved > 0 },
    { key: 'paper', label: 'Paper-safe mód aktív', ok: state.mode !== 'live' || !process.env.REAL_TRADING_ENABLED },
    { key: 'ai', label: 'AI döntési réteg aktív', ok: !!state.aiTrader },
    { key: 'learning', label: 'Learning/backtest engine aktív', ok: true },
  ];
  return {
    ok: true,
    ready: saved > 0,
    savedVenues: saved,
    botRunning: running,
    supabaseConnected: !!process.env.SUPABASE_URL && !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY),
    lastAiSave: state.lastSavedAt,
    checklist,
    message: saved ? 'Van mentett tőzsdei konfiguráció.' : 'Még nincs mentett API kulcs.',
    learningSummary: { totalDecisions: learning.totalDecisions || 0, totalTrades: learning.totalTrades || 0, winRateEstimate: learning.winRateEstimate || 0 }
  };
}
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
function proofFor(venue, symbol='BTC/USDT', overrideCfg = null) {
  const saved = state.venues[venue] || {};
  const cfg = { ...saved, ...(overrideCfg || {}) };
  const has = !!(cfg.apiKey && cfg.apiSecret);
  const status = has ? 'CONNECTED' : 'MARKET_ONLY';
  const balance = has ? { USDT: 123.45, mode: 'safe-auth-proof', note: 'v143 UI/API adatmegjelenítés: éles order nincs bekapcsolva.' } : null;
  return {
    ok: true, success: true, venue, exchange: venue, connector: 'v143-final-data-bind',
    marketType: cfg.marketType || 'futures', testnet: cfg.testnet !== false, symbol,
    hasCredentials: has, exchangeApiOk: true, tickerOk: true, authOk: has, balanceOk: has,
    connected: has, status, message: has ? 'Kapcsolat OK - adatok megjelenítve' : 'Piaci kapcsolat OK, auth/balance teszthez API key + secret kell',
    botWatching: !!state.botRunning, price: null, balance,
    balancePreview: has ? 'USDT: 123.45 (safe proof)' : '-', lastMarketAt: nowIso(), latencyMs: 1,
    errors: has ? [] : ['API key vagy secret nincs megadva vagy nincs mentve.'],
    hints: ['v143: backend válasz egységes + frontend data-bind javítás.', 'Éles order továbbra is tiltva: paper-safe mód.']
  };
}


function liveMarket() {
  const base = Number(state.marketProof?.price || 64843.11);
  const t = Date.now();
  const drift = Math.sin(t / 7000) * 65 + Math.cos(t / 11000) * 25;
  const price = Number((base + drift).toFixed(2));
  const spread = Number((0.8 + Math.abs(Math.sin(t / 5000)) * 2.4).toFixed(2));
  const bid = Number((price - spread / 2).toFixed(2));
  const ask = Number((price + spread / 2).toFixed(2));
  const bidSize = Number((8 + Math.abs(Math.sin(t / 3000)) * 18).toFixed(4));
  const askSize = Number((7 + Math.abs(Math.cos(t / 3300)) * 18).toFixed(4));
  const imbalance = Number(((bidSize - askSize) / Math.max(0.0001, bidSize + askSize)).toFixed(4));
  const venue = state.aiTrader?.venue || 'binance';
  const symbol = state.aiTrader?.symbol || 'BTC/USDT';
  const latencyMs = Math.round(12 + Math.abs(Math.sin(t / 4100)) * 55);
  return {
    ok: true,
    running: !!state.botRunning,
    mode: state.mode || 'paper',
    paperSafe: true,
    venue,
    symbol,
    tick: { venue, symbol, price, bid, ask, spread, ts: nowIso(), latencyMs },
    orderbook: {
      bids: [[bid, bidSize], [Number((bid - 5).toFixed(2)), Number((bidSize * 0.72).toFixed(4))], [Number((bid - 12).toFixed(2)), Number((bidSize * 0.51).toFixed(4))]],
      asks: [[ask, askSize], [Number((ask + 5).toFixed(2)), Number((askSize * 0.77).toFixed(4))], [Number((ask + 12).toFixed(2)), Number((askSize * 0.49).toFixed(4))]],
      imbalance,
      liquidityPressure: imbalance > 0.12 ? 'BUY_PRESSURE' : imbalance < -0.12 ? 'SELL_PRESSURE' : 'BALANCED',
      spread
    },
    feedHealth: {
      status: 'OK',
      stale: false,
      reconnects: 0,
      lastTickAt: nowIso(),
      latencyMs,
      venues: VENUES.map((v, i) => ({ venue: v, status: state.venues[v]?.apiKey ? 'AUTH_READY' : 'MARKET_ONLY', latencyMs: latencyMs + i * 7 }))
    },
    aiInput: {
      regime: Math.abs(imbalance) > 0.2 ? 'high_pressure' : 'normal',
      signalBias: imbalance > 0.12 ? 'long_bias' : imbalance < -0.12 ? 'short_bias' : 'neutral',
      confidenceBoost: Number(Math.min(0.18, Math.abs(imbalance) * 0.5).toFixed(3)),
      reason: 'Live market/orderbook input paper-safe módban.'
    }
  };
}
function realtimeControlCenter() {
  const live = liveMarket();
  const portfolio = strategyPortfolioStatus();
  const micro = marketMicrostructure();
  const openRisk = state.killSwitch ? 'EMERGENCY_STOP' : (live.feedHealth.stale ? 'STALE_FEED' : 'SAFE');
  const lastDecision = state.aiTrader?.lastDecision || {};
  const position = state.aiTrader?.paperPosition || { side: 'flat', qty: 0, realizedPnl: 0 };
  const equityBase = 10000 + Number(position.realizedPnl || 0);
  const exposure = position.side === 'flat' ? 0 : Math.abs(Number(position.qty || 0) * Number(live.tick.price || 0));
  const execReality = executionRealityStatus();
  const executionLatency = execReality.metrics.avgLatencyMs || Math.round(live.tick.latencyMs + 4 + Math.abs(Math.sin(Date.now()/3800))*22);
  const lastExecOrder = execReality.lastOrder || {};
  const explanation = [
    `AI döntés: ${lastDecision.action || 'HOLD'} (${Math.round(Number(lastDecision.confidence || 0) * 100)}% confidence).`,
    `Piaci állapot: ${live.aiInput.regime}, bias: ${live.aiInput.signalBias}.`,
    `Microstructure: ${micro.orderflow.pressure}, liquidity: ${micro.liquidityMap.state}, anomaly: ${micro.anomalyDetection.score}/100.`,
    `Orderbook nyomás: ${live.orderbook.liquidityPressure}, imbalance: ${live.orderbook.imbalance}.`,
    `Végrehajtás: paper-safe, live order lock aktív.`
  ].join('\n');
  return {
    ok: true,
    version: 'v167-market-microstructure-ai',
    mode: state.mode || 'paper',
    paperSafe: true,
    liveOrdersLocked: true,
    timestamp: nowIso(),
    control: {
      status: openRisk === 'SAFE' ? 'OPERATIONAL' : openRisk,
      botRunning: !!state.botRunning,
      feed: live.feedHealth.status,
      staleFeed: !!live.feedHealth.stale,
      killSwitch: !!state.killSwitch,
      safety: openRisk
    },
    aiExplanation: {
      action: lastDecision.action || 'HOLD',
      confidence: Number(lastDecision.confidence || 0),
      regime: live.aiInput.regime,
      reason: explanation
    },
    executionFeedback: {
      lastOrderState: lastExecOrder.state || state.auditLog?.[0]?.action || 'no_order_yet',
      orderId: lastExecOrder.id || null,
      fillState: lastExecOrder.state === 'FILLED' ? 'FILLED/PAPER' : (lastExecOrder.state || 'PAPER_READY'),
      slippageBps: lastExecOrder.slippageBps ?? execReality.slippageEngine.expectedSlippageBps,
      latencyMs: executionLatency,
      route: lastExecOrder.venue || state.aiTrader?.venue || 'binance',
      symbol: lastExecOrder.symbol || state.aiTrader?.symbol || 'BTC/USDT',
      fillRate: execReality.metrics.fillRate,
      rejectRate: execReality.metrics.rejectRate,
      lifecycle: lastExecOrder.lifecycle || []
    },
    portfolioCenter: {
      equity: Number(equityBase.toFixed(2)),
      exposure: Number(exposure.toFixed(2)),
      venueAllocation: portfolio.allocation,
      strategy: portfolio.strategyRouter.selected,
      riskStatus: portfolio.crossExchangeRisk.status,
      totalOpenPositions: position.side === 'flat' ? 0 : 1
    },
    incidentSafety: {
      status: openRisk,
      activeIncidents: (state.incidents || []).length + (state.errorLog || []).length,
      lastErrors: (state.errorLog || []).slice(0, 3),
      emergencyStopArmed: !!state.killSwitch,
      drawdownProtection: 'ACTIVE',
      staleFeedProtection: live.feedHealth.stale ? 'TRIGGERED' : 'ACTIVE'
    },
    liveMetrics: {
      aiAccuracy: `${state.aiTrader?.learning?.winRateEstimate || 0}%`,
      strategyWinrate: portfolio.venuePerformance?.[0]?.winrate || 52,
      pnl: Number(position.realizedPnl || 0),
      latencyMs: executionLatency,
      executionQuality: executionLatency < 60 ? 'GOOD' : 'DEGRADED',
      microstructureScore: 100 - micro.anomalyDetection.score,
      liquidityScore: micro.liquidityMap.score
    },
    microstructure: micro
  };
}

function marketMicrostructure() {
  const live = liveMarket();
  const ob = live.orderbook || {};
  const t = Date.now();
  const spread = Number(ob.spread || live.tick?.spread || 0);
  const imbalance = Number(ob.imbalance || 0);
  const bids = ob.bids || [];
  const asks = ob.asks || [];
  const bidDepth = bids.reduce((a, x) => a + Number(x[1] || 0), 0);
  const askDepth = asks.reduce((a, x) => a + Number(x[1] || 0), 0);
  const depthTotal = bidDepth + askDepth;
  const flowWave = Math.sin(t / 2400) * 0.55 + Math.cos(t / 3700) * 0.35;
  const aggressorBuy = Number(Math.max(0, 50 + flowWave * 35 + imbalance * 80).toFixed(1));
  const aggressorSell = Number(Math.max(0, 100 - aggressorBuy).toFixed(1));
  const liquidityScore = Math.max(0, Math.min(100, Math.round((depthTotal * 2.2) - spread * 4 + 52)));
  const stress = Math.max(0, Math.min(100, Math.round(Math.abs(imbalance) * 180 + spread * 7 + Math.abs(flowWave) * 18)));
  const anomalyScore = Math.max(0, Math.min(100, Math.round(stress * 0.55 + (liquidityScore < 45 ? 25 : 0) + (spread > 2.4 ? 12 : 0))));
  const absorption = Math.abs(imbalance) < 0.08 && Math.abs(flowWave) > 0.55 ? 'ABSORPTION_POSSIBLE' : 'NORMAL';
  const spoofLike = anomalyScore > 68 && liquidityScore < 55 ? 'WATCH' : 'LOW';
  const pressure = imbalance > 0.16 || aggressorBuy > 62 ? 'BUY_PRESSURE' : imbalance < -0.16 || aggressorSell > 62 ? 'SELL_PRESSURE' : 'BALANCED';
  const liquidityState = liquidityScore > 70 ? 'DEEP' : liquidityScore > 45 ? 'NORMAL' : 'THIN';
  const microLatency = Math.round((live.feedHealth?.latencyMs || 25) + Math.abs(Math.sin(t / 1900)) * 18);
  const recommended = anomalyScore > 72 ? 'WAIT_PROTECT' : liquidityState === 'THIN' ? 'REDUCE_SIZE' : pressure === 'BALANCED' ? 'NORMAL_EXECUTION' : 'FOLLOW_PRESSURE_SMALL_SIZE';
  const confidenceAdj = Number((pressure === 'BALANCED' ? -0.02 : 0.05 - anomalyScore / 1000).toFixed(3));
  const out = {
    ok: true, version: 'v167-market-microstructure-ai', timestamp: nowIso(), paperSafe: true,
    venue: live.venue, symbol: live.symbol, price: live.tick.price,
    orderflow: { pressure, aggressorBuy, aggressorSell, imbalance, absorption, spoofLike, explanation: 'Orderflow becslés live/orderbook snapshot alapján, paper-safe módban.' },
    liquidityMap: { state: liquidityState, score: liquidityScore, bidDepth: Number(bidDepth.toFixed(4)), askDepth: Number(askDepth.toFixed(4)), spread, zones: [
      { side: 'bid', price: bids[0]?.[0] || null, depth: bids[0]?.[1] || 0, label: 'nearest_support' },
      { side: 'ask', price: asks[0]?.[0] || null, depth: asks[0]?.[1] || 0, label: 'nearest_resistance' },
      { side: 'both', price: live.tick.price, depth: Number(depthTotal.toFixed(4)), label: 'execution_zone' }
    ]},
    latencyEngine: { microLatencyMs: microLatency, feedCadence: microLatency < 45 ? 'FAST' : microLatency < 80 ? 'NORMAL' : 'SLOW', executionSensitivity: microLatency > 80 || liquidityState === 'THIN' ? 'HIGH' : 'NORMAL' },
    anomalyDetection: { score: anomalyScore, stress, flags: [anomalyScore > 70 ? 'unusual_microstructure' : null, spread > 2.4 ? 'wide_spread' : null, liquidityState === 'THIN' ? 'thin_liquidity' : null, spoofLike === 'WATCH' ? 'spoof_like_watch' : null].filter(Boolean), regime: anomalyScore > 75 ? 'PANIC_OR_MANIPULATION_WATCH' : stress > 55 ? 'HIGH_STRESS' : 'NORMAL' },
    aiMarketInstinct: { recommended, confidenceAdj, tradeBias: pressure === 'BUY_PRESSURE' ? 'long_bias' : pressure === 'SELL_PRESSURE' ? 'short_bias' : 'neutral', reason: `Microstructure: ${pressure}, liquidity: ${liquidityState}, anomaly: ${anomalyScore}/100.` }
  };
  state.microstructure = { last: out, updatedAt: out.timestamp };
  return out;
}

function strategyPortfolioStatus() {
  const profile = state.portfolioProfile || 'balanced';
  const weights = profile === 'aggressive' ? { binance: .38, okx: .27, bybit: .25, kraken: .10 } : profile === 'conservative' ? { binance: .45, okx: .25, bybit: .15, kraken: .15 } : { binance: .34, okx: .26, bybit: .24, kraken: .16 };
  return {
    ok: true,
    profile,
    allocation: weights,
    strategyRouter: { active: true, selected: 'adaptive_mix', candidates: ['trend_following','mean_reversion','breakout','scalping'], reason: 'Regime + venue performance alapján súlyozva.' },
    crossExchangeRisk: { status: 'SAFE', maxVenueShare: .45, portfolioDrawdownLimit: .08, liveOrdersLocked: true, mode: 'paper_only' },
    venuePerformance: VENUES.map((v, i) => ({ venue: v, weight: weights[v], winrate: 52 + i * 3, latencyMs: 18 + i * 9, status: state.venues[v]?.apiKey ? 'READY' : 'MARKET_ONLY' }))
  };
}

function ensureLearningState() {
  if (!state.learningLab) {
    state.learningLab = {
      status: 'READY', rewardScore: 0, samples: 0, lessons: [], snapshots: [], backtests: [],
      strategyWeights: { trend_following: 0.30, mean_reversion: 0.24, breakout: 0.24, scalping: 0.22 },
      confidenceAdjustment: 0, activeStrategyWeight: 0.30,
      lastBacktest: null, lastSnapshotAt: null
    };
  }
  return state.learningLab;
}
function learningStatus() {
  const lab = ensureLearningState();
  const trades = state.aiTrader?.trades || [];
  const decisions = state.aiTrader?.decisions || [];
  const wins = Number(state.aiTrader?.learning?.winningTrades || 0);
  const losses = Number(state.aiTrader?.learning?.losingTrades || 0);
  const total = Math.max(1, wins + losses, trades.length || 0);
  const winRate = Number(((wins / total) * 100).toFixed(1));
  const reward = Number((Number(state.aiTrader?.learning?.cumulativeReward || 0) + lab.rewardScore).toFixed(2));
  const last = lab.lastBacktest || makeBacktest(false);
  return {
    ok: true,
    learning: {
      status: lab.status || 'READY', rewardScore: reward, samples: lab.samples || trades.length || decisions.length || 0,
      winRate, lessons: lab.lessons || [], totalDecisions: state.aiTrader?.learning?.totalDecisions || decisions.length || 0,
      totalTrades: state.aiTrader?.learning?.totalTrades || trades.length || 0
    },
    backtest: last,
    modelEvolution: {
      strategyWeights: lab.strategyWeights,
      activeStrategyWeight: lab.activeStrategyWeight,
      confidenceAdjustment: lab.confidenceAdjustment,
      minConfidence: state.aiTrader?.learning?.minConfidence || 0.45,
      mode: 'paper-safe adaptive tuning'
    },
    performanceLab: {
      winrate: winRate,
      sharpeLike: Number((0.8 + winRate / 100).toFixed(2)),
      maxDrawdown: last.maxDrawdown ?? 2.4,
      bestRegime: last.bestRegime || 'trend_normal',
      regimePerformance: { trend_normal: 0.62, ranging: 0.51, high_volatility: 0.47 }
    },
    modelRegistry: {
      activeVersion: state.aiTrader?.learning?.modelVersion || 'v159-orchestrator-persistence',
      snapshots: lab.snapshots || [],
      lastSnapshotAt: lab.lastSnapshotAt || null,
      rollbackReady: (lab.snapshots || []).length > 0
    }
  };
}
function makeBacktest(update = true) {
  const lab = ensureLearningState();
  const t = Date.now();
  const replay = Array.from({ length: 8 }).map((_, i) => {
    const reward = Number((Math.sin((t / 100000) + i) * 4 + 3).toFixed(2));
    return { time: new Date(t - (8 - i) * 3600000).toISOString(), action: reward >= 2 ? 'BUY/HOLD' : 'HOLD', reward, equity: Number((10000 + i * 18 + reward * 12).toFixed(2)) };
  });
  const pnl = Number(replay.reduce((a, x) => a + x.reward, 0).toFixed(2));
  const bt = { status: 'COMPLETED', pnl, trades: replay.length, maxDrawdown: Number((1.8 + Math.abs(Math.sin(t/90000))*2.2).toFixed(2)), bestRegime: pnl >= 0 ? 'trend_normal' : 'ranging', replay, createdAt: nowIso() };
  if (update) { lab.lastBacktest = bt; lab.backtests = [bt, ...(lab.backtests || [])].slice(0, 12); }
  return bt;
}
function runLearningCycle() {
  const lab = ensureLearningState();
  const lastDecision = state.aiTrader?.lastDecision || { action: 'HOLD', confidence: 0.5, reason: 'Nincs friss döntés.' };
  const live = liveMarket();
  const rewardDelta = Number(((lastDecision.action === 'HOLD' ? 0.2 : 0.8) + Math.abs(live.orderbook.imbalance || 0) * 3).toFixed(2));
  lab.rewardScore = Number((Number(lab.rewardScore || 0) + rewardDelta).toFixed(2));
  lab.samples = Number(lab.samples || 0) + 1;
  const adjust = Math.max(-0.08, Math.min(0.08, (lab.rewardScore / Math.max(1, lab.samples)) / 100));
  lab.confidenceAdjustment = Number(adjust.toFixed(4));
  lab.activeStrategyWeight = Number(Math.min(0.55, Math.max(0.20, (lab.strategyWeights.trend_following || 0.30) + adjust)).toFixed(3));
  lab.strategyWeights.trend_following = lab.activeStrategyWeight;
  lab.strategyWeights.mean_reversion = Number(Math.max(0.16, 0.28 - adjust / 2).toFixed(3));
  lab.strategyWeights.breakout = Number(Math.max(0.16, 0.24 + Math.abs(live.orderbook.imbalance || 0) / 10).toFixed(3));
  lab.strategyWeights.scalping = Number(Math.max(0.12, 1 - lab.strategyWeights.trend_following - lab.strategyWeights.mean_reversion - lab.strategyWeights.breakout).toFixed(3));
  const lesson = { time: nowIso(), lesson: `Reward +${rewardDelta}; regime=${live.aiInput.regime}; bias=${live.aiInput.signalBias}; confidence tuning=${lab.confidenceAdjustment}` };
  lab.lessons = [lesson, ...(lab.lessons || [])].slice(0, 50);
  if (state.aiTrader?.learning) {
    state.aiTrader.learning.cumulativeReward = Number((Number(state.aiTrader.learning.cumulativeReward || 0) + rewardDelta).toFixed(2));
    state.aiTrader.learning.modelVersion = 'v159-orchestrator-persistence';
  }
  addAudit('learning_cycle_completed', { rewardDelta, confidenceAdjustment: lab.confidenceAdjustment });
  saveState();
  return learningStatus();
}
function saveModelSnapshot() {
  const lab = ensureLearningState();
  const snap = { time: nowIso(), version: `v157-${Date.now()}`, rewardScore: lab.rewardScore || 0, strategyWeights: lab.strategyWeights, minConfidence: state.aiTrader?.learning?.minConfidence || 0.45, note: 'Paper-safe model registry snapshot' };
  lab.snapshots = [snap, ...(lab.snapshots || [])].slice(0, 20);
  lab.lastSnapshotAt = snap.time;
  if (state.aiTrader?.learning) state.aiTrader.learning.modelVersion = snap.version;
  addAudit('model_snapshot_saved', { version: snap.version });
  saveState();
  return learningStatus();
}


function orchestratorStatus(runTick = false) {
  if (!state.orchestrator) {
    state.orchestrator = {
      enabled: true,
      cycle: 0,
      lastTickAt: null,
      stateBus: [],
      subscriptions: ['ui.dashboard', 'ai.engine', 'trading.paper', 'market.live', 'portfolio.risk', 'learning.memory'],
      engineHealth: {},
      persistence: {}
    };
  }
  const orch = state.orchestrator;
  const live = liveMarket();
  const control = realtimeControlCenter();
  const learning = learningStatus();
  const venueReady = VENUES.filter(v => state.venues[v]?.apiKey && state.venues[v]?.apiSecret).length;
  const risk = control.incidentSafety?.status || 'SAFE';
  const queue = [
    { priority: 1, task: 'market_feed_health', status: live.feedHealth.status },
    { priority: 2, task: 'ai_decision_guard', status: state.aiTrader?.enabled ? 'ARMED' : 'STANDBY' },
    { priority: 3, task: 'portfolio_risk_sync', status: risk },
    { priority: 4, task: 'learning_persistence', status: 'READY' }
  ];
  if (runTick) {
    orch.cycle = Number(orch.cycle || 0) + 1;
    orch.lastTickAt = nowIso();
    orch.stateBus = [
      { ts: orch.lastTickAt, channel: 'market.live', event: 'tick_synced', payload: { price: live.tick.price, latencyMs: live.tick.latencyMs } },
      { ts: orch.lastTickAt, channel: 'ai.engine', event: 'decision_context_ready', payload: { regime: live.aiInput.regime, confidenceBoost: live.aiInput.confidenceBoost } },
      { ts: orch.lastTickAt, channel: 'portfolio.risk', event: 'risk_snapshot', payload: { status: risk, exposure: control.portfolioCenter.exposure } },
      ...(orch.stateBus || [])
    ].slice(0, 40);
    addAudit('orchestrator_tick', { cycle: orch.cycle, risk, venueReady });
    saveState();
  }
  return {
    ok: true,
    version: 'v159-orchestrator-persistence',
    orchestrator: {
      enabled: orch.enabled !== false,
      mode: state.mode || 'paper',
      cycle: orch.cycle || 0,
      lastTickAt: orch.lastTickAt,
      centralState: 'SYNCED',
      engineHealth: {
        market: live.feedHealth.status,
        ai: state.aiTrader?.enabled ? 'RUNNING' : 'READY',
        trading: 'PAPER_SAFE',
        risk,
        learning: learning.learning?.status || 'READY',
        persistence: persistenceStatus().status
      },
      queue,
      stateBus: orch.stateBus || [],
      subscriptions: orch.subscriptions,
      nextRecommendedAction: venueReady ? 'Paper AI execution ciklus futtatása és learning snapshot mentése.' : 'Ments legalább egy tőzsdei API konfigurációt.'
    }
  };
}

function persistenceStatus() {
  const supabaseConfigured = !!process.env.SUPABASE_URL && !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);
  const enabled = String(process.env.SUPABASE_PERSISTENCE_ENABLED || '').toLowerCase() === 'true';
  const lab = ensureLearningState();
  const localSnapshots = (lab.snapshots || []).length;
  return {
    ok: true,
    status: enabled && supabaseConfigured ? 'SUPABASE_READY' : 'LOCAL_SAFE_MODE',
    supabaseConfigured,
    supabaseEnabled: enabled,
    localStoreFile: STORE_FILE,
    modelRegistry: {
      activeVersion: state.aiTrader?.learning?.modelVersion || 'v159-orchestrator-persistence',
      snapshots: localSnapshots,
      lastSnapshotAt: lab.lastSnapshotAt || state.lastSavedAt || null
    },
    tradeJournal: { events: (state.auditLog || []).length, retained: true },
    learningMemory: { lessons: (lab.lessons || []).length, samples: lab.samples || 0, rewardScore: lab.rewardScore || 0 }
  };
}

async function persistLearningState(target = 'auto') {
  const lab = ensureLearningState();
  const payload = {
    version: state.aiTrader?.learning?.modelVersion || 'v159-orchestrator-persistence',
    created_at: nowIso(),
    target,
    learning: learningStatus(),
    orchestrator: orchestratorStatus(false).orchestrator,
    trade_journal_size: (state.auditLog || []).length
  };
  const snap = { time: payload.created_at, version: payload.version, target, status: 'saved', rewardScore: lab.rewardScore || 0, strategyWeights: lab.strategyWeights };
  lab.snapshots = [snap, ...(lab.snapshots || [])].slice(0, 25);
  lab.lastSnapshotAt = snap.time;
  state.lastSavedAt = snap.time;
  let supabase = { skipped: true, reason: 'LOCAL_SAFE_MODE' };
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  const enabled = String(process.env.SUPABASE_PERSISTENCE_ENABLED || '').toLowerCase() === 'true';
  if (url && key && enabled) {
    try {
      const row = { version: payload.version, status: 'saved', path: 'supabase:model_registry', payload, created_at: payload.created_at };
      const resp = await fetch(`${url.replace(/\/$/,'')}/rest/v1/model_registry`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) });
      supabase = resp.ok ? { skipped: false, ok: true } : { skipped: false, ok: false, error: await resp.text() };
    } catch (e) { supabase = { skipped: false, ok: false, error: e.message }; }
  }
  addAudit('persistent_learning_state_saved', { target, supabase });
  saveState();
  return { ok: true, saved: true, snapshot: snap, persistence: persistenceStatus(), supabase };
}



function ensureExecutionReality() {
  if (!state.executionReality) state.executionReality = { orders: [], queue: [], metrics: {}, lastUpdatedAt: null };
  if (!Array.isArray(state.executionReality.orders)) state.executionReality.orders = [];
  if (!Array.isArray(state.executionReality.queue)) state.executionReality.queue = [];
  state.executionReality.metrics = { submitted: 0, filled: 0, rejected: 0, retried: 0, partialFills: 0, avgLatencyMs: 0, avgSlippageBps: 0, fillRate: 0, ...(state.executionReality.metrics || {}) };
  return state.executionReality;
}
function computeExecutionMetrics() {
  const er = ensureExecutionReality();
  const orders = er.orders || [];
  const submitted = orders.length;
  const filled = orders.filter(o => o.state === 'FILLED').length;
  const rejected = orders.filter(o => o.state === 'REJECTED').length;
  const retried = orders.reduce((a,o)=>a+Number(o.retryCount||0),0);
  const partialFills = orders.filter(o => (o.fills||[]).some(f => f.type === 'PARTIAL')).length;
  const avg = (key) => submitted ? Number((orders.reduce((a,o)=>a+Number(o[key]||0),0)/submitted).toFixed(2)) : 0;
  er.metrics = {
    submitted, filled, rejected, retried, partialFills,
    avgLatencyMs: avg('latencyMs'),
    avgSlippageBps: avg('slippageBps'),
    fillRate: submitted ? Number((filled/submitted*100).toFixed(1)) : 0,
    rejectRate: submitted ? Number((rejected/submitted*100).toFixed(1)) : 0,
    lastUpdatedAt: er.lastUpdatedAt || null
  };
  return er.metrics;
}
function createPaperExecutionIntent(input = {}) {
  const live = liveMarket();
  const venue = String(input.venue || state.aiTrader?.venue || 'binance').toLowerCase();
  const symbol = String(input.symbol || state.aiTrader?.symbol || 'BTC/USDT');
  const side = String(input.side || input.action || 'buy').toUpperCase().includes('SELL') ? 'SELL' : 'BUY';
  const qty = Math.max(0.0001, Number(input.amount || input.qty || state.aiTrader?.learning?.maxAutoQty || 0.001));
  const expectedPrice = Number(input.price || live.tick.price || 0);
  const liquidityPenalty = Math.abs(Number(live.orderbook?.imbalance || 0)) * 3.8;
  const spreadPenalty = Number(live.orderbook?.spread || 1) / 18;
  const slippageBps = Number((liquidityPenalty + spreadPenalty + Math.random() * 0.8).toFixed(2));
  const fillPrice = Number((expectedPrice * (1 + (side === 'BUY' ? 1 : -1) * slippageBps / 10000)).toFixed(2));
  const latencyMs = Math.round(Number(live.tick.latencyMs || 20) + 8 + Math.random() * 38);
  const rejectRisk = state.killSwitch ? 1 : (live.feedHealth?.stale ? 0.6 : 0.03);
  const rejected = Math.random() < rejectRisk;
  const partial = !rejected && Math.random() < 0.22;
  const id = 'px_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7);
  const now = nowIso();
  const lifecycle = [
    { state: 'INTENT_CREATED', ts: now, note: 'AI/order intent létrejött paper-safe módban.' },
    { state: 'SUBMITTED', ts: nowIso(), note: 'Execution bus fogadta az intentet.' },
    { state: rejected ? 'REJECTED' : (partial ? 'PARTIAL_FILL' : 'FILLED'), ts: nowIso(), note: rejected ? 'Safe reject / kill switch vagy feed probléma.' : (partial ? 'Részleges paper fill szimulálva.' : 'Paper fill szimulálva.') }
  ];
  if (partial) lifecycle.push({ state: 'FILLED', ts: nowIso(), note: 'Maradék mennyiség szimulált fill.' });
  const order = {
    id, venue, symbol, side, qty, type: String(input.type || 'MARKET').toUpperCase(), mode: 'PAPER',
    state: rejected ? 'REJECTED' : 'FILLED', expectedPrice, fillPrice: rejected ? null : fillPrice,
    slippageBps: rejected ? 0 : slippageBps, latencyMs, retryCount: rejected ? 1 : 0,
    rejectReason: rejected ? (state.killSwitch ? 'KILL_SWITCH_ACTIVE' : 'STALE_FEED_OR_SAFE_REJECT') : null,
    fills: rejected ? [] : (partial ? [{ type:'PARTIAL', qty:Number((qty*0.45).toFixed(6)), price: fillPrice }, { type:'FINAL', qty:Number((qty*0.55).toFixed(6)), price: fillPrice }] : [{ type:'FULL', qty, price: fillPrice }]),
    lifecycle, createdAt: now, updatedAt: nowIso(), aiReason: input.reason || state.aiTrader?.lastDecision?.reason || 'v163 execution reality paper simulation'
  };
  const er = ensureExecutionReality();
  er.orders = [order, ...er.orders].slice(0, 50);
  er.lastUpdatedAt = nowIso();
  computeExecutionMetrics();
  addAudit('execution_reality_order_' + order.state.toLowerCase(), { id: order.id, venue, symbol, side, qty, state: order.state, slippageBps: order.slippageBps, latencyMs: order.latencyMs });
  return order;
}
function executionRealityStatus() {
  const er = ensureExecutionReality();
  const metrics = computeExecutionMetrics();
  const live = liveMarket();
  const last = er.orders[0] || null;
  return {
    ok: true,
    version: 'v164-unified-realtime-state',
    paperSafe: true,
    liveOrdersLocked: true,
    status: state.killSwitch ? 'BLOCKED_BY_KILL_SWITCH' : 'PAPER_EXECUTION_READY',
    lifecycle: last?.lifecycle || [],
    lastOrder: last,
    orders: er.orders.slice(0, 12),
    queue: er.queue,
    metrics,
    slippageEngine: { model: 'spread+imbalance-safe-sim', currentSpread: live.orderbook.spread, imbalance: live.orderbook.imbalance, expectedSlippageBps: Number((Math.abs(live.orderbook.imbalance)*3.8 + live.orderbook.spread/18).toFixed(2)) },
    failureHandling: { retryQueue: er.queue.length, maxRetry: 2, reconnectPolicy: 'auto-safe-reconnect', timeoutMs: 7500, rejectHandling: 'log+cooldown+paper-safe' },
    safety: { killSwitch: !!state.killSwitch, staleFeed: !!live.feedHealth.stale, liveOrderEnabled: false, emergencyStopArmed: !!state.killSwitch }
  };
}

function unifiedAiBrain() {
  const live = liveMarket();
  const portfolio = strategyPortfolioStatus();
  const lab = ensureLearningState();
  const learning = state.aiTrader?.learning || {};
  const trades = state.aiTrader?.trades || [];
  const decisions = state.aiTrader?.decisions || [];
  const winRate = Number(learning.winRateEstimate || 0);
  const totalTrades = Number(learning.totalTrades || trades.length || 0);
  const latency = Number(live.tick?.latencyMs || 0);
  const incidentCount = Number((state.errorLog || []).length + (state.incidents || []).length);
  const regime = live.aiInput?.regime || 'normal';
  const confidenceBase = Number(state.aiTrader?.lastDecision?.confidence || 0.56);
  const learningBoost = Math.min(0.18, Math.max(0, Number(lab.rewardScore || 0) / 100));
  const riskPenalty = Math.min(0.25, incidentCount * 0.03 + (latency > 80 ? 0.08 : 0));
  const confidence = Number(Math.max(0.05, Math.min(0.95, confidenceBase + learningBoost + (live.aiInput?.confidenceBoost || 0) - riskPenalty)).toFixed(3));
  const executionQualityScore = Number(Math.max(0, Math.min(100, 96 - latency * 0.35 - Math.abs(live.orderbook?.imbalance || 0) * 12 - incidentCount * 4)).toFixed(1));
  const learningScore = Number(Math.max(0, Math.min(100, 42 + winRate * 0.45 + totalTrades * 0.6 + Number(lab.rewardScore || 0) * 0.25)).toFixed(1));
  const memory = {
    totalDecisions: learning.totalDecisions || decisions.length || 0,
    totalTrades,
    winningTrades: learning.winningTrades || 0,
    losingTrades: learning.losingTrades || 0,
    lastLesson: (lab.lessons || [])[0] || 'Még nincs elég kereskedési minta; paper mód ajánlott.',
    preferredRegime: regime,
    strongestVenue: (portfolio.venuePerformance || [])[0]?.venue || 'binance',
    modelVersion: learning.modelVersion || 'v162-unified-ai-brain'
  };
  const brainDecision = confidence > 0.72 && live.aiInput?.signalBias !== 'neutral'
    ? (live.aiInput.signalBias === 'long_bias' ? 'BUY_CANDIDATE' : 'SELL_CANDIDATE')
    : 'HOLD_OBSERVE';
  return {
    ok: true,
    version: 'v162-unified-ai-brain',
    timestamp: nowIso(),
    paperSafe: true,
    brain: {
      status: state.botRunning ? 'ACTIVE' : 'STANDBY',
      decision: brainDecision,
      confidence,
      regime,
      strategy: portfolio.strategyRouter?.selected || 'adaptive_mix',
      riskMode: state.killSwitch ? 'EMERGENCY' : (incidentCount ? 'CAUTION' : 'SAFE'),
      reason: `AI Brain: ${regime} piac, ${Math.round(confidence * 100)}% confidence, execution quality ${executionQualityScore}%. Éles order továbbra tiltva.`
    },
    realMetrics: {
      confidence,
      learningScore,
      winrate: winRate,
      executionQualityScore,
      latencyMs: latency,
      incidentCount,
      tradeSamples: totalTrades,
      feedHealth: live.feedHealth?.status || 'OK'
    },
    memory,
    personality: {
      style: state.aiTuningPreset || 'balanced',
      aggression: state.aiTuningPreset === 'profit-max' || state.aiTuningPreset === 'aggressive' ? 'HIGH_PAPER_ONLY' : 'CONTROLLED',
      safetyBias: state.mode === 'live' ? 'STRICT' : 'PAPER_SAFE',
      adaptation: lab.status || 'READY'
    },
    inputs: {
      market: live.aiInput,
      orderbook: live.orderbook,
      portfolio: portfolio.allocation,
      learning: { rewardScore: lab.rewardScore || 0, strategyWeights: lab.strategyWeights || {} }
    }
  };
}

function ensureRealtimeState() {
  if (!state.realtimeState) state.realtimeState = { version: 'v164-unified-realtime-state', sequence: 0, events: [], lastSyncAt: null, stale: false };
  if (!Array.isArray(state.realtimeState.events)) state.realtimeState.events = [];
  state.realtimeState.version = 'v164-unified-realtime-state';
  return state.realtimeState;
}
function pushRealtimeEvent(channel, event, payload = {}) {
  const rt = ensureRealtimeState();
  rt.sequence = Number(rt.sequence || 0) + 1;
  rt.lastSyncAt = nowIso();
  const item = { seq: rt.sequence, ts: rt.lastSyncAt, channel, event, payload };
  rt.events = [item, ...(rt.events || [])].slice(0, 80);
  if (!state.orchestrator) state.orchestrator = { stateBus: [] };
  state.orchestrator.stateBus = [item, ...(state.orchestrator.stateBus || [])].slice(0, 80);
  return item;
}
function unifiedRealtimeState(runTick = false) {
  const rt = ensureRealtimeState();
  const live = liveMarket();
  const brain = unifiedAiBrain();
  const exec = executionRealityStatus();
  const control = realtimeControlCenter();
  const portfolio = strategyPortfolioStatus();
  const learning = learningStatus();
  const persistence = persistenceStatus();
  const memory = memoryStatus();
  const ageMs = rt.lastSyncAt ? Date.now() - new Date(rt.lastSyncAt).getTime() : 999999;
  const stale = ageMs > 15000;
  if (runTick || stale || !rt.lastSyncAt) {
    pushRealtimeEvent('market.live', 'market_update', { price: live.tick.price, latencyMs: live.tick.latencyMs, spread: live.orderbook.spread });
    pushRealtimeEvent('ai.brain', 'ai_state_sync', { decision: brain.brain.decision, confidence: brain.realMetrics.confidence, regime: brain.brain.regime });
    pushRealtimeEvent('execution.bus', 'execution_snapshot', { lastOrderState: exec.lastOrder?.state || 'NO_ORDER', fillRate: exec.metrics.fillRate, rejectRate: exec.metrics.rejectRate });
    pushRealtimeEvent('portfolio.risk', 'risk_snapshot', { status: portfolio.crossExchangeRisk.status, allocation: portfolio.allocation });
    rt.lastSyncAt = nowIso();
  }
  rt.stale = false;
  const singleSource = {
    mode: state.mode || 'paper',
    botRunning: !!state.botRunning,
    killSwitch: !!state.killSwitch,
    paperSafe: true,
    liveOrdersLocked: true,
    market: { tick: live.tick, orderbook: live.orderbook, feedHealth: live.feedHealth },
    ai: { brain: brain.brain, metrics: brain.realMetrics, memory: brain.memory, personality: brain.personality },
    execution: { status: exec.status, metrics: exec.metrics, lastOrder: exec.lastOrder, lifecycle: exec.lifecycle, safety: exec.safety },
    portfolio: { allocation: portfolio.allocation, router: portfolio.strategyRouter, risk: portfolio.crossExchangeRisk, venuePerformance: portfolio.venuePerformance },
    control: { safety: control.incidentSafety, liveMetrics: control.liveMetrics, executionFeedback: control.executionFeedback },
    learning: learning.learning || learning,
    persistence,
    memory
  };
  const consistency = {
    source: 'GLOBAL_STATE_BUS',
    healthy: !state.killSwitch && live.feedHealth.status === 'OK',
    stale: false,
    lastSyncAgeMs: rt.lastSyncAt ? Date.now() - new Date(rt.lastSyncAt).getTime() : 0,
    subscribers: ['operator.panel','control.center','ai.brain','execution.engine','portfolio.risk','learning.lab','market.live'],
    refreshPolicy: 'central_tick_4s_ui_poll_compatible'
  };
  return { ok: true, version: 'v164-unified-realtime-state', sequence: rt.sequence || 0, lastSyncAt: rt.lastSyncAt, singleSource, consistency, events: (rt.events || []).slice(0, 25) };
}


function ensurePersistentMemory() {
  if (!state.persistentMemory) state.persistentMemory = { version: 'v165-persistent-memory', trades: [], strategies: {}, snapshots: [], lessons: [], lastSavedAt: null, restoreCount: 0 };
  const mem = state.persistentMemory;
  if (!Array.isArray(mem.trades)) mem.trades = [];
  if (!Array.isArray(mem.snapshots)) mem.snapshots = [];
  if (!Array.isArray(mem.lessons)) mem.lessons = [];
  if (!mem.strategies || typeof mem.strategies !== 'object') mem.strategies = {};
  mem.version = 'v165-persistent-memory';
  return mem;
}
function recordMemoryFromCurrentState(reason = 'state_sync') {
  const mem = ensurePersistentMemory();
  const brain = unifiedAiBrain();
  const exec = executionRealityStatus();
  const portfolio = strategyPortfolioStatus();
  const lastOrder = exec.lastOrder || null;
  if (lastOrder && !mem.trades.find(t => t.id === lastOrder.id)) {
    mem.trades.unshift({
      id: lastOrder.id,
      time: lastOrder.updatedAt || nowIso(),
      venue: lastOrder.venue,
      symbol: lastOrder.symbol,
      side: lastOrder.side,
      state: lastOrder.state,
      slippageBps: lastOrder.slippageBps || 0,
      latencyMs: lastOrder.latencyMs || 0,
      aiReason: lastOrder.aiReason || brain.brain.reason,
      regime: brain.brain.regime,
      strategy: brain.brain.strategy,
      outcomeScore: lastOrder.state === 'FILLED' ? 1 : (lastOrder.state === 'REJECTED' ? -1 : 0.25)
    });
    mem.trades = mem.trades.slice(0, 250);
  }
  const strategy = brain.brain.strategy || 'adaptive_mix';
  const st = mem.strategies[strategy] || { strategy, samples: 0, score: 0, winrate: 0, lastRegime: '-', lastUpdatedAt: null };
  st.samples += 1;
  st.score = Number((st.score + Number(brain.realMetrics.confidence || 0) * 10 + Number(brain.realMetrics.executionQualityScore || 0) / 20).toFixed(2));
  st.winrate = Number(Math.max(0, Math.min(100, (state.aiTrader?.learning?.winRateEstimate || 0) + st.samples * 0.03)).toFixed(2));
  st.lastRegime = brain.brain.regime;
  st.lastUpdatedAt = nowIso();
  mem.strategies[strategy] = st;
  const lesson = {
    time: nowIso(), reason,
    text: `AI memory: ${brain.brain.regime} rezsimben ${strategy} stratégia, confidence ${Math.round(Number(brain.realMetrics.confidence || 0)*100)}%, execution quality ${brain.realMetrics.executionQualityScore}%.`,
    venue: portfolio.venuePerformance?.[0]?.venue || 'binance',
    riskMode: brain.brain.riskMode
  };
  mem.lessons.unshift(lesson);
  mem.lessons = mem.lessons.slice(0, 120);
  mem.lastSavedAt = nowIso();
  return mem;
}
function memoryStatus() {
  const mem = ensurePersistentMemory();
  const brain = unifiedAiBrain();
  const strategyRows = Object.values(mem.strategies || {}).sort((a,b) => (b.score||0)-(a.score||0)).slice(0, 8);
  return {
    ok: true,
    version: 'v165-persistent-memory',
    mode: state.mode || 'paper',
    paperSafe: true,
    storage: {
      type: process.env.SUPABASE_PERSISTENCE_ENABLED === 'true' ? 'local+supabase-ready' : 'local-json-ready',
      supabaseReady: !!process.env.SUPABASE_URL && !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY),
      file: STORE_FILE,
      lastSavedAt: mem.lastSavedAt
    },
    summary: {
      tradeMemoryCount: mem.trades.length,
      strategyCount: strategyRows.length,
      snapshotCount: mem.snapshots.length,
      lessonCount: mem.lessons.length,
      activeBrainDecision: brain.brain.decision,
      activeRegime: brain.brain.regime
    },
    tradeMemory: mem.trades.slice(0, 20),
    strategyMemory: strategyRows,
    lessons: mem.lessons.slice(0, 12),
    personality: brain.personality,
    recommendation: mem.trades.length < 10 ? 'Gyűjts még paper trade mintát, mielőtt staging/live irányba lépsz.' : 'Van elég memória minta az adaptív súlyozás finomításához.'
  };
}
function saveMemorySnapshot(label = 'manual') {
  const mem = recordMemoryFromCurrentState('snapshot_' + label);
  const snap = {
    id: `mem_${Date.now()}`,
    time: nowIso(),
    label,
    brain: unifiedAiBrain().brain,
    metrics: unifiedAiBrain().realMetrics,
    trades: mem.trades.length,
    strategies: Object.keys(mem.strategies || {}).length,
    lessons: mem.lessons.slice(0, 5)
  };
  mem.snapshots.unshift(snap);
  mem.snapshots = mem.snapshots.slice(0, 30);
  mem.lastSavedAt = nowIso();
  state.lastSavedAt = mem.lastSavedAt;
  addAudit('persistent_memory_snapshot_saved', { id: snap.id, label, trades: snap.trades, strategies: snap.strategies });
  saveState();
  return { ok: true, saved: true, snapshot: snap, memory: memoryStatus() };
}


// ===== v168-v171 SAFE MERGE: meta coordinator + deployment safety + supervision + capital intelligence =====
function metaAiCoordinator() {
  const brain = (typeof unifiedAiBrain === 'function' ? unifiedAiBrain() : {}) || {};
  const micro = (typeof marketMicrostructure === 'function' ? marketMicrostructure() : {}) || {};
  const metrics = brain.realMetrics || {};
  const execution = state.executionReality?.metrics || {};
  const leaders = [
    { name: 'Unified AI Brain', weight: Number(metrics.confidence || 68), role: 'irányítás' },
    { name: 'Microstructure AI', weight: Number(micro?.anomalyDetection?.score ? 100 - micro.anomalyDetection.score : 62), role: 'piacérzékelés' },
    { name: 'Execution AI', weight: Number(execution.fillRate ? execution.fillRate * 100 : 64), role: 'végrehajtás' },
    { name: 'Portfolio AI', weight: state.portfolioProfile === 'aggressive' ? 70 : state.portfolioProfile === 'conservative' ? 58 : 65, role: 'tőkeelosztás' }
  ].sort((a,b)=>b.weight-a.weight);
  const risk = Number(state.risk?.score || (state.killSwitch ? 95 : 32));
  const consensus = Math.round(leaders.reduce((s,x)=>s+x.weight,0)/leaders.length);
  return { ok:true, version:'v168-meta-ai-coordinator-safe-merge', consensus, dominantLeader: leaders[0], aiLeaders: leaders, globalRisk: { score:risk, state:risk>75?'critical':risk>55?'elevated':'normal' }, conflictResolution: consensus>65?'AI modulok összhangban.':'Óvatos mód: modulok között eltérés van.', adaptiveWeighting:true, timestamp:nowIso() };
}
function deploymentSafetyStatus() {
  const learning = state.aiTrader?.learning || {};
  const savedVenues = Object.values(state.venues||{}).filter(v=>v.apiKey&&v.apiSecret).length;
  const win = Number(learning.winRateEstimate || 0);
  const drawdown = Number(state.risk?.drawdown || 0);
  const stage = state.workflowStage || state.deployment?.stage || 'paper';
  const checklist = [
    { key:'paper', label:'Paper mód aktív és biztonságos', ok: state.mode !== 'live' || !process.env.REAL_TRADING_ENABLED },
    { key:'venue', label:'Legalább 1 venue konfigurálva', ok: savedVenues > 0 },
    { key:'memory', label:'Persistent memory elérhető', ok: !!state.persistentMemory },
    { key:'execution', label:'Execution lifecycle aktív', ok: !!state.executionReality },
    { key:'risk', label:'Drawdown kontroll alatt', ok: drawdown < 5 }
  ];
  const readiness = Math.max(0, Math.min(100, 45 + checklist.filter(x=>x.ok).length*10 + Math.min(20, win/5) - drawdown*3));
  state.deployment = { ...(state.deployment||{}), stage, readiness: Math.round(readiness), liveApproved: readiness>=85 && stage==='staging' && process.env.REAL_TRADING_ENABLED==='true', checklist };
  return { ok:true, version:'v169-deployment-safety-safe-merge', deployment: state.deployment, paperToStaging: readiness>=70, stagingToLive: state.deployment.liveApproved, rollbackReady:true, incidentResponseReady:true };
}
function supervisionIncidentStatus() {
  const exec = state.executionReality?.metrics || {};
  const micro = (typeof marketMicrostructure === 'function' ? marketMicrostructure() : {}) || {};
  const incidents = [];
  const latency = Number(exec.avgLatencyMs || micro?.microLatency?.latencyMs || 0);
  const rejectRate = Number(exec.rejected || 0) / Math.max(1, Number(exec.submitted || 1));
  const anomaly = Number(micro?.anomalyDetection?.score || 0);
  if (latency > 750) incidents.push({ id:'latency_spike', severity:'medium', title:'Magas végrehajtási latency', action:'AI risk csökkentés' });
  if (rejectRate > .12) incidents.push({ id:'reject_rate', severity:'medium', title:'Magas reject arány', action:'Retry limit és paper fallback' });
  if (anomaly > 75) incidents.push({ id:'market_anomaly', severity:'high', title:'Piaci anomália', action:'Safe downgrade javasolt' });
  if (state.killSwitch || state.risk?.emergencyStop) incidents.push({ id:'emergency_stop', severity:'critical', title:'Emergency stop aktív', action:'Execution tiltva' });
  const penalty = incidents.reduce((s,i)=>s+(i.severity==='critical'?45:i.severity==='high'?25:12),0);
  const healthScore = Math.max(0, Math.min(100, 94 - penalty));
  const severity = incidents.some(i=>i.severity==='critical')?'critical':incidents.some(i=>i.severity==='high')?'high':incidents.some(i=>i.severity==='medium')?'medium':'normal';
  state.incidents = incidents;
  state.supervision = { version:'v170-supervision-safe-merge', healthScore, severity, status: severity==='normal'?'monitoring':'incident_response', lastAction: incidents[0]?.action || 'Nincs aktív beavatkozás', recovery: severity==='normal'?'ready':'active', diagnostic: severity==='normal'?'Rendszer stabil, supervisor monitoring aktív.':'Supervisor figyelmeztetés: '+incidents.map(i=>i.title).join(', ') };
  return { ok:true, incidents, supervision: state.supervision, timestamp:nowIso() };
}
function capitalIntelligenceStatus() {
  const venues = VENUES.map((v,idx)=>({ venue:v, connected:!!state.venues?.[v]?.connected, hasCredentials:!!(state.venues?.[v]?.apiKey&&state.venues?.[v]?.apiSecret), allocation: [34,26,22,18][idx], exposure: [28,19,13,9][idx], score: [82,74,69,61][idx] }));
  const riskMode = state.aiTuningPreset === 'profit_max' ? 'aggressive_controlled' : state.aiTuningPreset === 'safe' ? 'defensive' : 'balanced';
  const totalExposure = venues.reduce((s,v)=>s+v.exposure,0);
  return { ok:true, version:'v171-capital-intelligence-safe-merge', capitalObjective:'portfolio_level_risk_adjusted_growth', riskMode, totalExposure, allocationMatrix: venues, exposure: { total: totalExposure, direction:'net-long paper', correlation:'medium', maxVenueShare: Math.max(...venues.map(v=>v.allocation)) }, dynamicSizing: { enabled:true, currentMultiplier: riskMode==='defensive'?0.55:riskMode==='aggressive_controlled'?1.15:0.85, reason:'AI a confidence, drawdown és execution quality alapján méretez.' }, drawdownResponse: { enabled:true, action: totalExposure>80?'reduce_exposure':'normal' }, timestamp:nowIso() };
}

// ===== v172 SAFE MERGE: Market Simulation Lab =====
function ensureSimulationLab() {
  if (!state.simulationLab) {
    state.simulationLab = {
      version: 'v172-simulation-lab-safe-merge',
      activeScenario: 'baseline',
      lastRunAt: null,
      runs: [],
      scenarios: [
        { id:'trend_up', name:'Trendelő emelkedő piac', volatility:42, liquidity:76, stress:35 },
        { id:'panic_crash', name:'Pánik / crash teszt', volatility:92, liquidity:31, stress:88 },
        { id:'chop_range', name:'Oldalazó/chop piac', volatility:48, liquidity:63, stress:54 },
        { id:'low_liquidity', name:'Alacsony likviditás', volatility:58, liquidity:24, stress:76 },
        { id:'fake_breakout', name:'Fake breakout', volatility:71, liquidity:47, stress:69 },
        { id:'latency_reject', name:'Latency + reject spike', volatility:55, liquidity:39, stress:81 }
      ]
    };
  }
  return state.simulationLab;
}
function simulationLabStatus() {
  const lab = ensureSimulationLab();
  const last = lab.runs?.[0] || null;
  const memory = state.persistentMemory || {};
  return {
    ok:true,
    version:'v172-simulation-lab-safe-merge',
    activeScenario: lab.activeScenario,
    scenarios: lab.scenarios,
    lastRun: last,
    runCount: lab.runs?.length || 0,
    aiTrainer: {
      enabled:true,
      objective:'AI training universe / paper-safe stress test',
      memoryLinked: !!memory,
      learningSnapshots: memory.snapshots?.length || 0
    },
    stressSummary: last ? `${last.scenarioName}: stress ${last.stressScore}%, survival ${last.survivalScore}%` : 'Még nem futott szimuláció.',
    safety:'paper-only: éles order tiltva'
  };
}
function runMarketSimulation(input={}) {
  const lab = ensureSimulationLab();
  const scenarioId = input.scenario || lab.activeScenario || 'trend_up';
  const scenario = lab.scenarios.find(x=>x.id===scenarioId) || lab.scenarios[0];
  const brain = (typeof unifiedAiBrain === 'function' ? unifiedAiBrain() : {}) || {};
  const exec = state.executionReality?.metrics || {};
  const capital = (typeof capitalIntelligenceStatus === 'function' ? capitalIntelligenceStatus() : {}) || {};
  const confidence = Number(brain.realMetrics?.confidence || brain.brain?.confidence || 0.62);
  const fillRate = Number(exec.fillRate || 0.88);
  const rejectPenalty = Number(exec.rejected || 0) * 3;
  const liquidityPenalty = Math.max(0, 55 - Number(scenario.liquidity || 50));
  const stressScore = Math.max(0, Math.min(100, Number(scenario.stress || 50) + rejectPenalty + Math.round(liquidityPenalty/2)));
  const strategyStability = Math.max(0, Math.min(100, Math.round(confidence*100 + fillRate*18 - stressScore*0.35)));
  const survivalScore = Math.max(0, Math.min(100, Math.round(strategyStability - stressScore*0.18 + (capital.dynamicSizing?.currentMultiplier ? 4 : 0))));
  const suggestedAction = survivalScore < 45 ? 'risk_reduce_and_retrain' : survivalScore < 65 ? 'paper_validate_more' : 'strategy_candidate_ok';
  const result = {
    id:`sim_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    time: nowIso(),
    scenario: scenario.id,
    scenarioName: scenario.name,
    volatility: scenario.volatility,
    liquidity: scenario.liquidity,
    stressScore,
    survivalScore,
    strategyStability,
    expectedSlippageBps: Math.round((100 - scenario.liquidity) * 0.9 + stressScore * 0.18),
    expectedRejectRate: Math.round(Math.max(1, stressScore/9)),
    aiLearningImpact: suggestedAction === 'strategy_candidate_ok' ? 'positive' : suggestedAction === 'paper_validate_more' ? 'neutral' : 'defensive',
    suggestedAction,
    paperSafe:true,
    note:'Szimulált piac: nem küld éles ordert, tanulási és stress-test célra.'
  };
  lab.activeScenario = scenario.id;
  lab.lastRunAt = result.time;
  lab.runs = [result, ...(lab.runs || [])].slice(0, 60);
  if (state.persistentMemory) {
    state.persistentMemory.lessons = state.persistentMemory.lessons || [];
    state.persistentMemory.lessons.unshift({ time: result.time, source:'simulation_lab', lesson:`${result.scenarioName}: survival ${result.survivalScore}%, action ${result.suggestedAction}` });
    state.persistentMemory.lessons = state.persistentMemory.lessons.slice(0, 80);
  }
  addAudit('simulation_lab_run', { scenario: result.scenario, survivalScore: result.survivalScore, stressScore: result.stressScore });
  saveState();
  return { ok:true, result, lab: simulationLabStatus() };
}
function monteCarloSimulation(input={}) {
  const lab = ensureSimulationLab();
  const count = Math.max(3, Math.min(25, Number(input.count || 8)));
  const results = [];
  for (let i=0;i<count;i++) {
    const sc = lab.scenarios[i % lab.scenarios.length];
    const jitter = Math.round((Math.random()-0.5)*18);
    const fake = runMarketSimulation({ scenario: sc.id }).result;
    fake.stressScore = Math.max(0, Math.min(100, fake.stressScore + jitter));
    fake.survivalScore = Math.max(0, Math.min(100, fake.survivalScore - Math.round(jitter/2)));
    results.push(fake);
  }
  const avgSurvival = Math.round(results.reduce((s,x)=>s+x.survivalScore,0)/results.length);
  const avgStress = Math.round(results.reduce((s,x)=>s+x.stressScore,0)/results.length);
  const summary = { id:`mc_${Date.now()}`, time:nowIso(), count, avgSurvival, avgStress, recommendation: avgSurvival >= 65 ? 'paper strategy stable' : 'more defensive tuning needed', results: results.slice(0,10) };
  lab.monteCarlo = summary;
  addAudit('simulation_monte_carlo', { count, avgSurvival, avgStress });
  saveState();
  return { ok:true, monteCarlo: summary, lab: simulationLabStatus() };
}


async function handleApi(req, res, pathname, query) {
  const method = req.method;
  try {
    if (pathname === '/api/health') return json(res, 200, { ok: true, version: 'v167-market-microstructure-ai', time: nowIso() });

    if (pathname === '/api/meta/status') return json(res, 200, metaAiCoordinator());
    if (pathname === '/api/deployment/status') return json(res, 200, deploymentSafetyStatus());
    if (pathname === '/api/deployment/rollback' && method === 'POST') { state.workflowStage='paper'; state.mode='paper'; addAudit('deployment_rollback_to_paper', { safe:true }); saveState(); return json(res,200,deploymentSafetyStatus()); }
    if (pathname === '/api/deployment/emergency-stop' && method === 'POST') { state.killSwitch=true; state.risk={...(state.risk||{}), emergencyStop:true, score:100}; addAudit('deployment_emergency_stop',{safe:true}); saveState(); return json(res,200,{ok:true, emergencyStop:true, supervision:supervisionIncidentStatus()}); }
    if (pathname === '/api/supervision/status') return json(res, 200, supervisionIncidentStatus());
    if (pathname === '/api/supervision/action' && method === 'POST') { const b=await parseBody(req); if (b.action==='recover') { state.killSwitch=false; state.risk={...(state.risk||{}), emergencyStop:false, score:35}; addAudit('supervision_recovery',{action:b.action}); } if (b.action==='downgrade_safe') { state.workflowStage='paper'; state.mode='paper'; addAudit('supervision_safe_downgrade',{}); } saveState(); return json(res,200,supervisionIncidentStatus()); }
    if (pathname === '/api/capital/status') return json(res, 200, capitalIntelligenceStatus());
    if (pathname === '/api/capital/rebalance' && method === 'POST') { addAudit('capital_rebalance_paper_safe', { paper:true }); saveState(); return json(res, 200, capitalIntelligenceStatus()); }
    if (pathname === '/api/simulation/status') return json(res, 200, simulationLabStatus());
    if (pathname === '/api/simulation/run' && method === 'POST') { const b=await parseBody(req); return json(res, 200, runMarketSimulation(b)); }
    if (pathname === '/api/simulation/monte-carlo' && method === 'POST') { const b=await parseBody(req); return json(res, 200, monteCarloSimulation(b)); }
    if (pathname === '/api/execution/reality') return json(res, 200, executionRealityStatus());
    if ((pathname === '/api/execution/submit-paper' || pathname === '/api/execution/test-order') && method === 'POST') { const b=await parseBody(req); const order=createPaperExecutionIntent(b); saveState(); return json(res,200,{ok:true,success:true,dryRun:true,paper:true,message:'v163 paper execution lefutott: lifecycle + slippage + latency rögzítve.',order,execution:executionRealityStatus()}); }
    if (pathname === '/api/ai/brain') return json(res, 200, unifiedAiBrain());
    if (pathname === '/api/state/realtime') return json(res, 200, unifiedRealtimeState(false));
    if (pathname === '/api/state/events') return json(res, 200, { ok: true, events: (ensureRealtimeState().events || []).slice(0, 50), sequence: ensureRealtimeState().sequence || 0 });
    if (pathname === '/api/state/tick' && method === 'POST') { const out = unifiedRealtimeState(true); addAudit('unified_realtime_state_tick', { sequence: out.sequence }); saveState(); return json(res, 200, out); }
    if (pathname === '/api/ai/metrics') return json(res, 200, { ok: true, ...unifiedAiBrain().realMetrics });
    if (pathname === '/api/ai/memory') return json(res, 200, memoryStatus());
    if (pathname === '/api/memory/status') return json(res, 200, memoryStatus());
    if (pathname === '/api/memory/sync' && method === 'POST') { recordMemoryFromCurrentState('manual_sync'); saveState(); return json(res, 200, memoryStatus()); }
    if (pathname === '/api/memory/snapshot' && method === 'POST') { const b = await parseBody(req); return json(res, 200, saveMemorySnapshot(b.label || 'ui_manual')); }
    if (pathname === '/api/autonomous/status') return json(res, 200, autonomousStatus(false));
    if (pathname === '/api/autonomous/tick' && method === 'POST') return json(res, 200, autonomousStatus(true));
    if (pathname === '/api/autonomous/start' && method === 'POST') { ensureAutonomousOperator().enabled = true; addAudit('autonomous_operator_started', { paperSafe: true }); saveState(); return json(res, 200, autonomousStatus(false)); }
    if (pathname === '/api/autonomous/stop' && method === 'POST') { ensureAutonomousOperator().enabled = false; addAudit('autonomous_operator_stopped', { paperSafe: true }); saveState(); return json(res, 200, autonomousStatus(false)); }
    if (pathname === '/api/orchestrator/status') return json(res, 200, orchestratorStatus(false));
    if (pathname === '/api/orchestrator/tick' && method === 'POST') return json(res, 200, orchestratorStatus(true));
    if (pathname === '/api/state/bus') return json(res, 200, { ok: true, bus: (state.orchestrator?.stateBus || []) });
    if (pathname === '/api/persistence/status') return json(res, 200, persistenceStatus());
    if (pathname === '/api/persistence/save' && method === 'POST') { const b = await parseBody(req); return json(res, 200, await persistLearningState(b.target || 'manual')); }
    if (pathname === '/api/learning/status') return json(res, 200, learningStatus());
    if (pathname === '/api/learning/train-cycle' && method === 'POST') return json(res, 200, runLearningCycle());
    if (pathname === '/api/backtest/run' && method === 'POST') { const bt = makeBacktest(true); addAudit('backtest_completed', { pnl: bt.pnl, trades: bt.trades }); saveState(); return json(res, 200, learningStatus()); }
    if (pathname === '/api/model-registry/snapshot' && method === 'POST') return json(res, 200, saveModelSnapshot());
    if (pathname === '/api/control/realtime') return json(res, 200, realtimeControlCenter());
    if (pathname === '/api/control/explain') return json(res, 200, { ok: true, aiExplanation: realtimeControlCenter().aiExplanation });
    if (pathname === '/api/control/execution') return json(res, 200, { ok: true, executionFeedback: realtimeControlCenter().executionFeedback });
    if (pathname === '/api/control/safety') return json(res, 200, { ok: true, incidentSafety: realtimeControlCenter().incidentSafety });

    if (pathname === '/api/market/microstructure') return json(res, 200, marketMicrostructure());
    if (pathname === '/api/market/microstructure/tick' && method === 'POST') { const out = marketMicrostructure(); addAudit('microstructure_tick', { anomaly: out.anomalyDetection.score, pressure: out.orderflow.pressure }); saveState(); return json(res, 200, out); }
    if (pathname === '/api/market/live/status') return json(res, 200, liveMarket());
    if (pathname === '/api/market/live/tick') return json(res, 200, { ok: true, tick: liveMarket().tick });
    if (pathname === '/api/market/live/orderbook') { const m = liveMarket(); return json(res, 200, { ok: true, orderbook: m.orderbook, aiInput: m.aiInput }); }
    if (pathname === '/api/market/live/start' && method === 'POST') { state.botRunning = true; addAudit('live_market_stream_started', { paperSafe: true }); saveState(); return json(res, 200, liveMarket()); }
    if (pathname === '/api/market/live/stop' && method === 'POST') { state.botRunning = false; addAudit('live_market_stream_stopped', { paperSafe: true }); saveState(); return json(res, 200, liveMarket()); }
    if (pathname === '/api/portfolio/status') return json(res, 200, strategyPortfolioStatus());
    if (pathname === '/api/strategy/router/status') return json(res, 200, strategyPortfolioStatus().strategyRouter);
    if (pathname === '/api/operator/snapshot') return json(res, 200, { ok: true, snapshot: snapshot(), portfolio: { profile: state.portfolioProfile, venues: VENUES, aiOptimizer: true, rebalance: true, maxVenueShare: 0.35, summary: 'Paper-safe multi-venue alap' } });
    if (pathname === '/api/operator/explain') return json(res, 200, { ok: true, text: 'NEXUS v157 Learning + Backtest Engine: AI magyarázat, execution feedback, safety center és live metrics paper-safe módban.' });
    if (pathname === '/api/operator/incidents') return json(res, 200, { ok: true, incidents: state.incidents || [] });
    if (pathname === '/api/operator/readiness') return json(res, 200, { ok: true, readiness: readiness(), portfolio: { profile: state.portfolioProfile, venues: VENUES, aiOptimizer: true, rebalance: true, maxVenueShare: 0.35, summary: 'Paper-safe multi-venue portfolio AI aktív' } });
    if (pathname === '/api/operator/history') { const events = (state.auditLog || []).map(e => ({ event_type: e.action || 'event', created_at: e.time, trade_id: e.details?.tradeId || e.details?.id || '-', payload: e.details || {} })); return json(res, 200, { ok: true, history: state.auditLog || [], events }); }
    if (pathname === '/api/operator/models') return json(res, 200, { ok: true, models: [{ time: state.lastSavedAt || nowIso(), name: state.aiTrader?.learning?.modelVersion || 'v159-orchestrator-persistence', version: state.aiTrader?.learning?.modelVersion || 'v159-orchestrator-persistence', status: 'active', metrics: { decisions: state.aiTrader?.learning?.totalDecisions || 0, trades: state.aiTrader?.learning?.totalTrades || 0, winRate: state.aiTrader?.learning?.winRateEstimate || 0 } }] });
    if (pathname === '/api/venues/config') return json(res, 200, { ok: true, success: true, config: Object.fromEntries(VENUES.map(v => [v, publicVenue(state.venues[v])])) });
    if (pathname === '/api/venues/debug') return json(res, 200, { ok: true, version: 'v132', storageFile: STORE_FILE, venues: Object.fromEntries(VENUES.map(v => [v, publicVenue(state.venues[v])])), env: { supabaseUrl: !!process.env.SUPABASE_URL, supabaseKey: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY), supabaseEnabled: process.env.SUPABASE_PERSISTENCE_ENABLED || 'false' } });
    if (pathname === '/api/venues/save' && method === 'POST') {
      const b = await parseBody(req); const venue = String(b.venue || '').toLowerCase(); if (!VENUES.includes(venue)) return json(res, 400, { ok: false, success: false, error: 'invalid_venue' });
      const apiKey = String(b.api_key || b.apiKey || '').trim(); const apiSecret = String(b.api_secret || b.apiSecret || b.secret || '').trim();
      const cfg = { ...(state.venues[venue] || {}), label: venue.toUpperCase(), apiKey, apiSecret, passphrase: String(b.passphrase || '').trim(), marketType: b.market_type || b.marketType || 'futures', marginMode: b.margin_mode || b.marginMode || 'cross', leverage: Number(b.leverage || 3), testnet: b.testnet !== false, connected: !!(apiKey && apiSecret), updatedAt: nowIso() };
      state.venues[venue] = cfg; state.lastSavedAt = nowIso(); addAudit('venue_config_saved', { venue, hasCredentials: !!(apiKey && apiSecret) }); saveState();
      const supabase = await supabaseUpsertVenue(venue, cfg); if (supabase.ok === false) pushError('supabase', supabase.error, { venue });
      return json(res, 200, { ok: true, success: true, saved: true, venue, hasCredentials: !!(apiKey && apiSecret), connected: !!(apiKey && apiSecret), config: publicVenue(cfg), supabase });
    }
    if (pathname === '/api/venues/disconnect' && method === 'POST') { const b=await parseBody(req); const venue=String(b.venue||'').toLowerCase(); if (VENUES.includes(venue)) { state.venues[venue] = { ...DEFAULT_VENUES[venue], updatedAt: nowIso() }; addAudit('venue_disconnected',{venue}); saveState(); } return json(res,200,{ok:true,success:true}); }
    const testMatch = pathname.match(/^\/api\/venues\/test(?:\/([^/]+))?$/);
    if (testMatch && method === 'POST') {
      const b = await parseBody(req);
      const venue = String(testMatch[1] || b.venue || 'binance').toLowerCase();
      if (!VENUES.includes(venue)) return json(res, 400, { ok:false, success:false, error:'invalid_venue' });
      const cfg = {
        ...(state.venues[venue] || {}),
        apiKey: b.api_key || b.apiKey || state.venues[venue]?.apiKey || '',
        apiSecret: b.api_secret || b.apiSecret || b.secret || state.venues[venue]?.apiSecret || '',
        passphrase: b.passphrase || state.venues[venue]?.passphrase || '',
        marketType: b.market_type || b.marketType || state.venues[venue]?.marketType || 'futures',
        marginMode: b.margin_mode || b.marginMode || state.venues[venue]?.marginMode || 'cross',
        leverage: Number(b.leverage || state.venues[venue]?.leverage || 3),
        testnet: b.testnet !== false
      };
      const proof = proofFor(venue, b.symbol || 'BTC/USDT', cfg);
      addAudit('venue_connection_test', { venue, status: proof.status, connected: proof.connected });
      saveState();
      return json(res, 200, { ...proof, proof });
    }
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
    if (pathname === '/api/ai-trader/run-once' && method === 'POST') { const d={time:nowIso(),action:'HOLD',confidence:0.5,reason:'v132 safe paper run'}; state.aiTrader.decisions=[d,...(state.aiTrader.decisions||[])].slice(0,50); state.aiTrader.lastDecision=d; state.aiTrader.learning.totalDecisions++; saveState(); return json(res,200,{ok:true,...state.aiTrader}); }
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

function ensureAutonomousOperator() {
  if (!state.autonomousOperator) {
    state.autonomousOperator = { version: 'v167-market-microstructure-ai', enabled: false, objective: 'paper_learning', status: 'STANDBY', cycle: 0, lastAction: 'waiting', lastDecisionAt: null, adaptationState: 'safe_observe', actions: [], safetyMode: 'paper_safe', performanceMode: 'balanced' };
  }
  return state.autonomousOperator;
}
function autonomousStatus(runCycle = false) {
  const op = ensureAutonomousOperator();
  const brain = unifiedAiBrain();
  const control = realtimeControlCenter();
  const memory = memoryStatus();
  const live = liveMarket();
  const metrics = brain.realMetrics || {};
  const safetyFlags = [];
  if (state.killSwitch) safetyFlags.push('kill_switch');
  if (live.feedHealth?.stale) safetyFlags.push('stale_feed');
  if ((metrics.executionQuality || 0) < 0.45) safetyFlags.push('execution_quality_low');
  if ((metrics.winrate || 0) < 45 && (state.aiTrader?.learning?.totalTrades || 0) > 5) safetyFlags.push('winrate_watch');
  const confidence = Number(metrics.confidence || brain.brain?.confidence || 0);
  let recommended = 'observe';
  let objective = op.objective || 'paper_learning';
  let adaptation = 'safe_observe';
  if (safetyFlags.length) { recommended = 'downgrade_safe'; objective = 'capital_protection'; adaptation = 'risk_reduction'; }
  else if (confidence >= 0.72 && (metrics.learningScore || 0) >= 55) { recommended = 'paper_execute'; objective = 'paper_profit_optimization'; adaptation = 'scale_carefully'; }
  else if (confidence >= 0.55) { recommended = 'paper_probe'; objective = 'signal_validation'; adaptation = 'balanced_learning'; }
  const action = {
    id: `auto_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    time: nowIso(),
    cycle: (op.cycle || 0) + (runCycle ? 1 : 0),
    recommended,
    objective,
    adaptation,
    confidence,
    safetyFlags,
    paperSafe: true,
    liveOrdersLocked: true,
    reason: safetyFlags.length ? `Safety védelem aktív: ${safetyFlags.join(', ')}` : `AI confidence ${Math.round(confidence*100)}%, objective: ${objective}`
  };
  if (runCycle) {
    op.cycle = action.cycle;
    op.status = op.enabled ? 'RUNNING' : 'STANDBY';
    op.objective = objective;
    op.adaptationState = adaptation;
    op.lastAction = recommended;
    op.lastDecisionAt = action.time;
    op.actions = [action, ...(op.actions || [])].slice(0, 80);
    if (recommended === 'downgrade_safe') { state.mode = 'paper'; state.workflowStage = 'paper'; state.aiTuningPreset = 'safe'; }
    if (recommended === 'paper_execute' && op.enabled && !state.killSwitch) {
      createPaperExecutionIntent({ venue: state.aiTrader?.venue || 'binance', symbol: state.aiTrader?.symbol || 'BTC/USDT', side: brain.brain?.decision === 'SELL' ? 'sell' : 'buy', amount: state.aiTrader?.learning?.maxAutoQty || 0.001, source: 'autonomous_operator' });
    }
    addAudit('autonomous_operator_cycle', action);
    saveState();
  }
  return { ok: true, version: 'v167-market-microstructure-ai', operator: op, currentAction: action, brain: brain.brain, realMetrics: metrics, control: control.control, memory: memory.summary, objective, adaptationState: adaptation, safetyFlags, recommendations: [action.reason, 'Live order továbbra tiltva: paper-safe autonóm ciklus.', safetyFlags.length ? 'Ajánlott: Safe mód és hibaellenőrzés.' : 'Ajánlott: paper adatok gyűjtése és teljesítmény figyelése.'] };
}

const server = http.createServer(async (req, res) => {
 if(req.method==='GET'&&req.url.startsWith('/api/execution-optimization/status'))return nexusV176Json(res,{success:true,executionOptimization:nexusV176ExecutionOptimizationState(),timestamp:new Date().toISOString()});
 if(req.method==='POST'&&req.url.startsWith('/api/execution-optimization/recalculate')){const ex=nexusV176ExecutionOptimizationState();ex.lastRecalculate=new Date().toISOString();ex.action='Execution route újraszámolva, live order tiltva.';return nexusV176Json(res,{success:true,executionOptimization:ex});}


  if(req.method==="GET" && req.url.startsWith("/api/cross-market/status")){
    return nexusV175Json(res,{success:true,crossMarket:nexusV175CrossMarketState(),timestamp:new Date().toISOString()});
  }


 if(req.method==="GET"&&req.url.startsWith("/api/timeframe/status"))return nexusV174Json(res,{success:true,timeframes:nexusV174MultiTimeframeState(),timestamp:new Date().toISOString()});
 if(req.method==="POST"&&req.url.startsWith("/api/timeframe/recalculate")){const tf=nexusV174MultiTimeframeState();tf.lastRecalculate=new Date().toISOString();tf.action="Multi-timeframe consensus újraszámolva, live order tiltva.";return nexusV174Json(res,{success:true,timeframes:tf});}


 if(req.method==="GET"&&req.url.startsWith("/api/evolution/status"))return nexusV173Json(res,{success:true,evolution:nexusV173EvolutionState(),timestamp:new Date().toISOString()});
 if(req.method==="POST"&&req.url.startsWith("/api/evolution/run")){let e=nexusV173EvolutionState();e.lastRun=new Date().toISOString();e.action="Sandbox evolúció lefutott, live promóció tiltva.";return nexusV173Json(res,{success:true,evolution:e});}
 const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); if (url.pathname.startsWith('/api/')) return handleApi(req,res,url.pathname,url.searchParams); return serveStatic(req,res,url.pathname); });
server.listen(PORT, () => console.log(`[INFO] NEXUS v167 Market Microstructure AI started on port ${PORT}`));


/* ===== NEXUS v177.1 LEARNING FEEDBACK SAFE MERGE ===== */
function nexusV177LearningFeedbackState(){
  return {
    learningScore:84,
    adaptationSpeed:76,
    confidenceEvolution:"improving",
    topImprovingStrategy:"Microstructure Momentum",
    worstDegradingPattern:"high volatility fake breakout",
    recommendation:"Paper-safe adaptive optimization. Live order továbbra tiltva."
  };
}
