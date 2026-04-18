const ccxt = require('ccxt');
const path = require('path');

function createContext() {
  const CONFIG = {
    symbols: (process.env.SYMBOLS || 'BTC/USDT,ETH/USDT').split(','),
    timeframe: process.env.TIMEFRAME || '1m',
    historyLimit: Number(process.env.HISTORY_LIMIT || 300),
    pollMs: Number(process.env.POLL_MS || 2000),
    riskPerTrade: Number(process.env.RISK_PER_TRADE || 0.003),
    maxDailyLossPct: Number(process.env.MAX_DAILY_LOSS_PCT || 0.03),
    maxDrawdownPct: Number(process.env.MAX_DRAWDOWN_PCT || 0.10),
    atrStopMultiplier: Number(process.env.ATR_STOP_MULT || 1.5),
    atrTakeMultiplier: Number(process.env.ATR_TAKE_MULT || 2.8),
    minConfidence: Number(process.env.MIN_CONFIDENCE || 0.68),
    dryRun: String(process.env.DRY_RUN || 'true') === 'true',
    arbitrageMinNetEdgePct: Number(process.env.ARB_MIN_NET_EDGE_PCT || 0.0025),
    modelPath: process.env.MODEL_PATH || './model/tfjs_model/model.json',
    exchanges: (process.env.EXCHANGES || 'binance,bybit,kraken,okx').split(','),
    port: Number(process.env.PORT || 3000),
    trainIntervalMs: Number(process.env.TRAIN_INTERVAL_MS || 21600000),
    minPromotionTrades: Number(process.env.MIN_PROMOTION_TRADES || 30),
    validationAccuracyFloor: Number(process.env.VALIDATION_ACCURACY_FLOOR || 0.45),
    modelPromotionMinPnlDelta: Number(process.env.MODEL_PROMOTION_MIN_PNL_DELTA || 0),
    enableAutoTrain: String(process.env.ENABLE_AUTOTRAIN || 'true') === 'true',
    projectRoot: path.join(__dirname, '..', '..'),
    useSandbox: String(process.env.USE_SANDBOX || 'false') === 'true'
  };

  const exchanges = {
    binance: new ccxt.binance({ apiKey: process.env.API_KEY, secret: process.env.API_SECRET, enableRateLimit: true, options: { defaultType: 'future' } }),
    bybit: new ccxt.bybit({ apiKey: process.env.BYBIT_KEY, secret: process.env.BYBIT_SECRET, enableRateLimit: true }),
    kraken: new ccxt.kraken({ apiKey: process.env.KRAKEN_KEY, secret: process.env.KRAKEN_SECRET, enableRateLimit: true }),
    okx: new ccxt.okx({ apiKey: process.env.OKX_KEY, secret: process.env.OKX_SECRET, password: process.env.OKX_PASSWORD, enableRateLimit: true })
  };

  if (CONFIG.useSandbox) {
    Object.values(exchanges).forEach(ex => {
      try { ex.setSandboxMode(true); } catch (_) {}
    });
  }

  const activeExchanges = CONFIG.exchanges.filter(name => exchanges[name]);
  const primaryExchange = exchanges[activeExchanges[0] || 'binance'];

  const state = {
    equity: Number(process.env.START_EQUITY || 10000),
    peakEquity: Number(process.env.START_EQUITY || 10000),
    dailyStartEquity: Number(process.env.START_EQUITY || 10000),
    botEnabled: false,
    killSwitch: false,
    priceCache: {},
    latencyStats: {},
    openPositions: {},
    closedTrades: [],
    alerts: [],
    logs: [],
    equitySeries: [Number(process.env.START_EQUITY || 10000)],
    aiDecision: {},
    featureCache: {},
    arbitrage: [],
    stats: { totalTrades: 0, wins: 0, losses: 0, pnl: 0, winRate: 0 },
    modelLoaded: false,
    modelInfo: { backend: 'indicator-ensemble-fallback', activeVersion: null },
    training: { lastRunAt: null, running: false, lastResult: null, candidateVersion: null, activeVersion: null },
    exchangeConnections: {},
    exchangeSecrets: {},
    venueSockets: {},
    venueSocketState: {},
    maintenance: { retention: { lastRunAt: null, lastResult: null } },
    persistence: { storageRoot: null, learningState: {}, activeModel: null, modelVersions: 0, persistedTradeEvents: 0 },
    remoteStorage: { enabled: false, configured: false, bucket: null, lastHydration: null },
    capitalPlan: [],
    strategyModes: {},
    workflow: { stage: 'paper', mode: 'paper_safe', status: 'idle', lastStartAt: null, lastStopAt: null, lastStageChangeAt: null, liveApprovalAt: null },
    liveSafety: { stage: 'paper', config: {}, lastGuardResult: null },
    stagePolicies: {},
    lastEmergencyEvent: null,
    portfolioManager: { venueCapitalPlan: [], limits: null },
    edgeContext: {},
    automationSummary: { promote: false, tuning: null, reinvest: null },
    profitState: { opportunities: [], fundingArbs: [], executionProfiles: {} },
    brainState: { meta: {}, arena: {}, selfEvolving: null },
    autonomousState: { pilot: null, retrain: null, canRunWithoutOperator: false },
    aiTuning: { preset: 'balanced', target: 'steady_growth', leverageBias: 1, confidenceBoost: 0, riskBias: 1, lastUpdatedAt: null },
    portfolioUpgrade: { profile: 'balanced', maxVenueShare: 0.4, rebalanceEnabled: true, aiOptimizerEnabled: true, lastUpdatedAt: null }
  };

  const helpers = {
    pushLog(level, message, extra = {}) {
      state.logs.unshift({ time: new Date().toISOString(), level, message, extra });
      state.logs = state.logs.slice(0, 250);
      console.log(`[${level}] ${message}`, extra);
    },
    pushAlert(type, title, details = {}) {
      state.alerts.unshift({ time: new Date().toISOString(), type, title, details });
      state.alerts = state.alerts.slice(0, 150);
      helpers.pushLog(type.toUpperCase(), title, details);
    },
    drawdownPct() { return (state.peakEquity - state.equity) / Math.max(1, state.peakEquity); },
    dailyLossPct() { return (state.dailyStartEquity - state.equity) / Math.max(1, state.dailyStartEquity); },
    updateWinRate() {
      const total = state.stats.wins + state.stats.losses;
      state.stats.winRate = total ? state.stats.wins / total : 0;
    },
    safeNum(v, fallback = 0) { return Number.isFinite(v) ? v : fallback; },
    calculatePositionSize(entryPrice, stopPrice) {
      const riskCapital = state.equity * CONFIG.riskPerTrade;
      const stopDistance = Math.abs(entryPrice - stopPrice);
      if (!stopDistance || !entryPrice) return 0;
      return Math.max(0, Number((riskCapital / stopDistance).toFixed(6)));
    }
  };

  return { CONFIG, exchanges, activeExchanges, primaryExchange, state, helpers };
}

module.exports = { createContext };