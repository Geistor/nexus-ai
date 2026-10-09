'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { probeAdmission } = require('../backend/services/probeAdmission');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

// Exercise production functions without starting servers, storage, timers or exchange requests.
function loadFunction(name, context) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf('\n}', start) + 2;
  return vm.runInNewContext(`(${source.slice(start, end)})`, context);
}
const allowed = () => ({ mode: 'staging', enabled: true, openCount: 0, maxOpen: 1,
  cooldownOk: true, protection: { severity: 'cautious', previousEngineContext: { protectionBridgeActive: true } },
  currentTrades: 0, recoveryCap: 2, netEdgePct: 0.08, minNetEdgePct: 0.035 });

test('recovery admits only the first two closed-trade slots; cannot downgrade to ordinary bootstrap', () => {
  for (const count of [0, 1]) assert.equal(probeAdmission({ ...allowed(), currentTrades: count }).ok, true);
  for (const count of [2, 3, 4]) assert.ok(probeAdmission({ ...allowed(), currentTrades: count }).blockers.includes('probe_recovery_budget_exhausted'));
});
test('live, full concurrency, cooldown, protective state and invalid net edge fail closed', () => {
  for (const change of [{ mode: 'live' }, { enabled: false }, { openCount: 1 }, { cooldownOk: false },
    { protection: { severity: 'protective' } }, { netEdgePct: NaN }, { netEdgePct: Infinity }, { netEdgePct: -0.01 }]) {
    assert.equal(probeAdmission({ ...allowed(), ...change }).ok, false, JSON.stringify(change));
  }
});
test('protective probation is explicit and cannot silently open ordinary protective probes', () => {
  const protection = { severity: 'protective', currentEngineLossStreak: 2, lossStreakPauseActive: false, previousEngineContext: { protectionBridgeActive: false } };
  assert.equal(probeAdmission({ ...allowed(), protection }).ok, false);
  assert.equal(probeAdmission({ ...allowed(), protection, allowProtectiveProbation: true }).ok, true);
});

function fixture(mode = 'staging') {
  const noop = () => {};
  const protection = { severity: 'warmup', sizeFactor: 1, confidenceLift: 0, previousEngineContext: { protectionBridgeActive: false } };
  const c = {
    db: { mode, signals: [], exchanges: { binance: {} }, orders: [], tradeJournal: [],
      riskLimits: { minConfidencePct: 74, maxSpreadPct: 0.25, maxDailyLossPct: 2, maxPositionSizePct: 5 },
      learningGuard: { lastRunAt: 'now' }, capital: { activeTradingCapital: 1000 }, paperAccount: { available: 1000 } },
    protection, probeAdmission, ACTIVE_LEARNING_PROBE_ENABLED: true, ACTIVE_LEARNING_MAX_CONCURRENT_PROBES: 4, ACTIVE_LEARNING_MAX_CONCURRENT_PROBES_PER_VENUE: 1,
    BRIDGED_RECOVERY_MAX_CURRENT_TRADES: 2, ACTIVE_LEARNING_PROBE_MIN_NET_EDGE_PCT: 0.035,
    SUPERVISED_DISCOVERY_MIN_NET_EDGE_PCT: 0.005, SUPERVISED_DISCOVERY_IDLE_MS: 480000,
    PROTECTIVE_PROBATION_MIN_NET_EDGE_PCT: 0.045,
    ACTIVE_LEARNING_PROBE_POSITION_SIZE_PCT: 0.1, CURRENT_STRATEGY_VERSION: 'test',
    LEARNING_GUARD_HARD_BLOCK_CONFIDENCE: 50, LEARNING_GUARD_TRADE_FLOW_PROTECTION: true,
    TECHNICAL_SIGNAL_MIN_EDGE: 12, MULTI_VENUE_TRADING_ENABLED: true, MULTI_VENUE_PRIMARY_SOURCE_REQUIRED: true,
    isRealTestnetSubmitEnabled: () => true,
    readiness: () => ({ blockers: [], startAllowed: true }), normalizedSymbolWhitelist: () => ['BTC/USDT'],
    normalizeSymbol: s => s, normalizeVenue: s => String(s).toLowerCase(),
    onlineLearningMarketVenue: row => String(row?.requestedVenue || row?.entryMarketVenue || row?.venue || 'binance').toLowerCase(),
    venueSupervisorFor: venue => ({ venue: String(venue || 'binance').toLowerCase(), tradeAllowed: true, mode: 'cautious', reason: 'test', riskMultiplier: 0.62, riskBudgetUsd: 1000, equityUsd: 1000, availableCapitalUsd: 1000, discovery: { allowed: true, status: 'ready', maxNotionalUsd: 0.2 } }),
    venueCapitalFor: venue => ({ venue: String(venue || 'binance').toLowerCase(), tradeAllowed: true, equityUsd: 1000, availableCapitalUsd: 1000, riskBudgetUsd: 1000 }),
    asArray: a => Array.isArray(a) ? a : [], clamp: (n, lo, hi) => Math.max(lo, Math.min(hi, n)),
    buildStrategyAutopilotControl: () => ({ enabled: false }),
    learningGuardDecisionCheck: () => ({ blockers: [], warnings: [] }), currentStrategyRiskAdjustment: () => ({}),
    snapshotMatchesMarketBinding: () => true, marketDataQualityForSnapshot: () => ({ confidenceLiftPct: 0 }),
    marketSnapshotIsFreshTrusted: () => true, paperEntryCooldownStatus: () => ({ ok: true }),
    recentVerifiedQualityProtection: () => c.protection,
    normalizeCapitalVault: () => c.db.capital,
    activeLearningOpenProbeCount: () => c.db.orders.length,
    activeLearningOpenProbeCountForVenue: venue => c.db.orders.filter(row => String(row?.requestedVenue || row?.entryMarketVenue || row?.venue || '').toLowerCase() === String(venue || '').toLowerCase()).length,
    currentStrategyVerifiedTrades: () => c.db.tradeJournal,
    activeLearningProbeCooldownStatus: () => ({ ok: true }),
    calculatePortfolioRiskScaling: () => ({ nextOrderNotionalUsd: 50, maxOrderNotionalUsd: 50,
      targetPositionSizePct: 5, effectiveMaxPositionSizePct: 5 }),
    uid: () => 'test-id', now: () => '2026-09-05T00:00:00Z', pushRuntime: noop, pushEvent: noop
  };
  c.currentProbeAdmission = loadFunction('currentProbeAdmission', c);
  return c;
}
function decision() {
  return { id: 'd', symbol: 'BTC/USDT', side: 'BUY', confidence: 75,
    marketSnapshot: { venue: 'binance', symbol: 'BTC/USDT', price: 100 }, marketBinding: { ok: true },
    tradeActivity: { activeLearningProbe: true, activeLearningProbeMode: 'bootstrap-probe', probeNetEdgePct: 0.08 },
    features: { technical: { ready: true }, spreadPct: 0.01 },
    routing: { walkForwardReady: false, costAndPersistenceReady: false }, risk: { positionSizePct: 0.05, maxLossPct: 0.1 }
  };
}
test('production riskGate allows local STAGING learning with real testnet submit enabled', () => {
  const c = fixture();
  assert.equal(loadFunction('riskGate', c)(decision()), true, JSON.stringify(c.db.lastRiskGate));
});
test('production riskGate still rejects ordinary STAGING without walk-forward proof', () => {
  const c = fixture(); const d = decision(); d.tradeActivity.activeLearningProbe = false;
  assert.equal(loadFunction('riskGate', c)(d), false);
});
test('production riskGate rechecks current loss protection instead of trusting an older signal', () => {
  const c = fixture(); const d = decision(); d.routing.qualityProtection = { severity: 'warmup' };
  c.protection = { severity: 'protective' };
  assert.equal(loadFunction('riskGate', c)(d), false);
  assert.ok(c.db.lastRiskGate.blockers.includes('probe_loss_protection'));
});
test('production riskGate admits the one explicit protective probation path after the pause', () => {
  const c = fixture();
  c.protection = { severity: 'protective', currentEngineLossStreak: 2, globalLossStreak: 2, lossStreakPauseActive: false,
    sizeFactor: 0.24, confidenceLift: 8, previousEngineContext: { protectionBridgeActive: false } };
  const d = decision();
  d.tradeActivity.activeLearningProbeMode = 'protective-probation-probe';
  d.tradeActivity.globalLossProtection = { active: false, lossStreak: 2, severity: 'protective' };
  assert.equal(loadFunction('riskGate', c)(d), true, JSON.stringify(c.db.lastRiskGate));
});
test('production sizing ignores oversized requested quantity for STAGING probes', () => {
  const c = fixture();
  const qty = loadFunction('capitalPositionQuantity', c)(100, decision(), { price: 100 }, 10000);
  assert.ok(qty > 0 && qty * 100 <= 0.500001, `notional ${qty * 100}`);
});
test('probe concurrency is venue-local: another exchange may learn in parallel, same exchange may not', () => {
  const c = fixture();
  c.db.orders = [{ venue: 'okx' }];
  const binanceDecision = decision();
  assert.equal(c.currentProbeAdmission(binanceDecision).ok, true, JSON.stringify(c.currentProbeAdmission(binanceDecision)));
  const okxDecision = decision(); okxDecision.marketSnapshot.venue = 'okx';
  const blocked = c.currentProbeAdmission(okxDecision);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.blockers.includes('probe_concurrency_limit'));
});
test('all four venues permit local learning in PAPER and STAGING', () => {
  for (const mode of ['paper', 'staging']) for (const venue of ['binance', 'bybit', 'okx', 'kraken']) {
    const c = fixture(mode); const d = decision(); d.marketSnapshot.venue = venue;
    assert.equal(loadFunction('riskGate', c)(d), true, `${mode}/${venue}`);
  }
});
test('LIVE probes cannot pass the production risk gate', () => {
  const c = fixture('live');
  assert.equal(loadFunction('riskGate', c)(decision()), false);
  assert.ok(c.db.lastRiskGate.blockers.includes('probe_mode_blocked'));
});
test('production admission cannot reuse a saved recovery signal after its two-trade budget', () => {
  const c = fixture(); c.protection = allowed().protection; c.db.tradeJournal = [{}, {}];
  assert.equal(loadFunction('riskGate', c)(decision()), false);
  assert.ok(c.db.lastRiskGate.blockers.includes('probe_recovery_budget_exhausted'));
});
test('production protection keeps old losses as prior but stops after two own losses', () => {
  const c = fixture();
  Object.assign(c, { PAPER_ENTRY_COOLDOWN_MS: 1000, PROFIT_RECOVERY_GLOBAL_LOSS_STREAK: 3,
    PROFIT_RECOVERY_GLOBAL_PAUSE_MS: 60000, BRIDGED_RECOVERY_MAX_CURRENT_TRADES: 2, VERIFIED_QUALITY_GUARD_MIN_TRADES: 8,
    VERIFIED_QUALITY_GUARD_HARD_WR: 30, VERIFIED_QUALITY_GUARD_SOFT_WR: 45,
    verifiedLearningTrades: () => Array.from({ length: 10 }, () => ({ strategyVersion: 'v199_164-old', netPnl: -1 })) });
  const protect = loadFunction('recentVerifiedQualityProtection', c);
  assert.equal(protect().severity, 'cautious');
  assert.equal(protect().currentEngineLossStreak, 0);
  c.db.tradeJournal = [{ netPnl: -0.01, closedAt: new Date().toISOString() }, { netPnl: -0.01 }];
  const protectedNow = protect();
  assert.equal(protectedNow.severity, 'protective');
  assert.equal(protectedNow.currentEngineLossStreak, 2);
  assert.equal(protectedNow.previousEngineContext.protectionBridgeActive, false);
});


test('protective loss state overrides starvation/bootstrap threshold relaxation', () => {
  const c = {
    normalizeVenue: value => String(value || '').toLowerCase(),
    TECHNICAL_SIGNAL_MIN_EDGE: 11,
    TECHNICAL_SIGNAL_MIN_WINDOW_SEC: 20,
    TECHNICAL_SIGNAL_CONFIRMATIONS_PROTECTIVE: 3,
    TECHNICAL_SIGNAL_CONFIRMATIONS_NORMAL: 2
  };
  const profile = loadFunction('signalThresholdProfile', c)(
    { severity: 'protective', edgeLift: 9, sizeFactor: 0.24 },
    { bootstrapEligible: true, starvationRecovery: true },
    { venue: 'binance', marketSourceVenue: 'binance' }
  );
  assert.equal(profile.mode, 'protective');
  assert.equal(profile.bootstrap, false);
  assert.equal(profile.starvation, false);
  assert.equal(profile.requiredCostCoverage, 2.35);
  assert.equal(profile.requiredPersistencePct, 74);
  assert.equal(profile.requiredAlignmentPct, 80);
  assert.equal(profile.confirmations, 3);
});

test('live public ticks build a one-row-per-minute walk-forward fallback seed', () => {
  const c = {
    db: { marketSeriesHistory: [] },
    asArray: value => Array.isArray(value) ? value : [],
    compactMarketSeriesRow: value => ({ ...value }),
    marketSeriesHistoryKey: row => `${row.venueKey}:${row.symbol}:${row.marketSourceVenue}`,
    marketSeriesTimestamp: row => Number(row.timeMs || 0),
    trimMarketSeriesHistory: rows => rows
  };
  const rollup = loadFunction('recordWalkForwardMinuteRollup', c);
  const base = Date.UTC(2026, 8, 7, 12, 0, 0);
  const row = { source: 'live_public', historicalSeed: false, venueKey: 'binance', symbol: 'BTC/USDT', marketSourceVenue: 'binance', timeMs: base + 5_000, price: 100, bid: 99.9, ask: 100.1 };
  assert.equal(rollup(row).recorded, true);
  assert.equal(c.db.marketSeriesHistory.length, 1);
  assert.equal(c.db.marketSeriesHistory[0].historicalSeed, true);
  assert.equal(c.db.marketSeriesHistory[0].timeMs, base);
  rollup({ ...row, timeMs: base + 50_000, price: 101, bid: 100.9, ask: 101.1 });
  assert.equal(c.db.marketSeriesHistory.length, 1);
  assert.equal(c.db.marketSeriesHistory[0].price, 101);
  rollup({ ...row, timeMs: base + 65_000, price: 102, bid: 101.9, ask: 102.1 });
  assert.equal(c.db.marketSeriesHistory.length, 2);
});

test('walk-forward resampling puts historical candles and live ticks on one minute clock', () => {
  const c = {
    WALK_FORWARD_RESAMPLE_SEC: 60,
    asArray: value => Array.isArray(value) ? value : []
  };
  const resample = loadFunction('resampleWalkForwardSeries', c);
  const base = Date.UTC(2026, 8, 5, 10, 0, 0);
  const rows = [
    { timeMs: base, price: 100, bid: 100, ask: 100 },
    { timeMs: base + 60_000, price: 101, bid: 101, ask: 101 },
    { timeMs: base + 120_000, price: 102, bid: 102, ask: 102 },
    { timeMs: base + 121_000, price: 102.1, bid: 102.0, ask: 102.2 },
    { timeMs: base + 145_000, price: 102.4, bid: 102.3, ask: 102.5 },
    { timeMs: base + 179_000, price: 102.8, bid: 102.7, ask: 102.9 }
  ];
  const out = resample(rows, 60);
  assert.equal(out.length, 3);
  assert.deepEqual(Array.from(out, row => row.timeMs), [base, base + 60_000, base + 120_000]);
  assert.equal(out[2].price, 102.8);
  assert.equal(out[2].observedTimeMs, base + 179_000);
});

test('PAPER/STAGING learning keeps all public venues even when signed execution is Binance-only', () => {
  const fn = loadFunction('learningMarketVenues', {
    db: { mode: 'staging' },
    process: { env: {} },
    PAPER_PUBLIC_VENUES: ['binance', 'bybit', 'okx', 'kraken'],
    VENUES: ['binance', 'bybit', 'okx', 'kraken'],
    normalizeVenue: value => ['binance', 'bybit', 'okx', 'kraken'].includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : '',
    autonomousTradingVenues: () => ['binance']
  });
  assert.deepEqual(Array.from(fn()), ['binance', 'bybit', 'okx', 'kraken']);
  const liveFn = loadFunction('learningMarketVenues', {
    db: { mode: 'live' },
    process: { env: {} },
    PAPER_PUBLIC_VENUES: ['binance', 'bybit', 'okx', 'kraken'],
    VENUES: ['binance', 'bybit', 'okx', 'kraken'],
    normalizeVenue: value => ['binance', 'bybit', 'okx', 'kraken'].includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : '',
    autonomousTradingVenues: () => ['binance']
  });
  assert.deepEqual(Array.from(liveFn()), ['binance']);
});

test('venue capital supervisor isolates losses: Binance cannot freeze Bybit', () => {
  const { buildVenueCapitalSupervisor } = require('../backend/services/venueCapitalSupervisorAI');
  const stamp = offset => new Date(Date.now() - offset).toISOString();
  const trades = [
    { venue: 'binance', strategyVersion: 'epoch', netPnl: -1, closedAt: stamp(1_000) },
    { venue: 'binance', strategyVersion: 'epoch', netPnl: -1, closedAt: stamp(2_000) },
    { venue: 'binance', strategyVersion: 'epoch', netPnl: -1, closedAt: stamp(3_000) },
    { venue: 'bybit', strategyVersion: 'epoch', netPnl: 1.2, closedAt: stamp(500) }
  ];
  const freshMarkets = Object.fromEntries(['binance','bybit','okx','kraken'].map(v => [v, { fresh: 3, expected: 3 }]));
  const result = buildVenueCapitalSupervisor({ venues: ['binance','bybit','okx','kraken'], totalInitialCapital: 10000, verifiedTrades: trades, currentStrategyVersion: 'epoch', freshMarkets });
  assert.equal(result.venues.binance.tradeAllowed, false);
  assert.equal(result.venues.binance.reason, 'venue-hard-loss-streak-cooldown');
  assert.equal(result.venues.bybit.tradeAllowed, true);
  assert.ok(result.venues.bybit.riskBudgetUsd > 0);
});

test('venue capital supervisor keeps capital and PnL isolated per exchange', () => {
  const { buildVenueCapitalSupervisor } = require('../backend/services/venueCapitalSupervisorAI');
  const freshMarkets = Object.fromEntries(['binance','bybit','okx','kraken'].map(v => [v, { fresh: 3, expected: 3 }]));
  const result = buildVenueCapitalSupervisor({
    venues: ['binance','bybit','okx','kraken'], totalInitialCapital: 10000, currentStrategyVersion: 'epoch', freshMarkets,
    verifiedTrades: [
      { venue: 'binance', strategyVersion: 'epoch', netPnl: -100, closedAt: '2026-09-08T08:01:00Z' },
      { venue: 'bybit', strategyVersion: 'epoch', netPnl: 150, closedAt: '2026-09-08T08:02:00Z' }
    ]
  });
  assert.equal(result.venues.binance.initialCapitalUsd, 2500);
  assert.equal(result.venues.bybit.initialCapitalUsd, 2500);
  assert.equal(result.venues.binance.equityUsd, 2400);
  assert.equal(result.venues.bybit.equityUsd, 2650);
  assert.equal(result.policy.capitalIsolation, 'strict-no-cross-venue-borrowing');
  assert.equal(result.policy.transferPolicy, 'no-automatic-cross-exchange-transfer');
});

test('observed private exchange balance is informational, not sizing authority', () => {
  const { buildVenueCapitalSupervisor } = require('../backend/services/venueCapitalSupervisorAI');
  const freshMarkets = Object.fromEntries(['binance','bybit','okx','kraken'].map(v => [v, { fresh: 3, expected: 3 }]));
  const result = buildVenueCapitalSupervisor({
    venues: ['binance','bybit','okx','kraken'], totalInitialCapital: 10000, currentStrategyVersion: 'epoch', freshMarkets,
    observedBalances: { binance: { equity: 99999, available: 99999, source: 'private-read-only' } }
  });
  assert.equal(result.venues.binance.equityUsd, 2500);
  assert.equal(result.venues.binance.observedExchangeBalance.equity, 99999);
  assert.equal(result.policy.realBalanceUse, 'read-only-observation-until-live-unlocked');
});

test('venue supervisor can re-open only strict normal trading after hard-loss cooloff', () => {
  const { buildVenueCapitalSupervisor } = require('../backend/services/venueCapitalSupervisorAI');
  const old = new Date(Date.now() - 3_600_000).toISOString();
  const freshMarkets = Object.fromEntries(['binance','bybit','okx','kraken'].map(v => [v, { fresh: 3, expected: 3 }]));
  const result = buildVenueCapitalSupervisor({
    venues: ['binance','bybit','okx','kraken'], totalInitialCapital: 10000, currentStrategyVersion: 'epoch', freshMarkets,
    policy: { hardLossCooldownMs: 1_800_000 },
    verifiedTrades: [
      { venue: 'binance', strategyVersion: 'epoch', netPnl: -1, closedAt: old },
      { venue: 'binance', strategyVersion: 'epoch', netPnl: -1, closedAt: old },
      { venue: 'binance', strategyVersion: 'epoch', netPnl: -1, closedAt: old }
    ]
  });
  assert.equal(result.venues.binance.tradeAllowed, true);
  assert.equal(result.venues.binance.mode, 'protective');
  assert.equal(result.venues.binance.reason, 'venue-hard-loss-probation');
  assert.equal(result.venues.binance.riskMultiplier, 0.12);
});

test('production loss protection counts current-engine streak per venue, not portfolio-wide', () => {
  const c = fixture();
  Object.assign(c, { PAPER_ENTRY_COOLDOWN_MS: 1000, PROFIT_RECOVERY_GLOBAL_LOSS_STREAK: 3,
    PROFIT_RECOVERY_GLOBAL_PAUSE_MS: 60000, BRIDGED_RECOVERY_MAX_CURRENT_TRADES: 2, VERIFIED_QUALITY_GUARD_MIN_TRADES: 8,
    VERIFIED_QUALITY_GUARD_HARD_WR: 30, VERIFIED_QUALITY_GUARD_SOFT_WR: 45,
    verifiedLearningTrades: state => state.db ? [] : c.db.tradeJournal });
  c.db.tradeJournal = [
    { venue: 'binance', strategyVersion: 'test', netPnl: -1, closedAt: new Date().toISOString() },
    { venue: 'bybit', strategyVersion: 'test', netPnl: -1, closedAt: new Date(Date.now()-1000).toISOString() },
    { venue: 'okx', strategyVersion: 'test', netPnl: -1, closedAt: new Date(Date.now()-2000).toISOString() },
    { venue: 'kraken', strategyVersion: 'test', netPnl: -1, closedAt: new Date(Date.now()-3000).toISOString() }
  ];
  c.verifiedLearningTrades = () => c.db.tradeJournal;
  const protect = loadFunction('recentVerifiedQualityProtection', c);
  const binance = protect(20, 'binance');
  const bybit = protect(20, 'bybit');
  assert.equal(binance.currentEngineLossStreak, 1);
  assert.equal(bybit.currentEngineLossStreak, 1);
  assert.notEqual(binance.severity, 'protective');
  assert.notEqual(bybit.severity, 'protective');
});


test('supervised discovery admission uses its own small positive net-edge floor', () => {
  const c = fixture('staging');
  const d = decision();
  d.tradeActivity.activeLearningProbeMode = 'supervised-discovery-probe';
  d.tradeActivity.probeNetEdgePct = 0.008;
  d.tradeActivity.currentEngineIdleMs = 600000;
  d.tradeActivity.supervisedDiscovery = { hardNegativeWalkForward: false };
  assert.equal(c.currentProbeAdmission(d).ok, true, JSON.stringify(c.currentProbeAdmission(d)));
  assert.equal(loadFunction('riskGate', c)(d), true, JSON.stringify(c.db.lastRiskGate));
});

test('supervised discovery still fails closed when live after-cost edge is not positive enough', () => {
  const c = fixture('staging');
  const d = decision();
  d.tradeActivity.activeLearningProbeMode = 'supervised-discovery-probe';
  d.tradeActivity.probeNetEdgePct = 0.001;
  d.tradeActivity.currentEngineIdleMs = 600000;
  d.tradeActivity.supervisedDiscovery = { hardNegativeWalkForward: false };
  const result = c.currentProbeAdmission(d);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('probe_net_edge_invalid'));
});

test('venue capital supervisor exposes discovery budget from that venue only', () => {
  const { buildVenueCapitalSupervisor } = require('../backend/services/venueCapitalSupervisorAI');
  const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const freshMarkets = Object.fromEntries(['binance','bybit','okx','kraken'].map(v => [v, { fresh: 3, expected: 3 }]));
  const result = buildVenueCapitalSupervisor({
    venues: ['binance','bybit','okx','kraken'], totalInitialCapital: 10000, currentStrategyVersion: 'epoch', freshMarkets,
    policy: { discoveryIdleMs: 480000, discoveryPositionSizePct: 0.02 },
    verifiedTrades: [{ venue: 'binance', strategyVersion: 'epoch', netPnl: -0.02, closedAt: old }]
  });
  assert.equal(result.venues.binance.discovery.allowed, true);
  assert.ok(result.venues.binance.discovery.maxNotionalUsd > 0 && result.venues.binance.discovery.maxNotionalUsd <= 0.500001);
  assert.equal(result.venues.bybit.discovery.allowed, true);
});

test('four-cashbox UI is prominent and frontend cache-buster matches the release', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app.js'), 'utf8');
  assert.match(html, /id="venueCapitalQuickBox"/);
  const version=JSON.parse(fs.readFileSync(path.join(__dirname,'..','version.json'),'utf8')).version;
  assert.ok(html.includes('/app.js?v='+version));
  assert.ok(html.includes('/style.css?v='+version));
  assert.ok(app.includes("const FRONTEND_VERSION = '"+version+"'"));
  for (const venue of ['binance','bybit','okx','kraken']) assert.match(app, new RegExp(`['\"]${venue}['\"]`));
});


test('v199_178 scans all 12 venue/symbol markets and self-heals missing markets fairly', () => {
  assert.match(source, /const MULTI_VENUE_SYMBOLS_PER_VENUE = 3/);
  assert.match(source, /v199_178-round-robin-bounded-network-hard-reset/);
  assert.match(source, /const missingJobs = allJobs\.filter\(job => missingSet\.has\(job\.key\)\)/);
  assert.match(source, /stream-watchdog-missing-markets/);
});

test('v199_177 Binance watchdog detects stale symbols, not only a healthy venue heartbeat', () => {
  const start = source.indexOf("function ensureBinancePublicMarketStream(");
  const end = source.indexOf("function marketRestBackoffState", start);
  const block = source.slice(start, end);
  assert.match(block, /staleSymbols/);
  assert.match(block, /partialStaleTooLong/);
  assert.match(block, /symbol-selfheal/);
});

test('v199_179 stale Render env cannot restore slow discovery deadlock', () => {
  assert.match(source, /SUPERVISED_DISCOVERY_IDLE_MS = Math\.max\(15 \* 1000, Math\.min\(30 \* 1000/);
  assert.match(source, /ACTIVE_LEARNING_PROBE_GLOBAL_COOLDOWN_MS[\s\S]*?\|\| 0/);
  assert.match(source, /ACTIVE_LEARNING_MAX_CONCURRENT_PROBES[\s\S]*?\|\| 4/);
});

test('v199_178 market recovery rotates fairly across every missing route', () => {
  const c = {
    marketContinuityCursor: 0,
    MARKET_CONTINUITY_PUMP_BATCH_SIZE: 2,
    asArray: value => Array.isArray(value) ? value : []
  };
  const batch = loadFunction('rotatingMarketRecoveryBatch', c);
  const jobs = ['a','b','c','d'].map(key => ({ key }));
  assert.deepEqual(Array.from(batch(jobs, 2), row => row.key), ['a','b']);
  assert.deepEqual(Array.from(batch(jobs, 2), row => row.key), ['c','d']);
  assert.deepEqual(Array.from(batch(jobs, 2), row => row.key), ['a','b']);
});

test('v199_178 market REST recovery bounds endpoint fanout instead of racing every host', () => {
  const cursors = { binance: 1 };
  const c = {
    marketRestEndpointCursor: cursors,
    MARKET_REST_ENDPOINT_FANOUT: 2,
    asArray: value => Array.isArray(value) ? value : [],
    normalizeVenue: value => String(value || '').toLowerCase()
  };
  const window = loadFunction('boundedMarketEndpointWindow', c);
  const first = window('BINANCE', ['a','b','c','d'], 2);
  assert.equal(first.fanout, 2);
  assert.deepEqual(Array.from(first.selected), ['b','c']);
  cursors.binance = 3;
  const wrapped = window('binance', ['a','b','c','d'], 2);
  assert.deepEqual(Array.from(wrapped.selected), ['d','a']);
});

test('v199_178 sustained 0/12 coverage has a hard transport rebuild path', () => {
  assert.match(source, /hardResetPublicMarketTransports\('watchdog-empty-coverage'\)/);
  assert.match(source, /MARKET_EMPTY_HARD_RESET_MS/);
  assert.match(source, /MARKET_EMPTY_HARD_RESET_COOLDOWN_MS/);
  assert.match(source, /marketRecoveryNetworkBusy/);
});


test('v199_179 has independent IPv4 own-venue market guardian for all 12 markets', () => {
  const worker = fs.readFileSync(path.join(__dirname, '..', 'backend', 'services', 'marketGuardianWorker.cjs'), 'utf8');
  for (const venue of ['binance','bybit','okx','kraken']) assert.match(worker, new RegExp(`['"]${venue}['"]`));
  for (const symbol of ['BTC/USDT','ETH/USDT','SOL/USDT']) assert.match(worker, new RegExp(symbol.replace('/', '\\/')));
  assert.match(worker, /family:\s*4/);
  assert.match(worker, /agent:\s*false/);
  assert.match(source, /startMarketGuardianWorker/);
  assert.match(source, /marketGuardianWatchdogTick/);
  assert.match(source, /marketTransport:\s*'worker-rest-ipv4'/);
});

test('v199_179 cancelled market race losers do not spawn IPv4 fallback sockets', () => {
  const liveStart = source.indexOf('async function fetchFirstHealthyMarketJson');
  const liveEnd = source.indexOf('function historicalCandleRequests', liveStart);
  const live = source.slice(liveStart, liveEnd);
  assert.match(live, /let winnerSettled = false/);
  assert.match(live, /winnerSettled = true/);
  assert.match(live, /cancelled_after_market_winner/);

  const histStart = source.indexOf('async function fetchFirstHistoricalCandleJson');
  const histEnd = source.indexOf('function historicalCandleRowsFromPayload', histStart);
  const hist = source.slice(histStart, histEnd);
  assert.match(hist, /let winnerSettled = false/);
  assert.match(hist, /winnerSettled = true/);
  assert.match(hist, /cancelled_after_history_winner/);
});

test('v199_179 trade-facing snapshot is own-venue only after WS miss', () => {
  const start = source.indexOf('async getSnapshot(venue =');
  const end = source.indexOf('async getReferenceSnapshot', start);
  const block = source.slice(start, end > start ? end : start + 9000);
  assert.match(block, /fetchPublicTickerFromVenue\(v, normalized/);
  assert.doesNotMatch(block, /fetchFastPublicTickerRace\(v, normalized/);
  assert.match(source, /marketRoute:\s*'own-venue-guardian-rest'/);
});

test('v199_179 proactively rotates long-lived WebSockets and uses Bybit ticker topic', () => {
  assert.match(source, /MARKET_WS_SESSION_ROTATE_MS/);
  const venueStart = source.indexOf('function ensureVenuePublicMarketStreams');
  const venueEnd = source.indexOf('function freshVenuePublicStreamTicker', venueStart);
  assert.match(source.slice(venueStart, venueEnd), /sessionExpired/);
  const binanceStart = source.indexOf('function ensureBinancePublicMarketStream');
  const binanceEnd = source.indexOf('function hardResetPublicMarketTransports', binanceStart);
  assert.match(source.slice(binanceStart, binanceEnd), /sessionExpired/);
  assert.match(source, /`tickers\.\$\{compactSymbol\(symbol\)\}`/);
});

test('v199_179 high-activity discovery remains after-cost positive and venue-local', () => {
  assert.match(source, /SUPERVISED_DISCOVERY_IDLE_MS = Math\.max\(15 \* 1000, Math\.min\(30 \* 1000/);
  assert.match(source, /ACTIVE_LEARNING_PROBE_MARKET_COOLDOWN_MS = Math\.max\(15000, Math\.min\(45000/);
  assert.match(source, /SUPERVISED_DISCOVERY_MIN_COST_COVERAGE = Math\.max\(1\.02/);
  assert.match(source, /SUPERVISED_DISCOVERY_MIN_NET_EDGE_PCT = Math\.max\(0\.002/);
  assert.match(source, /CURRENT_STRATEGY_VERSION = 'v199_187-adaptive-exit-ai-core'/);
});


test('v199_180 supervisor execution focus prefers the only private connected venue over higher public score', () => {
  const c = {
    asArray: value => Array.isArray(value) ? value : [],
    normalizeVenue: value => ['binance','bybit','okx','kraken'].includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : null
  };
  const choose = loadFunction('chooseSupervisorVenueFocus', c);
  const ranking = [
    { venue: 'bybit', score: 99 },
    { venue: 'binance', score: 50 },
    { venue: 'okx', score: 45 },
    { venue: 'kraken', score: 40 }
  ];
  const out = choose(ranking, ['binance','bybit','okx','kraken'], ['binance']);
  assert.equal(out.selectedExecutionVenue, 'binance');
  assert.equal(out.selectedLearningVenue, 'bybit');
  assert.equal(out.selectedVenue, 'binance');
  assert.equal(out.selectedVenueType, 'private-execution');
});

test('v199_180 learning time windows do not duplicate one count fallback sample across 1h/6h/24h', () => {
  const blockStart = source.indexOf('function learningObservationWindowRows');
  const blockEnd = source.indexOf('function learningObservationRiskGate', blockStart);
  const block = source.slice(blockStart, blockEnd);
  assert.match(block, /source: 'timestamp-window'/);
  assert.doesNotMatch(block, /source: 'count-fallback'/);
  assert.doesNotMatch(block, /fallbackTrades:/);
});

test('v199_180 UI separates execution focus from public learning focus and does not fake missing event timestamps', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app.js'), 'utf8');
  assert.match(app, /selectedExecutionVenue/);
  assert.match(app, /selectedLearningVenue/);
  assert.match(app, /SUPERVISOR EXECUTION/);
  assert.match(app, /nincs időbélyeg/);
  assert.doesNotMatch(app, /new Date\(b\.time \|\| Date\.now\(\)\)/);
});


test('v199_180 dry-run balance previews are not displayed as private exchange balance proof', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app.js'), 'utf8');
  assert.match(source, /const privateVerified = proof\.private_auth_verified === true/);
  assert.match(app, /observed\.verified === true && observed\.equity != null/);
});


test('v199_181 market guardian transport is verified through entry, local trade and remote trade proof paths', () => {
  assert.match(source, /orderHasVerifiedMarketEntry[\s\S]*?worker-rest-ipv4/);
  const evidenceStart = source.indexOf('function verifiedMarketTradeEvidence');
  const evidenceEnd = source.indexOf('function isVerifiedMarketTrade', evidenceStart);
  assert.match(source.slice(evidenceStart, evidenceEnd), /worker-rest-ipv4/);
  const remoteStart = source.indexOf('function isVerifiedRemoteTradeRow');
  const remoteEnd = source.indexOf('function remoteTradeNetPnl', remoteStart);
  assert.match(source.slice(remoteStart, remoteEnd), /worker-rest-ipv4/);
});

test('v199_181 orphan paper position releases capacity without creating PnL or learning journal', () => {
  const order = { id: 'o1', status: 'paper_open_market', submittedAt: new Date(Date.now() - 600000).toISOString(),
    venue: 'binance', requestedVenue: 'binance', entryMarketVenue: 'binance', marketSourceVenue: 'binance', symbol: 'BTC/USDT',
    minHoldMs: 20000, softHoldMs: 80000, hardHoldMs: 180000, entryPrice: 100, lifecycle: ['POSITION_OPENED'] };
  let persisted = false;
  const c = {
    db: { mode: 'paper', orders: [order] },
    asArray: value => Array.isArray(value) ? value : [],
    isActiveOrder: row => !String(row.status || '').includes('cancelled'),
    orderAlreadySubmittedOrOpened: () => true,
    PAPER_POSITION_MIN_HOLD_MS: 20000,
    PAPER_POSITION_SOFT_HOLD_MS: 80000,
    PAPER_POSITION_MAX_HOLD_MS: 180000,
    PAPER_POSITION_ORPHAN_RELEASE_GRACE_MS: 120000,
    normalizeVenue: value => String(value || '').toLowerCase(),
    normalizeSymbol: value => String(value || '').toUpperCase(),
    latestFreshLivePublicSnapshotFromSource: () => null,
    MARKET_SOURCE_CACHE_MAX_AGE_MS: 30000,
    marketSnapshotIsFreshTrusted: () => false,
    now: () => '2026-09-14T08:00:00.000Z',
    addLifecycleStep: (row, step) => { row.lifecycle.push(step); },
    pushEvent: () => {},
    persistSoon: () => { persisted = true; }
  };
  const expire = loadFunction('expireOrphanedPaperPositions', c);
  const out = expire(c.db, 'test');
  assert.equal(out.expired, 1);
  assert.equal(order.status, 'cancelled_stale_position_watchdog');
  assert.equal(order.journalExcluded, true);
  assert.equal(order.learningExcluded, true);
  assert.equal(order.pnlExcluded, true);
  assert.equal(Object.prototype.hasOwnProperty.call(order, 'netPnl'), false);
  assert.equal(persisted, true);
});

test('v199_183 ages out a 3-loss route quarantine instead of deadlocking forever', () => {
  const nowMs = Date.now();
  const mk = ageMs => ({
    strategyVersion: 'v199_183-supervised-route-rehabilitation-core',
    venue: 'binance', requestedVenue: 'binance', entryMarketVenue: 'binance',
    symbol: 'BTC/USDT', side: 'BUY', netPnl: -0.01,
    closedAt: new Date(nowMs - ageMs).toISOString()
  });
  let rows = [mk(30_000), mk(45_000), mk(60_000)];
  const c = {
    db: {},
    normalizeSymbol: value => String(value || '').toUpperCase(),
    normalizeVenue: value => String(value || '').toLowerCase(),
    currentStrategyVerifiedTrades: () => rows,
    currentStrategyVersion: () => 'v199_183-supervised-route-rehabilitation-core',
    ROUTE_LOSS_QUARANTINE_MS: 180_000,
    PROFIT_RECOVERY_PATTERN_MIN_TRADES: 3,
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  };
  const quality = loadFunction('currentPatternQuality', c);
  let out = quality('BTC/USDT', 'BUY', 12, 'binance');
  assert.equal(out.blocked, true);
  assert.ok(out.quarantineRemainingMs > 0);

  rows = [mk(240_000), mk(255_000), mk(270_000)];
  out = quality('BTC/USDT', 'BUY', 12, 'binance');
  assert.equal(out.blocked, false);
  assert.equal(out.probation, true);
  assert.equal(out.reduced, true);
  assert.equal(out.quarantineRemainingMs, 0);
});

test('v199_183 protective recovery ladder is bounded, small and still after-cost positive', () => {
  assert.match(source, /LOSS_STREAK_RECOVERY_BASE_IDLE_MS/);
  assert.match(source, /LOSS_STREAK_RECOVERY_MAX_IDLE_MS/);
  assert.match(source, /LOSS_STREAK_RECOVERY_POSITION_SIZE_PCT/);
  assert.match(source, /LOSS_STREAK_RECOVERY_MIN_COST_COVERAGE/);
  assert.match(source, /protectiveRecoveryLadder/);
  assert.match(source, /LOSS_STREAK_RECOVERY_MIN_NET_EDGE_PCT/);
  assert.match(source, /positionSizePct = activeLearningProbe[\s\S]*?protectiveRecoveryLadder \? LOSS_STREAK_RECOVERY_POSITION_SIZE_PCT/);
});

test('v199_183 current route evidence is recency weighted and can override stale historical prior faster', () => {
  const start = source.indexOf('function recentVerifiedSidePerformance');
  const end = source.indexOf('function historicalRouteScore', start);
  const block = source.slice(start, end);
  assert.match(block, /timeDecay/);
  assert.match(block, /orderDecay/);
  assert.match(block, /effectiveSamples/);
  const routeStart = source.indexOf('function learningRouteForMarket');
  const routeEnd = source.indexOf('function recentVerifiedQualityProtection', routeStart);
  assert.match(source.slice(routeStart, routeEnd), /effective \/ 5/);
  assert.match(source.slice(routeStart, routeEnd), /0\.90/);
});

test('v199_183 active-learning exits may capture after-cost micro profit before distant fixed TP', () => {
  assert.match(source, /probe_after_cost_profit_capture/);
  assert.match(source, /estimatedCostPct \* 1\.04/);
  assert.match(source, /takeProfitPct \* 0\.78/);
});

test('v199_183 reduces Supabase snapshot/evaluation write pressure', () => {
  assert.match(source, /SUPABASE_MARKET_SNAPSHOT_WRITE_INTERVAL_MS = Math\.max\(600000/);
  assert.match(source, /SUPABASE_STRATEGY_EVALUATION_WRITE_INTERVAL_MS/);
  assert.match(source, /!supabaseDatabasePressureActive\(\)/);
});



test('v199_183 online-policy quarantine uses the same short route quarantine horizon', () => {
  assert.match(source, /ONLINE_POLICY_ROUTE_QUARANTINE_MS = Math\.max\(60000,[\s\S]*?ROUTE_LOSS_QUARANTINE_MS/);
  assert.doesNotMatch(source, /NEXUS_ONLINE_POLICY_ROUTE_QUARANTINE_MS \|\| 900000/);
});

test('v199_183 expired severe-negative routes can collect one supervised rehabilitation label', () => {
  assert.match(source, /const routeRehabilitationEligible = probeOnline\?\.routeAction === 'probation'/);
  assert.match(source, /probeOnline\?\.severeNegativeRoute !== true \|\| routeRehabilitationEligible/);
  assert.match(source, /routeRehabilitationActive: routeRehabilitationEligible && supervisedDiscoveryEligible/);
  assert.match(source, /&& !discoveryHistoryHardNegative/);
});

test('v199_184 venue agents use recency-weighted evidence and select among multiple strategy families', () => {
  const { buildVenueAgentDecision } = require('../backend/services/venueAgentAI');
  const now = Date.now();
  const trades = Array.from({ length: 30 }, (_, i) => ({
    venue: 'binance', requestedVenue: 'binance', symbol: 'BTC/USDT', side: 'BUY',
    agentStrategy: i < 10 ? 'momentum' : 'trend',
    netPnl: i < 10 ? 0.18 : -0.02,
    closedAt: new Date(now - i * 60000).toISOString()
  }));
  const out = buildVenueAgentDecision({
    venue: 'binance', symbol: 'BTC/USDT', side: 'BUY', costCoverageRatio: 2.2,
    technical: { momentumScore: 48, positivePersistencePct: 78, negativePersistencePct: 22, bullishAlignmentPct: 82, bearishAlignmentPct: 18, directionFlipPct: 18, emaSpreadPct: 0.18, accelerationPct: 0.12, rsi: 61, spreadPct: 0.04 },
    verifiedTrades: trades
  });
  assert.equal(out.agentId, 'venue-agent-binance');
  assert.ok(['trend','momentum','breakout','mean-reversion','scalp'].includes(out.selectedStrategy));
  assert.equal(out.strategies.length, 5);
  assert.ok(out.venuePerformance.effectiveSamples > 0);
  assert.ok(out.riskMultiplier >= 0.18 && out.riskMultiplier <= 1.28);
});

test('v199_184 supervisor architecture exposes isolated venue agents and agent-weighted sizing', () => {
  assert.match(source, /buildVenueAgentFleet/);
  assert.match(source, /meta-supervisor-over-independent-venue-ai-agents/);
  assert.match(source, /agentRiskMultiplier/);
  assert.match(source, /venueAgentRiskFactor/);
  assert.match(source, /capitalScope: 'venue-local-only'/);
  assert.match(source, /\/api\/portfolio\/venue-agents/);
});

test('v199_184 strategy identity includes agent strategy so competitors learn separately', () => {
  const start = source.indexOf('function strategyKeyOf');
  const end = source.indexOf('function findDecisionForTrade', start);
  const block = source.slice(start, end);
  assert.match(block, /agentStrategy/);
  assert.match(block, /venueAgentAI\?\.selectedStrategy/);
  assert.match(block, /strategy\}\|\$\{regime\}/);
});


test('v199_185 venue agents expose rolling 20/50/100 performance and bounded adaptive capital', () => {
  const { buildVenueAgentFleet, adaptiveCapitalSignal } = require('../backend/services/venueAgentAI');
  const now = Date.now();
  const trades = Array.from({ length: 60 }, (_, i) => ({
    venue: 'okx', requestedVenue: 'okx', symbol: i % 2 ? 'BTC/USDT' : 'ETH/USDT', side: i % 3 ? 'BUY' : 'SELL',
    agentStrategy: i % 5 === 0 ? 'breakout' : i % 2 ? 'momentum' : 'trend',
    netPnl: i < 20 ? (i % 4 ? 0.14 : -0.05) : (i % 3 ? 0.05 : -0.04),
    closedAt: new Date(now - i * 60000).toISOString()
  }));
  const adaptive = adaptiveCapitalSignal(trades, 'okx');
  assert.equal(adaptive.windows.last20.trades, 20);
  assert.equal(adaptive.windows.last50.trades, 50);
  assert.equal(adaptive.windows.last100.trades, 60);
  assert.ok(adaptive.multiplier >= 0.35 && adaptive.multiplier <= 1.32);
  assert.ok(Number.isFinite(adaptive.performanceScore));
  const fleet = buildVenueAgentFleet({ venues: ['okx'], verifiedTrades: trades });
  assert.equal(fleet.agents.okx.agentId, 'venue-agent-okx');
  assert.ok(Array.isArray(fleet.agents.okx.strategyRanking));
  assert.equal(fleet.agents.okx.strategyRanking.length, 5);
  assert.ok(['trend','momentum','breakout','mean-reversion','scalp'].includes(fleet.agents.okx.topStrategy));
});

test('v199_185 meta-supervisor uses adaptive venue-local capital without cross-exchange transfer', () => {
  assert.match(source, /adaptiveCapitalState/);
  assert.match(source, /riskBudgetBeforeAgentUsd/);
  assert.match(source, /riskBudgetDeltaUsd/);
  assert.match(source, /capitalMultiplier/);
  assert.match(source, /meta-supervisor-over-independent-venue-ai-agents-shadow-lab-regime-routing-champion-challenger-adaptive-exit-adaptive-capital/);
  assert.match(source, /\/api\/portfolio\/agent-performance/);
  assert.match(source, /strict-no-cross-venue-borrowing/);
});

test('v199_186 preserves v199_185 and v199_184 verified learning as strong priors', () => {
  assert.match(source, /version\.startsWith\('v199_185-'\) \|\| version\.startsWith\('v199_185_'\)\) return 0\.98/);
  assert.match(source, /version\.startsWith\('v199_184-'\)\) return 0\.96/);
  assert.match(source, /CURRENT_STRATEGY_VERSION = 'v199_187-adaptive-exit-ai-core'/);
});


test('v199_185_1 current-process card uses process counters instead of persisted session counters', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app.js'), 'utf8');
  assert.match(html, /AKTUÁLIS PROCESSBEN LEZÁRT/);
  assert.match(app, /simSessionClosed', Number\(p\.processClosedTrades/);
  assert.match(app, /processWinRate/);
  assert.match(app, /processNetPnl/);
  assert.match(source, /processWinRate: processSummary\.winRate/);
  assert.match(source, /processNetPnl: processSummary\.netPnl/);
});

test('v199_185_1 walk-forward telemetry does not count skipped cycles as rejected validations', () => {
  const c = {
    db: { marketLearningHeartbeat: {} },
    asObject: (v, f={}) => v && typeof v === 'object' && !Array.isArray(v) ? v : f,
    CURRENT_STRATEGY_VERSION: 'v199_185_1-test',
    now: () => '2026-09-17T10:00:00.000Z',
    normalizeSymbol: v => String(v || '').toUpperCase(),
    normalizeVenue: v => String(v || '').toLowerCase()
  };
  const record = loadFunction('recordWalkForwardLearning', c);
  record({ evaluated: false, skipReason: 'not-ready' }, 'BTC/USDT', 'binance');
  assert.equal(c.db.marketLearningHeartbeat.walkForwardSkipped, 1);
  assert.equal(c.db.marketLearningHeartbeat.walkForwardValidations, 0);
  assert.equal(c.db.marketLearningHeartbeat.walkForwardRejected, 0);
  record({ evaluated: true, strictPassed: true, passed: true, provisional: false }, 'BTC/USDT', 'binance');
  assert.equal(c.db.marketLearningHeartbeat.walkForwardValidations, 1);
  assert.equal(c.db.marketLearningHeartbeat.walkForwardApproved, 1);
  record({ evaluated: true, strictPassed: false, passed: true, provisional: true }, 'ETH/USDT', 'binance');
  assert.equal(c.db.marketLearningHeartbeat.walkForwardValidations, 2);
  assert.equal(c.db.marketLearningHeartbeat.walkForwardProvisionalApproved, 1);
  assert.equal(c.db.marketLearningHeartbeat.walkForwardRejected, 0);
  record({ evaluated: true, strictPassed: false, passed: false, provisional: false }, 'SOL/USDT', 'binance');
  assert.equal(c.db.marketLearningHeartbeat.walkForwardRejected, 1);
});

test('v199_185_1 adaptive capital is applied once at venue budget and not again inside agent entry-risk factor', () => {
  const agentSource = fs.readFileSync(path.join(__dirname, '..', 'backend', 'services', 'venueAgentAI.js'), 'utf8');
  assert.doesNotMatch(agentSource, /riskMultiplier\s*\*=\s*capitalSignal\.multiplier/);
  assert.match(agentSource, /adaptiveCapitalApplication: 'venue-risk-budget-only'/);
  assert.match(source, /row\.riskBudgetUsd = Number\(\(row\.riskBudgetUsd \* agentPerfFactor\)/);
});


test('v199_185_2 stale-position watchdog releases overdue PAPER/STAGING slot even when exact-source cache is fresh', () => {
  const stamp = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const order = {
    id: 'stale-1', status: 'staging_dry_run_open_market', submittedAt: stamp,
    venue: 'BINANCE', requestedVenue: 'binance', entryMarketVenue: 'binance', marketSourceVenue: 'binance',
    symbol: 'SOL/USDT', minHoldMs: 15000, softHoldMs: 45000, hardHoldMs: 90000,
    lifecycle: ['ORDER_SUBMITTED','POSITION_OPENED']
  };
  const c = {
    db: { mode: 'staging', orders: [order] },
    asArray: v => Array.isArray(v) ? v : [],
    isActiveOrder: o => !String(o.status || '').includes('cancelled'),
    orderAlreadySubmittedOrOpened: () => true,
    PAPER_POSITION_MIN_HOLD_MS: 15000,
    PAPER_POSITION_SOFT_HOLD_MS: 45000,
    PAPER_POSITION_MAX_HOLD_MS: 90000,
    PAPER_POSITION_ORPHAN_RELEASE_GRACE_MS: 120000,
    MARKET_SOURCE_CACHE_MAX_AGE_MS: 28000,
    normalizeVenue: v => String(v || '').toLowerCase(),
    normalizeSymbol: v => String(v || '').toUpperCase(),
    latestFreshLivePublicSnapshotFromSource: () => ({ snap: { source: 'live_public' }, ageMs: 1000 }),
    marketSnapshotIsFreshTrusted: () => true,
    now: () => new Date().toISOString(),
    addLifecycleStep: (o, step) => { o.lifecycle.push(step); },
    pushEvent: () => {},
    persistSoon: () => {}
  };
  const expire = loadFunction('expireOrphanedPaperPositions', c);
  const result = expire(c.db, 'test-watchdog');
  assert.equal(result.expired, 1);
  assert.equal(order.status, 'cancelled_stale_position_watchdog');
  assert.equal(order.journalExcluded, true);
  assert.equal(order.learningExcluded, true);
  assert.equal(order.pnlExcluded, true);
  assert.equal(order.orphanRelease.freshSameSourceCache, true);
});

test('v199_185_2 watchdog runs before async reconcile so an hours-old slot cannot enter another reconcile timeout loop', () => {
  const pre = source.indexOf("const preReconcileOrphanRelease = expireOrphanedPaperPositions(db, 'runtime-pre-reconcile-stale-position-watchdog')");
  const active = source.indexOf('const initialActiveOrders = asArray(db.orders).filter', pre);
  const reconcile = source.indexOf('reconcileOrder(order.id)', active);
  assert.ok(pre >= 0 && active > pre && reconcile > active);
  assert.match(source, /cancelled_stale_position_watchdog/);
  assert.match(source, /journalExcluded = true/);
  assert.match(source, /learningExcluded = true/);
  assert.match(source, /pnlExcluded = true/);
});

test('v199_185_2 progress telemetry exposes watchdog timing for open positions', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app.js'), 'utf8');
  assert.match(source, /watchdogReleaseInSec/);
  assert.match(source, /watchdogOverdue/);
  assert.match(app, /WATCHDOG: felszabadítás esedékes/);
});


test('v199_186 starts a new routing epoch after the v199_185_2 watchdog line', () => {
  assert.match(source, /CURRENT_STRATEGY_VERSION = 'v199_187-adaptive-exit-ai-core'/);
  assert.doesNotMatch(source, /CURRENT_STRATEGY_VERSION = 'v199_185_2-/);
});


test('v199_186 watchdog releases rehydrated active slot even without submitted/open lifecycle metadata', () => {
  const stamp = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const order = {
    id: 'rehydrated-stale-1', status: 'staging_dry_run_open_market', time: stamp,
    venue: 'BINANCE', requestedVenue: 'binance', entryMarketVenue: 'binance', marketSourceVenue: 'binance',
    symbol: 'SOL/USDT', minHoldMs: 15000, softHoldMs: 45000, hardHoldMs: 90000,
    lifecycle: ['EXECUTION_INTENT_CREATED']
  };
  const c = {
    db: { mode: 'staging', orders: [order] },
    asArray: v => Array.isArray(v) ? v : [],
    isActiveOrder: o => !String(o.status || '').includes('cancelled'),
    PAPER_POSITION_MIN_HOLD_MS: 15000,
    PAPER_POSITION_SOFT_HOLD_MS: 45000,
    PAPER_POSITION_MAX_HOLD_MS: 90000,
    PAPER_POSITION_ORPHAN_RELEASE_GRACE_MS: 120000,
    MARKET_SOURCE_CACHE_MAX_AGE_MS: 28000,
    normalizeVenue: v => String(v || '').toLowerCase(),
    normalizeSymbol: v => String(v || '').toUpperCase(),
    latestFreshLivePublicSnapshotFromSource: () => null,
    marketSnapshotIsFreshTrusted: () => false,
    now: () => new Date().toISOString(),
    addLifecycleStep: (o, step) => { o.lifecycle.push(step); },
    pushEvent: () => {}, persistSoon: () => {}
  };
  const expire = loadFunction('expireOrphanedPaperPositions', c);
  const result = expire(c.db, 'rehydrated-watchdog');
  assert.equal(result.expired, 1);
  assert.equal(order.status, 'cancelled_stale_position_watchdog');
  assert.equal(order.learningExcluded, true);
  assert.equal(order.pnlExcluded, true);
});

test('v199_186 regime routing favors directional families in a persistent trend', () => {
  const { inferMarketRegime, strategyCandidates } = require('../backend/services/venueAgentAI');
  const technical = { momentumScore: 34, positivePersistencePct: 82, negativePersistencePct: 18, bullishAlignmentPct: 84, bearishAlignmentPct: 16, directionFlipPct: 12, emaSpreadPct: 0.25, accelerationPct: 0.08, rsi: 61, spreadPct: 0.03 };
  assert.equal(inferMarketRegime(technical, { volatility: 'normal' }), 'trend-up');
  const rows = strategyCandidates(technical, { side: 'BUY', costCoverageRatio: 2.1, volatility: 'normal' });
  const trend = rows.find(r => r.key === 'trend');
  const mean = rows.find(r => r.key === 'mean-reversion');
  assert.equal(trend.regime, 'trend-up');
  assert.ok(trend.regimeBias > 0);
  assert.ok(mean.regimeBias < 0);
  assert.ok(trend.score > mean.score);
});

test('v199_186 shadow evidence is training-only and can establish a regime champion without touching verified pnl', () => {
  const { shadowPerformance, championChallenger } = require('../backend/services/venueAgentAI');
  const now = Date.now();
  const shadow = [];
  for (let i = 0; i < 10; i++) {
    shadow.push({ venue: 'okx', symbol: 'BTC/USDT', strategy: 'breakout', regime: 'volatile', trainingOnly: true, shadow: true, verifiedTrade: false, pnlAccounting: false, netPct: 0.06, settledAt: new Date(now - i*1000).toISOString() });
    shadow.push({ venue: 'okx', symbol: 'BTC/USDT', strategy: 'trend', regime: 'volatile', trainingOnly: true, shadow: true, verifiedTrade: false, pnlAccounting: false, netPct: -0.02, settledAt: new Date(now - i*1000).toISOString() });
  }
  const perf = shadowPerformance(shadow, { venue: 'okx', strategy: 'breakout', regime: 'volatile' });
  assert.equal(perf.rawSamples, 10);
  assert.ok(perf.weightedExpectancyPct > 0);
  const cc = championChallenger([], shadow, 'okx', 'volatile');
  assert.equal(cc.champion.strategy, 'breakout');
  assert.ok(cc.champion.shadow.rawSamples >= 10);
});

test('v199_186 controlled challenger exploration is deterministic and reduced-risk', () => {
  const { buildVenueAgentDecision } = require('../backend/services/venueAgentAI');
  const now = Date.now();
  const shadow = [];
  // Trend is champion; momentum is close, positive and sufficiently sampled to become challenger.
  for (let i = 0; i < 8; i++) {
    shadow.push({ venue: 'binance', symbol: 'BTC/USDT', strategy: 'trend', regime: 'trend-up', trainingOnly: true, shadow: true, netPct: 0.050, settledAt: new Date(now-i*1000).toISOString() });
    shadow.push({ venue: 'binance', symbol: 'BTC/USDT', strategy: 'momentum', regime: 'trend-up', trainingOnly: true, shadow: true, netPct: 0.046, settledAt: new Date(now-i*1000).toISOString() });
  }
  const technical = { momentumScore: 22, positivePersistencePct: 78, negativePersistencePct: 22, bullishAlignmentPct: 79, bearishAlignmentPct: 21, directionFlipPct: 18, emaSpreadPct: 0.16, accelerationPct: 0.07, rsi: 58, spreadPct: 0.03 };
  const ordinary = buildVenueAgentDecision({ venue:'binance', symbol:'BTC/USDT', side:'BUY', technical, costCoverageRatio:2, shadowResults:shadow, explorationSeed:1 });
  const explore = buildVenueAgentDecision({ venue:'binance', symbol:'BTC/USDT', side:'BUY', technical, costCoverageRatio:2, shadowResults:shadow, explorationSeed:9 });
  assert.equal(ordinary.selectedStrategyRole, 'champion');
  if (explore.championChallenger.challengerEligible && explore.championChallenger.margin <= 7.5 && explore.championChallenger.challengerScore >= 50) {
    assert.equal(explore.selectedStrategyRole, 'challenger-exploration');
    assert.ok(explore.riskMultiplier <= ordinary.riskMultiplier);
  }
});

test('v199_186 shadow lab is isolated from verified trade pnl and exposed for supervision', () => {
  assert.match(source, /function maybeRecordShadowStrategyOpportunity/);
  assert.match(source, /function settleShadowStrategyLab/);
  assert.match(source, /trainingOnly:\s*true/);
  assert.match(source, /verifiedTrade:\s*false/);
  assert.match(source, /pnlAccounting:\s*false/);
  assert.match(source, /SHADOW_STRATEGY_RESULTS_LIMIT/);
  assert.match(source, /\/api\/strategy\/shadow-lab/);
  assert.match(source, /\/api\/strategy\/champion-challenger/);
  assert.match(source, /meta-supervisor-over-independent-venue-ai-agents-shadow-lab-regime-routing-champion-challenger-adaptive-exit-adaptive-capital/);
});


test('v199_186 shadow counterfactual side can never flip the authoritative production execution side', () => {
  const { buildVenueAgentDecision } = require('../backend/services/venueAgentAI');
  const now = Date.now();
  const shadow = Array.from({ length: 12 }, (_, i) => ({
    venue: 'kraken', symbol: 'ETH/USDT', strategy: 'mean-reversion', regime: 'ranging',
    trainingOnly: true, shadow: true, netPct: 0.25, settledAt: new Date(now - i*1000).toISOString()
  }));
  const technical = { momentumScore: 8, positivePersistencePct: 40, negativePersistencePct: 38, bullishAlignmentPct: 48, bearishAlignmentPct: 45, directionFlipPct: 70, emaSpreadPct: 0.01, accelerationPct: 0.01, rsi: 66, spreadPct: 0.02 };
  const out = buildVenueAgentDecision({ venue:'kraken', symbol:'ETH/USDT', side:'BUY', technical, costCoverageRatio:2.5, shadowResults:shadow, explorationSeed:9 });
  assert.equal(out.side, 'BUY');
  const selected = out.strategies.find(row => row.key === out.selectedStrategy);
  assert.equal(selected.suggestedSide, 'BUY');
});

test('v199_187 adaptive exit profile is bounded and preserves stop-loss safety', () => {
  const { buildAdaptiveExitProfile } = require('../backend/services/adaptiveExitAI');
  const now = Date.now();
  const rows = Array.from({ length: 30 }, (_, i) => ({
    venue: 'binance', symbol: 'BTC/USDT', side: 'BUY', agentStrategy: 'trend', regime: 'trend-up',
    strategyVersion: 'v199_186-shadow-strategy-lab-champion-challenger-regime-routing-core',
    netPnl: i % 4 ? 0.18 : -0.07, holdingMs: 70000 + i * 500,
    closedAt: new Date(now - i * 60000).toISOString()
  }));
  const p = buildAdaptiveExitProfile({ verifiedTrades: rows, currentVersion: 'v199_187-adaptive-exit-ai-core', venue: 'binance', strategy: 'trend', regime: 'trend-up', side: 'BUY', baseTakeProfitPct: 0.35, baseStopLossPct: 0.25, baseMinHoldMs: 20000, baseSoftHoldMs: 60000, baseHardHoldMs: 180000, estimatedCostPct: 0.15 });
  assert.ok(p.takeProfitPct >= 0.165 && p.takeProfitPct <= 0.72);
  assert.ok(p.stopLossPct <= 0.26);
  assert.ok(p.hardHoldMs <= 300000);
  assert.ok(p.evidence.effectiveSamples > 0);
  assert.ok(['evidence-backed','provisional','prior-assisted'].includes(p.status));
});

test('v199_187 adaptive exit can protect profit and cut confirmed thesis failure', () => {
  const { adaptiveExitDecision } = require('../backend/services/adaptiveExitAI');
  const profile = { takeProfitPct: 0.35, stopLossPct: 0.22, minHoldMs: 20000, softHoldMs: 60000, hardHoldMs: 180000, trailingArmPct: 0.20, trailingGivebackRatio: 0.40, confidence: 78 };
  const trail = adaptiveExitDecision({ profile, holdingMs: 45000, marketMovePct: 0.13, peakMovePct: 0.28, netPnl: 0.08, side: 'BUY', technical: { momentumScore: 6, positivePersistencePct: 50, bullishAlignmentPct: 50 } });
  assert.equal(trail.action, 'exit');
  assert.equal(trail.reason, 'adaptive_trailing_profit_lock');
  const loss = adaptiveExitDecision({ profile, holdingMs: 45000, marketMovePct: -0.12, peakMovePct: 0.02, netPnl: -0.08, side: 'BUY', technical: { momentumScore: -32, positivePersistencePct: 20, bullishAlignmentPct: 24, negativePersistencePct: 78 } });
  assert.equal(loss.action, 'exit');
  assert.equal(loss.reason, 'adaptive_thesis_failure');
});

test('v199_187 keeps v199_186 verified outcomes as near-full adaptive-exit prior', () => {
  const { versionWeight } = require('../backend/services/adaptiveExitAI');
  assert.equal(versionWeight({ strategyVersion: 'v199_186-shadow-strategy-lab-champion-challenger-regime-routing-core' }, 'v199_187-adaptive-exit-ai-core'), 0.99);
  assert.match(source, /version\.startsWith\('v199_186-'\).*return 0\.99/);
});

test('v199_187 adaptive exit is observable and cannot replace entry authority', () => {
  assert.match(source, /function adaptiveExitProfileForOrder/);
  assert.match(source, /adaptiveExitDecision/);
  assert.match(source, /adaptiveLossSafeHardHoldMs/);
  assert.match(source, /\/api\/strategy\/adaptive-exit/);
  assert.match(source, /entryAuthority: 'unchanged-signal-risk-supervisor-chain'/);
  assert.match(source, /adaptiveExitAI: order\.adaptiveExitAI/);
});

test('v199_187_4 execution contract is deterministic, shadow-only and mutation-sensitive', () => {
  const { createExecutionContract } = require('../backend/services/executionContract');
  const base = {
    decisionId: 'decision-1', venue: 'BINANCE', symbol: 'BTC/USDT', side: 'BUY',
    quantity: 0.01, notionalUsd: 650, entryPrice: 65000,
    entryMarketSnapshotId: 'snap-1', strategyVersion: 'v199_187-adaptive-exit-ai-core', mode: 'paper'
  };
  const a = createExecutionContract(base);
  const b = createExecutionContract({ ...base });
  const changed = createExecutionContract({ ...base, quantity: 0.02 });
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, changed.hash);
  assert.equal(a.authority, 'observe-only');
  assert.equal(a.mode, 'shadow-audit');
});

test('v199_187_4 keeps exact v199_187 strategy epoch and only attaches passive execution telemetry', () => {
  assert.match(source, /CURRENT_STRATEGY_VERSION = 'v199_187-adaptive-exit-ai-core'/);
  assert.match(source, /intent\.executionContract = createExecutionContract\(intent\)/);
  assert.doesNotMatch(source, /EVIDENCE_POSITION_SIZER/);
  assert.doesNotMatch(source, /evidencePositionSizerAI/);
});


test('v199_187_7 managed-cloud fast boot keeps large local history off the Railway critical path', () => {
  assert.match(source, /CLOUD_FAST_BOOT_LOCAL_STATE/);
  assert.match(source, /deferred-to-supabase-background/);
  assert.match(source, /essentialKeys = new Set\(\['aggregateStats', 'venueConfigs', 'credentialManifest'\]\)/);
  assert.match(source, /readJsonFileBounded\(STATE_FILE/);
  assert.match(source, /fastBootLocalState: true/);
  assert.match(source, /RAILWAY_SERVICE_ID/);
  assert.match(source, /RAILWAY_ENVIRONMENT_ID/);
  assert.match(source, /RAILWAY_PROJECT_ID/);
});

test('v199_187_7 Railway runtime detection is explicit and keeps the v199_187 trading epoch', () => {
  const fn = loadFunction('isManagedCloudRuntime', { process: { env: { RAILWAY_SERVICE_ID: 'svc-test' } } });
  assert.equal(fn(), true);
  const local = loadFunction('isManagedCloudRuntime', { process: { env: {} } });
  assert.equal(local(), false);
  assert.match(source, /CLOUD_BACKGROUND_HISTORY_DELAY_MS/);
  assert.match(source, /CLOUD_HISTORICAL_SEED_DELAY_MS/);
  assert.match(source, /CURRENT_STRATEGY_VERSION = 'v199_187-adaptive-exit-ai-core'/);
  assert.doesNotMatch(source, /EVIDENCE_POSITION_SIZER/);
});

test('v199_187_7 removes Render deployment workarounds from the release artifact', () => {
  const root = path.join(__dirname, '..');
  assert.equal(fs.existsSync(path.join(root, 'render.yaml')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'nexus-render-health-probe.yml')), false);
  assert.equal(fs.existsSync(path.join(root, 'RAILWAY_SETUP.md')), true);
  const setup = fs.readFileSync(path.join(root, 'RAILWAY_SETUP.md'), 'utf8');
  assert.match(setup, /Serverless: OFF/);
  assert.match(setup, /Healthcheck path: `\/healthz`/);
  assert.match(setup, /Replicas: 1/);
});

test('v199_187_7 keeps release tests out of the cloud deploy build hot path', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.build, 'npm run check');
  assert.ok(pkg.scripts['release:test'].includes('probe-regression.test.js'));
  assert.equal(pkg.version, JSON.parse(fs.readFileSync(path.join(__dirname,'..','version.json'),'utf8')).version.replace(/^v/,'').replaceAll('_','.'));
});


test('v199_187_8 fresh UI credentials override stale cloud env for immediate signed auth', () => {
  assert.match(source, /const apiKey = memory\.apiKey \|\| storedApiKey \|\| envApiKey \|\| ''/);
  assert.match(source, /const apiSecret = memory\.apiSecret \|\| storedApiSecret \|\| envApiSecret \|\| ''/);
  assert.match(source, /session-memory/);
  assert.match(source, /Railway Trial\/Hobby kimenő IP-je nem fix/);
});

test('v199_187_8 exchange UI keeps failed signed auth diagnostic and passphrase OKX-only', () => {
  const frontend = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'index.html'), 'utf8');
  assert.match(frontend, /const test = result\.autoTest \|\| await apiSoft\('\/api\/exchanges\/test'/);
  assert.match(frontend, /const result = await apiSoft\('\/api\/exchanges\/test'/);
  assert.match(frontend, /needsPassphrase = venue === 'okx'/);
  assert.match(frontend, /Passphrase \(csak OKX\)/);
  assert.match(html, /Passphrase \(csak OKX\)/);
});

test('v199_187_8 strategy scorecard is observe-only and ranks verified route performance', () => {
  const { buildStrategyScorecard } = require('../backend/services/strategyScorecard');
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push({ status:'closed', venue:'BINANCE', requestedVenue:'binance', symbol:'BTC/USDT', regime:'trend-up', side:'BUY', strategy:'trend', strategyVersion:'v199_187-adaptive-exit-ai-core', netPnl: i < 7 ? 0.12 : -0.05, fee:0.002, slippage:0.001, closedAt:new Date(Date.now()-i*1000).toISOString() });
  for (let i = 0; i < 10; i++) rows.push({ status:'closed', venue:'BINANCE', requestedVenue:'binance', symbol:'ETH/USDT', regime:'ranging', side:'BUY', strategy:'mean-reversion', strategyVersion:'v199_187-adaptive-exit-ai-core', netPnl: i < 3 ? 0.04 : -0.09, fee:0.002, slippage:0.001, closedAt:new Date(Date.now()-i*1000).toISOString() });
  const out = buildStrategyScorecard(rows, { strategyVersion:'v199_187-adaptive-exit-ai-core', minSamples:8 });
  assert.equal(out.authority, 'observe-only');
  assert.equal(out.totalDetailedTrades, 20);
  assert.equal(out.bestRoutes[0].dimensions.symbol, 'BTC/USDT');
  assert.equal(out.watchRoutes[0].dimensions.symbol, 'ETH/USDT');
  assert.ok(out.bestRoutes[0].profitFactor > 1);
  assert.ok(out.watchRoutes[0].expectancyUsd < 0);
});

test('v199_187_8 exposes scorecard without changing the v199_187 trading epoch', () => {
  assert.match(source, /buildStrategyScorecard/);
  assert.match(source, /\/api\/strategy\/scorecard/);
  assert.match(source, /CURRENT_STRATEGY_VERSION = 'v199_187-adaptive-exit-ai-core'/);
  assert.doesNotMatch(source, /EVIDENCE_POSITION_SIZER/);
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.match(pkg.scripts.check, /strategyScorecard\.js/);
});


test('v199_187_10 Binance auth diagnostic proves key permissions before Spot account read', () => {
  assert.match(source, /\/sapi\/v1\/account\/apiRestrictions/);
  assert.match(source, /BINANCE_KEY_PERMISSION_PROBE_FAILED/);
  assert.match(source, /BINANCE_ACCOUNT_READ_PROBE_FAILED/);
  assert.match(source, /enableReading/);
  assert.match(source, /enableSpotAndMarginTrading/);
});

test('v199_187_10 exchange UI surfaces Binance auth diagnostic without exposing secrets', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app.js'), 'utf8');
  assert.match(app, /Binance diagnosztika:/);
  assert.match(app, /API kulcs elfogadva: IGEN/);
  assert.match(app, /Enable Reading:/);
  assert.doesNotMatch(app, /apiSecret.*diagnostic/i);
});

test('v199_187_10 Strategy Scorecard 2.0 separates modes, costs, uncertainty and chronological validation', () => {
  const { buildStrategyScorecard } = require('../backend/services/strategyScorecard');
  const base = Date.now() - 10 * 3600000;
  const trades = Array.from({ length: 18 }, (_, i) => ({
    id: 'sc2-' + i,
    status: 'closed',
    verified: true,
    reconciled: true,
    closedAt: new Date(base + i * 1800000).toISOString(),
    requestedVenue: i % 2 ? 'binance' : 'bybit',
    symbol: i % 3 ? 'BTC/USDT' : 'ETH/USDT',
    regime: i % 2 ? 'bull' : 'sideways',
    side: i % 2 ? 'BUY' : 'SELL',
    agentStrategy: i % 2 ? 'trend' : 'mean_reversion',
    mode: i < 12 ? 'paper' : 'staging',
    netPnl: i % 4 === 0 ? -0.08 : 0.11,
    grossPnl: i % 4 === 0 ? -0.05 : 0.14,
    fee: 0.01,
    slippage: 0.005,
    fundingCost: 0.001,
    strategyVersion: 'v199_187-adaptive-exit-ai-core'
  }));
  const sc = buildStrategyScorecard(trades, { strategyVersion: 'v199_187-adaptive-exit-ai-core', minSamples: 4 });
  assert.equal(sc.version, 'scorecard-2.0');
  assert.equal(sc.evidenceRules.futureDataExcluded, true);
  assert.equal(sc.evidenceRules.modeSeparated, true);
  assert.ok(sc.overall.totalCosts > 0);
  assert.ok(sc.overall.drawdown && Number.isFinite(sc.overall.drawdown.maxDrawdownUsd));
  assert.ok(sc.overall.winRateConfidence95 && sc.overall.winRateConfidence95.widthPct != null);
  assert.ok(sc.byMode.some(r => r.key === 'PAPER'));
  assert.ok(sc.byMode.some(r => r.key === 'STAGING'));
  assert.equal(sc.chronologicalValidation.trainEndAt < sc.chronologicalValidation.validationStartAt, true);
});

test('v199_187_10 Model Registry enforces candidate validated champion retired lifecycle and rollback', () => {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-registry-'));
  const { registerCandidate, validateCandidate, promoteChampion, registrySnapshot, rollbackChampion } = require('../backend/services/modelRegistry');
  const first = registerCandidate(dir, { strategyVersion: 'v199_187-adaptive-exit-ai-core', datasetSummary: { rows: 20 }, artifact: { routeWeights: {} }, prospectiveEvidence:{passed:true,metrics:{trades:40,score:65,profitFactor:1.3,expectancyUsd:0.03,reliability:0.6}}, trainMetrics: { trades: 14, score: 60, profitFactor: 1.2, expectancyUsd: 0.02, reliability: 0.5 }, validationMetrics: { trades: 6, score: 58, profitFactor: 1.15, expectancyUsd: 0.01, reliability: 0.45 } });
  const v1 = validateCandidate(dir, first.entry.id, { minTrades: 5, minScore: 40, minProfitFactor: 1, minReliability: 0.2 });
  assert.equal(v1.entry.status, 'validated');
  const p1 = promoteChampion(dir, first.entry.id, { minScoreDelta: -999, minExpectancyDelta: -999 });
  assert.equal(p1.promoted, true);
  const second = registerCandidate(dir, { strategyVersion: 'v199_187-adaptive-exit-ai-core', datasetSummary: { rows: 30 }, artifact: { routeWeights: { x: { riskHint: 1.04 } } }, prospectiveEvidence:{passed:true,metrics:{trades:50,score:70,profitFactor:1.5,expectancyUsd:0.04,reliability:0.7}}, trainMetrics: { trades: 20, score: 70, profitFactor: 1.4, expectancyUsd: 0.04, reliability: 0.7 }, validationMetrics: { trades: 10, score: 66, profitFactor: 1.3, expectancyUsd: 0.03, reliability: 0.6 } });
  validateCandidate(dir, second.entry.id, { minTrades: 5, minScore: 40, minProfitFactor: 1, minReliability: 0.2 });
  const p2 = promoteChampion(dir, second.entry.id, { minScoreDelta: 1, minExpectancyDelta: 0 });
  assert.equal(p2.promoted, true);
  let snap = registrySnapshot(dir);
  assert.equal(snap.champion.id, second.entry.id);
  assert.ok(snap.entries.some(e => e.id === first.entry.id && e.status === 'retired'));
  const rb = rollbackChampion(dir, 'test-rollback');
  assert.equal(rb.rolledBack, true);
  snap = registrySnapshot(dir);
  assert.equal(snap.champion.id, first.entry.id);
});

test('v199_187_10 continuous retraining uses chronological split and cannot submit exchange orders', () => {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-retrain-'));
  const { runContinuousRetrainingCycle } = require('../backend/services/continuousRetraining');
  const base = Date.now() - 40 * 3600000;
  const trades = Array.from({ length: 36 }, (_, i) => ({
    id: 'rt-' + i,
    status: 'closed', verified: true, reconciled: true,
    closedAt: new Date(base + i * 3600000).toISOString(),
    requestedVenue: 'binance', symbol: i % 2 ? 'BTC/USDT' : 'ETH/USDT', regime: i % 3 ? 'bull' : 'sideways', side: i % 2 ? 'BUY' : 'SELL', agentStrategy: i % 3 ? 'trend' : 'mean_reversion', mode: 'paper',
    netPnl: i % 5 === 0 ? -0.05 : 0.08, fee: 0.004, slippage: 0.002, strategyVersion: 'v199_187-adaptive-exit-ai-core'
  }));
  const result = runContinuousRetrainingCycle({ projectRoot: dir, trades, strategyVersion: 'v199_187-adaptive-exit-ai-core', mode: 'paper', policy: { minTrades: 20, validationMinTrades: 5, validationMinProfitFactor: 0.8, validationMinReliability: 0.1, validationMinScore: 35, promotionMinScoreDelta: -999, promotionMinExpectancyDelta: -999 } });
  assert.equal(result.ok, true);
  assert.equal(result.trainingIsolation, 'statistical-policy-training-no-exchange-submit-no-runtime-blocking');
  assert.equal(result.leakageGuard, 'chronological-train-validation-split');
  assert.ok(result.candidateId);
  assert.ok(result.registry.entries.length >= 1);
});

test('v199_187_10 Strategy Quality Autopilot 2.0 is bounded and cannot generate entries', () => {
  const { recommendation } = require('../backend/services/strategyQualityAutopilot2');
  const sc = { minSamples: 4, routes: [{ key: 'BINANCE | BTC/USDT | BULL | BUY | TREND', trades: 12, reliability: 0.8, expectancyUsd: 0.04, profitFactor: 1.4 }] };
  const rec = recommendation(sc, { champion: null }, { venue: 'binance', symbol: 'BTC/USDT', regime: 'bull', side: 'BUY', strategy: 'trend' });
  assert.equal(rec.authority, 'bounded-risk-only-no-entry-generation');
  assert.ok(rec.riskMultiplier <= 1.08);
  assert.ok(rec.riskMultiplier >= 0.55);
  assert.equal(Object.prototype.hasOwnProperty.call(rec, 'action'), false);
});

test('v199_187_10 Position Lifecycle 2.0 stages partial TP and preserves remaining runner accounting', () => {
  const { ensureLifecycle, evaluateLifecycle, applyPartialFill, finalAccounting } = require('../backend/services/positionLifecycle2');
  const order = { quantity: 1 };
  ensureLifecycle(order);
  const tp1 = evaluateLifecycle(order, { marketMovePct: 0.25, takeProfitPct: 0.4, estimatedCostPct: 0.05, holdingMs: 10000, minHoldMs: 1000, estimatedNetPnl: 1 });
  assert.equal(tp1.action, 'partial-take-profit');
  assert.equal(tp1.stage, 'TP1');
  applyPartialFill(order, { stage:'TP1', qty:tp1.qty, gross:0.25, fee:0.01, slippage:0.002, net:0.24 });
  assert.equal(order.positionLifecycle2.tp1Done, true);
  assert.ok(order.positionLifecycle2.remainingQty > 0 && order.positionLifecycle2.remainingQty < 1);
  const tp2 = evaluateLifecycle(order, { marketMovePct: 0.36, takeProfitPct: 0.4, estimatedCostPct: 0.05, holdingMs: 12000, minHoldMs: 1000, estimatedNetPnl: 1 });
  assert.equal(tp2.action, 'partial-take-profit');
  assert.equal(tp2.stage, 'TP2');
  applyPartialFill(order, { stage:'TP2', qty:tp2.qty, gross:0.22, fee:0.01, slippage:0.002, net:0.21 });
  const final = finalAccounting(order, { qty:order.positionLifecycle2.remainingQty, gross:0.30, fee:0.01, slippage:0.002, net:0.29 });
  assert.equal(final.partialFills.length, 2);
  assert.ok(final.netPnl > 0.7);
});

test('v199_187_10 Evidence Position Sizer 2.0 cannot boost without qualified positive evidence and respects hard cap', () => {
  const { sizePosition } = require('../backend/services/evidencePositionSizer2');
  const warmup = sizePosition({ baseNotionalUsd:100, availableCapitalUsd:1000, venueRiskBudgetUsd:500, maxPositionSizePct:5, routeEvidence:null });
  assert.ok(warmup.finalNotionalUsd <= 50);
  assert.ok(warmup.combinedFactor <= 1);
  const positive = sizePosition({ baseNotionalUsd:40, availableCapitalUsd:1000, venueRiskBudgetUsd:500, maxPositionSizePct:5, routeEvidence:{ sampleStatus:'qualified', reliability:0.8, expectancyUsd:0.03, profitFactor:1.4, trades:30, score:72 }, qualityAutopilot:{ riskMultiplier:1.06 }, drawdownPct:0 });
  assert.ok(positive.combinedFactor <= 1.18);
  assert.ok(positive.finalNotionalUsd <= 50);
  const probe = sizePosition({ baseNotionalUsd:7, availableCapitalUsd:1000, venueRiskBudgetUsd:500, maxPositionSizePct:5, activeLearningProbe:true });
  assert.equal(probe.finalNotionalUsd, 7);
  assert.equal(probe.combinedFactor, 1);
});

test('v199_187_10 runtime wires Position Lifecycle 2.0 and Evidence Position Sizer 2.0 without changing strategy epoch', () => {
  assert.match(source, /positionLifecycle2Decision/);
  assert.match(source, /evidencePositionSizer2/);
  assert.match(source, /CURRENT_STRATEGY_VERSION = 'v199_187-adaptive-exit-ai-core'/);
});

test('v199_187_10 multi-exchange agent mesh never presents public-only venue as private execution connected', () => {
  const { buildAgentMesh } = require('../backend/services/multiExchangeAgentMesh');
  const mesh = buildAgentMesh({ venues:['binance','bybit'], exchanges:{ binance:{privateAuthVerified:true}, bybit:{} }, venueCapital:{venues:{binance:{tradeAllowed:true,riskBudgetUsd:50},bybit:{tradeAllowed:true,riskBudgetUsd:50}}}, venueAgents:{agents:{}}, freshMarkets:{binance:{fresh:3,expected:3},bybit:{fresh:3,expected:3}}, liveExecutionEnabled:false });
  assert.equal(mesh.venues.binance.privateReadConnected, true);
  assert.equal(mesh.venues.binance.privateExecutionEnabled, false);
  assert.equal(mesh.venues.bybit.privateReadConnected, false);
  assert.equal(mesh.venues.bybit.learningEligible, true);
  assert.equal(mesh.venues.bybit.executionEligibility, 'no-private-auth');
});

test('v199_187_10 Meta-Supervisor 2 allocates risk recommendations without transfer authority', () => {
  const { buildMetaSupervisor2 } = require('../backend/services/metaSupervisor2');
  const out = buildMetaSupervisor2({ mesh:{venues:{binance:{venue:'binance',learningEligible:true,privateReadConnected:true,privateExecutionEnabled:false,capital:{riskBudgetUsd:100,targetRiskSharePct:50},performance:{profitFactor:1.4,winRate:60,trades:20},routeEvidence:{qualifiedRoutes:2}},bybit:{venue:'bybit',learningEligible:true,privateReadConnected:false,privateExecutionEnabled:false,capital:{riskBudgetUsd:100,targetRiskSharePct:50},performance:{profitFactor:0.8,winRate:40,trades:20},routeEvidence:{qualifiedRoutes:1}}}} });
  assert.equal(out.authority, 'risk-budget-recommendation-only');
  assert.equal(out.transferAuthority, 'none');
  assert.equal(out.ranking[0].venue, 'binance');
  const total = out.ranking.reduce((s,r)=>s+r.recommendedRiskSharePct,0);
  assert.ok(Math.abs(total - 100) < 0.1);
});

test('v199_187_10 Execution Intelligence 2 is deterministic, idempotent and fails closed on stale/live unauthorized input', () => {
  const { buildExecutionPlan } = require('../backend/services/executionIntelligence2');
  const input = { mode:'paper',decisionId:'d1',venue:'binance',symbol:'BTC/USDT',side:'BUY',quantity:0.01,strategyVersion:'v199_187-adaptive-exit-ai-core',marketSnapshotId:'m1',marketDataTrusted:true,dataAgeMs:100,spreadPct:0.03,volatility:'low',signalEdge:0.4,estimatedRoundTripCostPct:0.1,maxSpreadPct:0.25 };
  const a = buildExecutionPlan(input), b = buildExecutionPlan(input);
  assert.equal(a.idempotencyKey, b.idempotencyKey);
  assert.equal(a.accepted, true);
  assert.equal(a.reconciliation.idempotent, true);
  const stale = buildExecutionPlan({...input,dataAgeMs:99999});
  assert.ok(stale.blockers.includes('stale-or-untrusted-market-data'));
  const live = buildExecutionPlan({...input,mode:'live',privateExecutionEnabled:false});
  assert.ok(live.blockers.includes('live-private-execution-not-authorized'));
});

test('v199_187_10 runtime exposes agent mesh, meta-supervisor 2 and execution intelligence 2 APIs', () => {
  assert.match(source, /\/api\/portfolio\/agent-mesh/);
  assert.match(source, /\/api\/portfolio\/meta-supervisor-2/);
  assert.match(source, /\/api\/execution\/intelligence-2/);
  assert.match(source, /buildExecutionIntelligence2Plan/);
});

test('v199_187_11 Regime Transition AI uses hysteresis and does not flip on one ordinary tick', () => {
  const { inferRegimeTransition } = require('../backend/services/venueAgentAI');
  const tech = { momentumScore: 24, positivePersistencePct: 74, negativePersistencePct: 18, bullishAlignmentPct: 78, bearishAlignmentPct: 15, directionFlipPct: 22, accelerationPct: 0.05, volatility: 'medium' };
  const first = inferRegimeTransition(tech, { effectiveRegime:'trend-down', rawRegime:'trend-down', candidateCount:3 }, {});
  assert.equal(first.rawRegime, 'trend-up');
  assert.equal(first.effectiveRegime, 'trend-down');
  assert.equal(first.switchGuardActive, true);
  const second = inferRegimeTransition(tech, first, {});
  assert.equal(second.effectiveRegime, 'trend-up');
  assert.equal(second.phase, 'confirmed-transition');
  assert.ok(second.riskMultiplier <= 1);
});

test('v199_187_11 Multi-Timeframe AI and Ensemble Intelligence 2 are bounded and have no entry authority', () => {
  const { buildMultiTimeframeContext, buildEnsembleIntelligence2 } = require('../backend/services/ensembleAI');
  const technical = { ready:true, sampleCount:30, shortReturnPct:0.05, mediumReturnPct:0.08, longReturnPct:0.12, emaSpreadPct:0.04, momentumScore:26 };
  const mtf = buildMultiTimeframeContext(technical);
  assert.equal(mtf.consensusSide, 'BUY');
  assert.equal(mtf.ready, true);
  const ensemble = buildEnsembleIntelligence2({ technical, multiTimeframe:mtf, crossMarket:{ marketBias:'risk-on', confidence:80, targetBtcCorrelation:0.7, btcSide:'BUY' }, regimeTransition:{ phase:'stable' } });
  assert.equal(ensemble.authority, 'bounded-score-adjustment-no-independent-entry');
  assert.ok(ensemble.buyAdjustment > ensemble.sellAdjustment);
  assert.ok(ensemble.opportunityAdjustment <= 10 && ensemble.opportunityAdjustment >= -10);
  assert.ok(ensemble.confidenceMultiplier <= 1.08 && ensemble.confidenceMultiplier >= 0.82);
  assert.equal(Object.prototype.hasOwnProperty.call(ensemble, 'action'), false);
});

test('v199_187_11 Exchange Capability Registry keeps public learning separate from private execution and onboarding', () => {
  const { buildExchangeCapabilityRegistry, buildMultiExchangeOnboarding } = require('../backend/services/venuePolicy');
  const registry = buildExchangeCapabilityRegistry({ learningVenues:['binance','bybit'], exchanges:{binance:{connected:true,configured:true},bybit:{}}, venueStatus:{}, testnetProofs:[], liveAllowed:false });
  assert.equal(registry.venues.binance.truth, 'private-read-connected');
  assert.equal(registry.venues.bybit.truth, 'public-learning-only');
  assert.equal(registry.venues.bybit.runtime.privateReadConnected, false);
  assert.equal(registry.venues.bybit.runtime.liveExecutionReady, false);
  const onboarding = buildMultiExchangeOnboarding(registry);
  assert.equal(onboarding.venues.bybit.state, 'public-learning-ready');
  assert.equal(onboarding.venues.bybit.learningAllowed, true);
  assert.equal(onboarding.venues.bybit.executionAllowed, false);
  assert.equal(onboarding.venues.bybit.nextRequired, 'private-read');
});

test('v199_187_11 Market Stress Validation reduces fragile sizing without generating entries', () => {
  const { runMarketStressValidation } = require('../backend/services/workflowManager');
  const resilient = runMarketStressValidation({ expectedMovePct:0.65, estimatedRoundTripCostPct:0.10, spreadPct:0.02, volatility:'low' });
  const fragile = runMarketStressValidation({ expectedMovePct:0.10, estimatedRoundTripCostPct:0.14, spreadPct:0.08, volatility:'high' });
  assert.equal(resilient.authority, 'ranking-and-risk-only-no-entry-generation');
  assert.ok(resilient.score > fragile.score);
  assert.ok(fragile.sizeMultiplier < 1);
  assert.equal(Object.prototype.hasOwnProperty.call(fragile, 'action'), false);
});

test('v199_187_11 runtime wires cross-market, opportunity ranking, capability and stress APIs into the real path', () => {
  assert.match(source, /buildCrossMarketIntelligence/);
  assert.match(source, /buildMultiTimeframeContext/);
  assert.match(source, /updateRegimeTransitionForMarket/);
  assert.match(source, /marketStressValidation\.sizeMultiplier/);
  assert.match(source, /\/api\/market\/intelligence-2/);
  assert.match(source, /\/api\/market\/opportunities/);
  assert.match(source, /\/api\/exchanges\/capabilities/);
  assert.match(source, /\/api\/exchanges\/onboarding/);
  assert.match(source, /\/api\/market\/stress-validation/);
  assert.match(source, /CURRENT_STRATEGY_VERSION = 'v199_187-adaptive-exit-ai-core'/);
});

test('v199_187_11 compact Supabase UI references the merged SQL toolbox and local lifecycle is not labelled as exchange accepted', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app.js'), 'utf8');
  assert.doesNotMatch(app, /infra\/supabase_repair\.sql/);
  assert.doesNotMatch(app, /infra\/supabase_emergency_compact_v199_158\.sql/);
  assert.match(app, /infra\/supabase_tools\.sql/);
  assert.match(app, /LOCAL_SIMULATION_ACCEPTED/);
  assert.match(app, /HELYI SZIMULÁCIÓ/);
  assert.match(app, /Math\.abs\(n\) < 0\.01 \? 4 : 2/);
});

test('v199_187_12 Market Simulation Lab and Monte Carlo are seeded, reproducible and never verified trading evidence', () => {
  const { runMarketSimulationLab, runTradeMonteCarlo } = require('../backend/services/workflowManager');
  const history = Array.from({length:40}, (_,i)=>({ time:new Date(1700000000000+i*60000).toISOString(), price:100+i*0.08 }));
  const input = { seed:'fixed-seed', side:'BUY', notionalUsd:100, feePct:0.1, spreadPct:0.03, slippagePct:0.02, productType:'spot', history };
  const a = runMarketSimulationLab(input), b = runMarketSimulationLab(input);
  assert.equal(a.tradingEvidence, false);
  assert.equal(a.promotionAuthority, 'validation-input-only-never-live-authorization');
  assert.deepEqual(a.scenarios.map(x=>[x.key,x.status,x.netPnlUsd]), b.scenarios.map(x=>[x.key,x.status,x.netPnlUsd]));
  assert.ok(a.scenarios.some(x=>x.key==='partial-fill' && x.fillRatio < 1));
  assert.ok(a.scenarios.some(x=>x.key==='rejection' && x.status==='rejected'));
  const mcA = runTradeMonteCarlo([0.12,-0.05,0.08,0.04,-0.02,0.11], {seed:'mc-fixed', iterations:120, sampleLength:12});
  const mcB = runTradeMonteCarlo([0.12,-0.05,0.08,0.04,-0.02,0.11], {seed:'mc-fixed', iterations:120, sampleLength:12});
  assert.equal(mcA.tradingEvidence, false);
  assert.deepEqual(mcA.summary, mcB.summary);
});

test('v199_187_12 Global Learning Coordinator preserves venue provenance and grants no execution or capital authority', () => {
  const { buildGlobalLearningCoordinator } = require('../backend/services/multiExchangeAgentMesh');
  const mesh={venues:{binance:{learningEligible:true},bybit:{learningEligible:true},okx:{learningEligible:true}}};
  const scorecard={routes:[
    {dimensions:{venue:'BINANCE',symbol:'BTC/USDT',regime:'BULL',side:'BUY',strategy:'TREND'},trades:20,reliability:0.8,expectancyUsd:0.04,profitFactor:1.4,sampleStatus:'qualified',mode:'paper'},
    {dimensions:{venue:'BYBIT',symbol:'BTC/USDT',regime:'BULL',side:'BUY',strategy:'TREND'},trades:18,reliability:0.75,expectancyUsd:0.03,profitFactor:1.3,sampleStatus:'qualified',mode:'paper'}
  ]};
  const out=buildGlobalLearningCoordinator({mesh,scorecard});
  assert.equal(out.executionAuthority,'none');
  assert.equal(out.capitalAuthority,'none');
  assert.equal(out.transferablePatterns,1);
  const p=out.patterns[0];
  assert.equal(p.executionExperienceTransfer,false);
  assert.equal(p.riskAuthority,'none-until-target-venue-local-validation');
  assert.deepEqual(new Set(p.supportingVenues), new Set(['binance','bybit']));
  assert.equal(out.venueValidation.okx.localValidationRequired,true);
});

test('v199_187_12 orderbook intelligence requires real depth, freshness and continuous sequence', () => {
  const { scoreOrderbook } = require('../backend/services/edge/orderbookAI');
  const now=new Date().toISOString();
  const good=scoreOrderbook({bids:[[100,5]],asks:[[100.1,4]],updatedAt:now,sequence:101},{previousSequence:100,maxAgeMs:5000});
  assert.equal(good.trusted,true);
  assert.equal(good.sequence,101);
  const gap=scoreOrderbook({bids:[[100,5]],asks:[[100.1,4]],updatedAt:now,sequence:105},{previousSequence:101,maxAgeMs:5000});
  assert.equal(gap.trusted,false);
  assert.equal(gap.signal,'sequence_gap');
  const empty=scoreOrderbook({updatedAt:now,sequence:1},{maxAgeMs:5000});
  assert.equal(empty.trusted,false);
  assert.equal(empty.dataStatus,'insufficient_depth');
  assert.equal(empty.depthTotal,0);
});

test('v199_187_12 funding intelligence never fabricates spot funding and exposes missing perp data', () => {
  const { fundingBias } = require('../backend/services/edge/fundingEdge');
  const spot=fundingBias({productType:'spot',fundingRate:0.01});
  assert.equal(spot.status,'not-applicable-spot');
  assert.equal(spot.expectedFundingCostPct,0);
  const missing=fundingBias({productType:'perpetual'});
  assert.equal(missing.status,'funding-data-missing');
  assert.equal(missing.expectedFundingCostPct,null);
  const perp=fundingBias({productType:'perpetual',fundingRate:0.0002,basisPct:0.3,holdIntervals:2});
  assert.equal(perp.status,'validated');
  assert.equal(perp.bias,'short_bias');
  assert.ok(perp.expectedFundingCostPct>0);
});

test('v199_187_12 Strategy Builder is schema constrained, shadow first and Visual Graph is non executable', () => {
  const { buildStrategyConfigFromText, buildVisualStrategyGraph } = require('../backend/services/strategySwitcher');
  const safe=buildStrategyConfigFromText('BTC/USDT trend long 5m max kockázat 0.5% stop loss 0.4% take profit 1.2%');
  assert.equal(safe.arbitraryCodeExecution,false);
  assert.equal(safe.config.deployment.initialMode,'shadow');
  assert.equal(safe.config.deployment.liveAuthority,false);
  const unsafe=buildStrategyConfigFromText('BTC trend long martingale all-in');
  assert.equal(unsafe.ok,false);
  assert.ok(unsafe.unresolved.some(x=>/veszélyes/.test(x)));
  const graph=buildVisualStrategyGraph({id:safe.id,config:safe.config,blockers:['shadow-only']});
  assert.equal(graph.executable,false);
  assert.equal(graph.initialMode,'shadow');
  assert.ok(graph.nodes.some(n=>n.id==='execution'));
});

test('v199_187_12 runtime exposes simulation, learning coordinator, microstructure, funding, strategy builder and self healing diagnostics', () => {
  assert.match(source, /\/api\/market\/simulation-lab/);
  assert.match(source, /\/api\/learning\/global-coordinator/);
  assert.match(source, /\/api\/market\/microstructure/);
  assert.match(source, /\/api\/market\/funding-intelligence/);
  assert.match(source, /\/api\/strategy\/builder\/preview/);
  assert.match(source, /\/api\/strategy\/graph/);
  assert.match(source, /\/api\/runtime\/self-healing/);
  assert.match(source, /runMarketSimulationLab/);
  assert.match(source, /buildGlobalLearningCoordinator/);
  assert.match(source, /CURRENT_STRATEGY_VERSION = 'v199_187-adaptive-exit-ai-core'/);
});

test('v199_187_12 live-read guidance distinguishes normal stored private read from special live readiness proof', () => {
  assert.match(source, /normál private read/i);
  assert.match(source, /live-readiness/i);
});

function v13Rows(n=100){const base=Date.parse('2026-01-01T00:00:00Z');return Array.from({length:n},(_,i)=>({id:'v13-'+i,verified:true,reconciled:true,status:'closed',mode:'paper',venue:'binance',requestedVenue:'binance',symbol:'BTC/USDT',regime:'BULL',side:'BUY',strategy:'TREND',strategyVersion:'v199_187-adaptive-exit-ai-core',openedAt:new Date(base+i*3600000).toISOString(),closedAt:new Date(base+i*3600000+60000).toISOString(),netPnl:i%4===0?-0.05:0.12,fee:0.01,quantity:1}));}
function v13Temp(t){const os=require('os');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-v13-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}

test('v13 validation and test PnL cannot change trained artifact; content identity excludes wall clock',t=>{
  const {buildCandidate}=require('../backend/services/continuousRetraining');
  const {registerCandidate}=require('../backend/services/modelRegistry');
  const rows=v13Rows(),a=buildCandidate(rows,{mode:'paper'});
  const changed=rows.map((r,i)=>i<70?r:{...r,netPnl:-100,fee:40});
  const b=buildCandidate(changed,{mode:'paper'});
  assert.deepEqual(a.artifact,b.artifact);assert.equal(a.trainFingerprint,b.trainFingerprint);
  assert.notEqual(a.datasetFingerprint,b.datasetFingerprint);
  assert.notEqual(a.validationMetrics.netPnl,b.validationMetrics.netPnl);
  const dir=v13Temp(t);const first=registerCandidate(dir,{...a,createdAt:'2026-01-01',provenance:{...a.provenance,generatedAt:'today'}});
  const second=registerCandidate(dir,{...a,createdAt:'2026-10-08',provenance:{...a.provenance,generatedAt:'tomorrow'}});
  assert.equal(first.entry.id,second.entry.id);assert.equal(second.created,false);
  const correction=rows.map((r,i)=>i===2?{...r,netPnl:200}:r);
  assert.notEqual(buildCandidate(correction,{mode:'paper'}).trainFingerprint,a.trainFingerprint);
});

test('v13 purges overlapping positions, equal-time boundaries, mixed modes and duplicate outcomes',()=>{
  const {purgedSplit}=require('../backend/services/continuousRetraining');
  const rows=v13Rows();rows[70].openedAt=rows[65].openedAt;
  rows.push({...rows[5]},{...rows[6],id:'different-mode',mode:'live'});
  const split=purgedSplit(rows,{mode:'paper',embargoMs:60000});
  assert.ok(split.purged>=5);assert.ok(split.ordered.every(r=>r.mode==='paper'));
  assert.equal(new Set(split.ordered.map(r=>r.id)).size,split.ordered.length);
  assert.ok(Math.max(...split.train.map(r=>Date.parse(r.closedAt)))+60000<Math.min(...split.validation.map(r=>Date.parse(r.openedAt))));
});

test('v13 evaluates frozen policy behavior and Monte Carlo only uses untouched test outcomes',()=>{
  const {buildCandidate,prepareTraining,evaluateFrozenPolicy}=require('../backend/services/continuousRetraining');
  const rows=v13Rows(),c=buildCandidate(rows,{mode:'paper'});
  const low={...c.artifact,routeWeights:Object.fromEntries(Object.keys(c.artifact.routeWeights).map(k=>[k,{riskHint:0.55}]))};
  const high={...c.artifact,routeWeights:Object.fromEntries(Object.keys(c.artifact.routeWeights).map(k=>[k,{riskHint:1}]))};
  assert.notEqual(evaluateFrozenPolicy(low,rows).metrics.netPnl,evaluateFrozenPolicy(high,rows).metrics.netPnl);
  assert.equal(c.evaluation.tradingEvidence,false);assert.equal(c.evaluation.riskIncreaseEligible,false);
  const out=prepareTraining({trades:rows,mode:'paper'});
  assert.equal(out.monteCarlo.sampleSource,'untouched-test-frozen-policy-replay');
  assert.equal(out.policySearch.variants,6);assert.equal(out.policySearch.selectionSource,'train-only');
  assert.deepEqual(out.policySearch,prepareTraining({trades:rows,mode:'paper'}).policySearch);
});

test('v13 historical replay cannot create a risk champion; experiments still collect evidence',t=>{
  const {registerCandidate,validateCandidate,promoteChampion,updateForwardEvidence,registrySnapshot}=require('../backend/services/modelRegistry');
  const {buildCandidate}=require('../backend/services/continuousRetraining');const dir=v13Temp(t);
  const c=buildCandidate(v13Rows(),{mode:'paper'}),r=registerCandidate(dir,c);
  validateCandidate(dir,r.entry.id,{minTrades:3,minReliability:0,minScore:0,minProfitFactor:0,minExpectancyUsd:-999});
  assert.equal(promoteChampion(dir,r.entry.id).promoted,false);
  const forward=v13Rows(60).map((x,i)=>({...x,id:'forward-'+i,candidateFingerprint:c.artifactFingerprint,experimentId:(typeof registered!=='undefined'?registered.entry.id:r.entry.id),configFingerprint:(typeof registered!=='undefined'?registered.entry.configFingerprint:r.entry.configFingerprint),openedAt:new Date(Date.parse('2026-05-01')+i*3600000).toISOString(),closedAt:new Date(Date.parse('2026-05-01')+i*3600000+60000).toISOString()}));
  updateForwardEvidence(dir,forward);
  assert.equal(registrySnapshot(dir).entries[0].riskIncreaseEligible,true);
  assert.equal(promoteChampion(dir,r.entry.id).promoted,true);
});

test('v13 complete durable model+config backup survives deletion and overrides stale nonempty cache',t=>{
  const {registerCandidate,exportDurableBundle,restoreDurableBundle,readRegistry,verifyBundle}=require('../backend/services/modelRegistry');
  const dir=v13Temp(t);registerCandidate(dir,{datasetFingerprint:'one',artifact:{routeWeights:{a:{riskHint:0.6}}}});
  const old=exportDurableBundle(dir,{riskLimits:{maxLoss:1},executionPolicy:{liveRealSubmit:false}});
  registerCandidate(dir,{datasetFingerprint:'two',artifact:{routeWeights:{b:{riskHint:0.8}}}});
  const bundle=exportDurableBundle(dir,{riskLimits:{maxLoss:0.5},executionPolicy:{liveRealSubmit:false}});
  const backup=path.join(dir,'backup.json');fs.writeFileSync(backup,JSON.stringify(bundle));
  fs.rmSync(path.join(dir,'storage'),{recursive:true,force:true});
  const restored=restoreDurableBundle(dir,JSON.parse(fs.readFileSync(backup)));
  assert.equal(restored.restored,true);assert.equal(restored.config.riskLimits.maxLoss,0.5);
  assert.deepEqual(readRegistry(dir),bundle.registry);
  fs.writeFileSync(path.join(dir,'storage','model_registry_v2.json'),JSON.stringify(old.registry));
  assert.equal(restoreDurableBundle(dir,bundle).restored,true);
  assert.equal(restoreDurableBundle(dir,old).restored,false);
  assert.equal(verifyBundle({...bundle,config:{corrupted:true}}),false);
});

test('v13 worker produces identical trained artifact without blocking parent timers',async()=>{
  const {prepareTraining,prepareTrainingInWorker}=require('../backend/services/continuousRetraining');
  const ctx={trades:v13Rows(300),mode:'paper'};let ticks=0;const timer=setInterval(()=>ticks++,1);
  try{const result=await prepareTrainingInWorker(ctx);assert.deepEqual(result.candidate.artifact,prepareTraining(ctx).candidate.artifact);assert.ok(ticks>0);}finally{clearInterval(timer);}
});

test('v13 concurrent workers cannot submit twice; content mutation, lease expiry and restart fail closed',async t=>{
  const {FileAuthorityStore,ExecutionAuthority,sealIntent}=require('../backend/services/executionAuthority');
  const dir=v13Temp(t),file=path.join(dir,'ledger.json');const storeA=new FileAuthorityStore(file),storeB=new FileAuthorityStore(file);
  const input={decisionId:'intent',venue:'binance',symbol:'BTC/USDT',side:'BUY',quantity:1,entryPrice:100,mode:'paper'},seal=sealIntent(input),rules={orderTypes:['MARKET'],minQty:0.1,minNotional:10};
  let sends=0;const send=async()=>{sends++;await new Promise(r=>setTimeout(r,20));return {accepted:true,exchangeOrderId:'one'};};
  const a=new ExecutionAuthority(storeA,'a'),b=new ExecutionAuthority(storeB,'b');
  const results=await Promise.all([a.submit(input,seal,rules,send),b.submit(input,seal,rules,send)]);
  assert.equal(sends,1);assert.equal(results.filter(r=>r.accepted).length,1);
  const mutation=await a.submit({...input,quantity:2},seal,rules,send);assert.equal(mutation.status,'CONTRACT_MUTATION_BLOCKED');
  const restart=await new ExecutionAuthority(new FileAuthorityStore(file),'a').submit(input,seal,rules,send);
  assert.equal(restart.reused,true);assert.equal(sends,1);
  const lease=await storeA.command('acquire',{owner:'a',ttlMs:1});await new Promise(r=>setTimeout(r,3));
  const reserve=await storeB.command('reserve',{owner:'a',token:lease.token,key:'new',hash:'hash',clientOrderId:'cid'});assert.equal(reserve.ok,false);
});

test('v13 late exchange acceptance after timeout is reconciled and never resubmitted',async t=>{
  const {FileAuthorityStore,ExecutionAuthority,sealIntent}=require('../backend/services/executionAuthority');const dir=v13Temp(t),store=new FileAuthorityStore(path.join(dir,'ledger.json'));
  const a=new ExecutionAuthority(store,'worker',{timeoutMs:5}),input={decisionId:'late',venue:'binance',symbol:'BTC/USDT',side:'BUY',quantity:1,entryPrice:100,mode:'testnet'},seal=sealIntent(input);
  let sends=0;const send=async()=>{sends++;await new Promise(r=>setTimeout(r,40));return {accepted:true,exchangeOrderId:'late-one'};};
  const first=await a.submit(input,seal,{orderTypes:['MARKET']},send);assert.equal(first.pending,true);
  const second=await a.submit(input,seal,{orderTypes:['MARKET']},send,async()=>null);assert.equal(second.status,'RECONCILIATION_REQUIRED');assert.equal(sends,1);
  await new Promise(r=>setTimeout(r,60));const last=await a.submit(input,seal,{orderTypes:['MARKET']},send);
  assert.equal(last.accepted,true);assert.equal(last.reused,true);assert.equal(sends,1);
});

test('v13 revoked lease cannot cross network boundary and unknown order survives restart',async t=>{
  const {FileAuthorityStore,ExecutionAuthority,sealIntent}=require('../backend/services/executionAuthority');const file=path.join(v13Temp(t),'ledger.json'),base=new FileAuthorityStore(file);
  const wrapper={command:async(action,args)=>action==='renew'?{ok:false,reason:'lease-lost'}:base.command(action,args)};
  const input={decisionId:'loss',venue:'binance',symbol:'BTC/USDT',side:'BUY',quantity:1,entryPrice:100,mode:'paper'};let sends=0;
  const r=await new ExecutionAuthority(wrapper,'one').submit(input,sealIntent(input),{orderTypes:['MARKET']},()=>{sends++;});
  assert.equal(r.status,'LEASE_OR_CONTRACT_LOST');assert.equal(sends,0);
  const r2=await new ExecutionAuthority(new FileAuthorityStore(file),'one').submit(input,sealIntent(input),{orderTypes:['MARKET']},()=>{sends++;});
  assert.equal(r2.status,'RECONCILIATION_REQUIRED');assert.equal(sends,0);
});

test('v13 precision and venue/symbol/strategy/correlation/leverage budgets protect proposed orders',()=>{
  const {validateRules}=require('../backend/services/executionAuthority');const i={venue:'binance',symbol:'BTC/USDT',side:'BUY',quantity:0.015,entryPrice:100,orderType:'MARKET'};
  assert.equal(validateRules(i,{verified:true,venue:'binance',symbol:'BTC/USDT',fetchedAt:Date.now(),stepSize:0.01,minQty:0.01,minNotional:5,orderTypes:['MARKET']},true).passed,false);
  const {evaluatePortfolioRisk2,equityCurvePolicy}=require('../backend/services/portfolioLevelRiskManager');
  const bad=evaluatePortfolioRisk2({positions:[],proposed:{venue:'binance',symbol:'BTC/USDT',strategy:'TREND',notionalUsd:110,leverage:4},venueEquity:{binance:100},limits:{correlationPct:40}});
  assert.equal(bad.passed,false);assert.ok(bad.failures.some(x=>x.startsWith('correlated')));assert.ok(bad.failures.some(x=>x.startsWith('leverage')));
  assert.equal(evaluatePortfolioRisk2({positions:[],proposed:{venue:'binance',symbol:'BTC/USDT',notionalUsd:1},venueEquity:{binance:100}}).passed,true);
  assert.equal(equityCurvePolicy(v13Rows(60),1000,null).riskMultiplier,1);
  assert.equal(equityCurvePolicy(v13Rows(60),1000,{riskIncreaseEligible:true}).qualified,true);
});

test('v13 CI file, durable CAS wiring, enforced submit gates and SVG graph actually exist',()=>{
  assert.ok(fs.existsSync(path.join(__dirname,'..','.github','workflows','nexus-ci.yml')));
  const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','nexus-ci.yml'),'utf8');
  for(const command of ['npm ci','npm run check','npm run release:test','npm run test:smoke'])assert.ok(workflow.includes(command));
  assert.match(source,/prepareTrainingInWorker/);assert.match(source,/restoreDurableBundle/);assert.match(source,/p_expected_revision:learningRemoteRevision/);assert.match(source,/guardedLocalSubmit\(order,adapter\)/);assert.match(source,/newClientOrderId:clientOrderId/);assert.match(source,/marketUnit:'baseCoin'/);
  assert.match(fs.readFileSync(path.join(__dirname,'..','frontend','app.js'),'utf8'),/renderStrategyGraphSvg/);
});

test('v13 isolated PostgreSQL executes CAS/lease SQL, denies public roles, and restores a deleted local registry',async t=>{
  const {PGlite}=require('@electric-sql/pglite');const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const sql=fs.readFileSync(path.join(__dirname,'..','infra','supabase_tools.sql'),'utf8').split('-- BEGIN v199_187_13 isolated learning-state + execution-authority migration')[1].split('-- END v199_187_13')[0];
  await pg.exec(sql);
  const rpc=async(action,args,scope='test')=>(await pg.query('select nexus_execution_authority($1,$2,$3::jsonb) as result',[scope,action,JSON.stringify(args)])).rows[0].result;
  const [a,b]=await Promise.all([rpc('acquire',{owner:'a',ttlMs:1000}),rpc('acquire',{owner:'b',ttlMs:1000})]);
  assert.equal(a.ok,true);assert.equal(b.ok,false);
  const reserve=await rpc('reserve',{owner:'a',token:a.token,key:'one',hash:'hash',clientOrderId:'nx1'});assert.equal(reserve.ok,true);
  assert.equal((await rpc('reserve',{owner:'a',token:a.token,key:'one',hash:'hash',clientOrderId:'nx1'})).reason,'existing-order');
  assert.equal((await rpc('reserve',{owner:'a',token:a.token,key:'one',hash:'changed',clientOrderId:'nx1'})).reason,'idempotency-content-conflict');
  await rpc('complete',{key:'one',token:a.token,status:'accepted',receipt:{accepted:true}});
  assert.equal((await rpc('lookup',{key:'one'})).order.status,'accepted');
  await pg.exec('set role anon');await assert.rejects(pg.query("select nexus_execution_authority('test','acquire','{}')"));await pg.exec('reset role');
  const {registerCandidate,exportDurableBundle,restoreDurableBundle,readRegistry}=require('../backend/services/modelRegistry');
  const dir=v13Temp(t);registerCandidate(dir,{datasetFingerprint:'pg',artifact:{routeWeights:{a:{riskHint:0.65}}}});
  const bundle=exportDurableBundle(dir,{riskLimits:{maxLoss:1},executionPolicy:{liveRealSubmit:false}});
  const save=async(rev,payload)=>(await pg.query('select nexus_save_learning_state($1,$2,$3::jsonb) as result',['bundle',rev,JSON.stringify(payload)])).rows[0].result;
  assert.equal((await save(0,bundle)).ok,true);assert.equal((await save(0,{bad:true})).reason,'revision-conflict');
  fs.rmSync(path.join(dir,'storage'),{recursive:true,force:true});
  const remote=(await pg.query("select payload from nexus_learning_state where id='bundle'")).rows[0].payload;
  assert.equal(restoreDurableBundle(dir,remote).restored,true);assert.deepEqual(readRegistry(dir),bundle.registry);
});

test('v13 two independent OS workers share one durable authority and expired owner is fenced',async t=>{
  const {spawn}=require('child_process');const file=path.join(v13Temp(t),'ledger.json');
  const moduleFile=path.resolve(__dirname,'..','backend','services','executionAuthority.js');
  const script=`const {FileAuthorityStore}=require(process.argv[1]);new FileAuthorityStore(process.argv[2]).command('acquire',{owner:process.argv[3],ttlMs:1000}).then(x=>process.stdout.write(JSON.stringify(x))).catch(e=>{console.error(e);process.exitCode=1});`;
  const run=owner=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['-e',script,moduleFile,file,owner]);let out='';child.stdout.on('data',b=>out+=b);child.once('error',reject);child.once('exit',code=>code===0?resolve(JSON.parse(out)):reject(new Error('worker exit '+code)));});
  const result=await Promise.all([run('first-process'),run('second-process')]);assert.equal(result.filter(r=>r.ok).length,1);
  const {FileAuthorityStore}=require('../backend/services/executionAuthority');const store=new FileAuthorityStore(file);
  const state=JSON.parse(fs.readFileSync(file));state.expires=Date.now()-1;fs.writeFileSync(file,JSON.stringify(state));
  const newLease=await store.command('acquire',{owner:'new',ttlMs:1000});assert.ok(newLease.token>state.token);
  assert.equal((await store.command('renew',{owner:state.owner,token:state.token,ttlMs:1000})).ok,false);
});

test('v13 video Supabase recovery incident is fixed: failed range read backs off and succeeds',async()=>{
  const start=source.indexOf('async function supabaseSelectRange('),end=source.indexOf('\n}',start)+2;
  let calls=0,cancelled=0,success=0;
  const fn=vm.runInNewContext('('+source.slice(start,end)+')',{
    supabaseHeaders:()=>({Prefer:'return=representation'}),process:{env:{SUPABASE_URL:'https://isolated.invalid',NEXUS_SUPABASE_RANGE_RETRIES:'2'}},
    timeoutSignal:()=>({signal:undefined,cancel:()=>cancelled++}),sleep:require('node:timers/promises').setTimeout,
    fetch:async()=>{calls++;if(calls===1)throw new Error('transient isolated network failure');return {ok:true,text:async()=>'[{"id":"restored"}]'};},
    markSupabaseRead:(_table,ok)=>{if(ok)success++;},recordRecovery:()=>assert.fail('successful retry must not emit final failure')
  });
  assert.match(source,/setTimeout: sleep.*node:timers\/promises/);
  const result=await fn('trade_journal');assert.equal(result[0].id,'restored');assert.equal(calls,2);assert.equal(cancelled,2);assert.equal(success,1);
});

test('v13 active experiment survives new candidates; duplicate and corrected forward outcomes are audited',t=>{
  const {buildCandidate}=require('../backend/services/continuousRetraining');
  const {registerCandidate,registrySnapshot,updateForwardEvidence}=require('../backend/services/modelRegistry');
  const {recommendation}=require('../backend/services/strategyQualityAutopilot2');const root=v13Temp(t);
  const first=registerCandidate(root,buildCandidate(v13Rows(),{mode:'paper'})).entry;
  const newer=registerCandidate(root,buildCandidate(v13Rows().map((x,i)=>({...x,netPnl:i<65?0.01:x.netPnl})),{mode:'paper'})).entry;
  assert.notEqual(first.id,newer.id);assert.equal(registrySnapshot(root).experimentId,first.id);
  const rec=recommendation({},registrySnapshot(root),{mode:'paper',venue:'binance',symbol:'BTC/USDT',regime:'BULL',side:'BUY',strategy:'TREND'});
  assert.equal(rec.candidateFingerprint,first.artifactFingerprint);assert.ok(rec.frozenRiskHint<=1);
  const forward=v13Rows(30).map((x,i)=>({...x,id:'exp-'+i,candidateFingerprint:first.artifactFingerprint,experimentId:first.id,configFingerprint:first.configFingerprint,openedAt:new Date(Date.parse('2026-05-01')+i*3600000).toISOString(),closedAt:new Date(Date.parse('2026-05-01')+i*3600000+60000).toISOString()}));
  updateForwardEvidence(root,[...forward,...forward]);let entry=registrySnapshot(root).entries.find(e=>e.id===first.id);assert.equal(entry.prospectiveEvidence.rows,30);assert.equal(entry.riskIncreaseEligible,true);
  updateForwardEvidence(root,forward.map(x=>({...x,netPnl:-1})));entry=registrySnapshot(root).entries.find(e=>e.id===first.id);assert.equal(entry.prospectiveEvidence.rows,30);assert.equal(entry.riskIncreaseEligible,false);
});

test('v13 frozen candidate sizing reaches micro-probe order quantity and preserves provenance',()=>{
  const c=fixture('paper'),d=decision();d.strategyQualityAutopilot2={candidateFingerprint:'frozen-artifact',frozenRiskHint:0.55};
  const plain=loadFunction('capitalPositionQuantity',fixture('paper'))(100,decision(),{price:100});
  const scaled=loadFunction('capitalPositionQuantity',c)(100,d,{price:100});
  assert.ok(scaled<plain);assert.equal(d.appliedCandidateFingerprint,'frozen-artifact');assert.equal(d.appliedCandidatePolicy.riskHint,0.55);
});

test('v13 profitable historical route cannot boost evidence sizing without qualified forward champion',()=>{
  const {sizePosition}=require('../backend/services/evidencePositionSizer2');
  const input={baseNotionalUsd:100,availableCapitalUsd:10000,venueRiskBudgetUsd:5000,maxPositionSizePct:5,routeEvidence:{sampleStatus:'qualified',reliability:0.9,expectancyUsd:0.1,profitFactor:2}};
  assert.ok(sizePosition(input).finalNotionalUsd<=100);
  assert.ok(sizePosition({...input,qualityAutopilot:{riskIncreaseEligible:true}}).finalNotionalUsd>100);
});

test('v13 corrupt durable execution ledger fails closed instead of silently forgetting accepted orders',async t=>{
  const {FileAuthorityStore,ExecutionAuthority,sealIntent,validateRules}=require('../backend/services/executionAuthority');const file=path.join(v13Temp(t),'ledger.json');fs.writeFileSync(file,'{broken');let sends=0;
  const input={decisionId:'persisted',venue:'binance',symbol:'BTC/USDT',side:'BUY',quantity:0.001,entryPrice:100,mode:'paper'};
  await assert.rejects(new ExecutionAuthority(new FileAuthorityStore(file),'worker').submit(input,sealIntent(input),{orderTypes:['MARKET']},()=>sends++),/AUTHORITY_LEDGER_CORRUPT/);assert.equal(sends,0);
  assert.equal(validateRules(input,{verified:true,venue:'binance',symbol:'BTC/USDT',orderTypes:['MARKET']},true).passed,false);
  assert.equal(validateRules({...input,entryPrice:Infinity},{orderTypes:['MARKET']}).passed,false);
  const live={...input,mode:'LIVE'};assert.equal((await new ExecutionAuthority(new FileAuthorityStore(file),'worker').submit(live,sealIntent(live),{orderTypes:['MARKET']},()=>sends++)).status,'LIVE_SUBMIT_LOCKED');
});

test('v14 search deploys only train-selected frozen sizing, applies family correction and evaluates separate holdouts',()=>{
  const {buildCandidate,boundedPolicySearch,purgedSplit}=require('../backend/services/continuousRetraining');const rows=v13Rows();
  const candidate=buildCandidate(rows,{mode:'paper'}),split=purgedSplit(rows,{mode:'paper'});
  assert.equal(candidate.policySearch.correction.selectionUsesPenalty,true);assert.equal(candidate.policySearch.correction.returnBoundUsd,10);assert.equal(candidate.policySearch.trials.length,6);assert.equal(candidate.evaluation.searchValidation.selectionAudit.length,6);
  assert.equal(candidate.artifactFingerprint,require('../backend/services/modelRegistry').fingerprint(candidate.policySearch.winner.artifact));
  assert.equal(candidate.evaluation.searchValidation.selectionSource,'train-only');assert.equal(candidate.evaluation.searchValidation.riskIncreaseEligible,false);
  const changed=rows.map((r,i)=>i>=70?{...r,netPnl:-20}:r),other=buildCandidate(changed,{mode:'paper'});
  assert.equal(candidate.policySearch.winner.id,other.policySearch.winner.id);assert.deepEqual(candidate.artifact,other.artifact);
  assert.notEqual(candidate.validationMetrics.netPnl,other.validationMetrics.netPnl);
  assert.ok(candidate.policySearch.winner.selectionPenalty>0);
  assert.deepEqual(boundedPolicySearch(split.train,{seed:'fixed'}),boundedPolicySearch(split.train,{seed:'fixed'}));
});

test('v14 common champion policy requires its own venue, route and mode forward proof',t=>{
  const registry=require('../backend/services/modelRegistry'),{buildCandidate}=require('../backend/services/continuousRetraining');const dir=v13Temp(t),c=buildCandidate(v13Rows(),{mode:'paper'}),registered=registry.registerCandidate(dir,c);
  const forward=v13Rows(60).map((x,i)=>({...x,id:'policy-'+i,candidateFingerprint:c.artifactFingerprint,experimentId:(typeof registered!=='undefined'?registered.entry.id:r.entry.id),configFingerprint:(typeof registered!=='undefined'?registered.entry.configFingerprint:r.entry.configFingerprint),openedAt:new Date(Date.parse('2026-05-01')+i*3600000).toISOString(),closedAt:new Date(Date.parse('2026-05-01')+i*3600000+60000).toISOString()}));
  registry.updateForwardEvidence(dir,forward);assert.equal(registry.promoteChampion(dir,registered.entry.id).promoted,true);
  const snapshot=registry.registrySnapshot(dir),route={venue:'binance',mode:'paper',symbol:'BTC/USDT',regime:'BULL',side:'BUY',strategy:'TREND'};
  assert.equal(registry.registryPromotionPolicy(snapshot,route).riskIncreaseEligible,true);
  for(const change of [{venue:'bybit'},{mode:'staging'},{strategy:'SCALP'},{side:'SELL'}])assert.equal(registry.registryPromotionPolicy(snapshot,{...route,...change}).riskIncreaseEligible,false);
  const quality=require('../backend/services/strategyQualityAutopilot2').recommendation({},snapshot,{...route,venue:'bybit'});assert.equal(quality.riskIncreaseEligible,false);assert.ok(quality.riskMultiplier<=1);
});

test('v14 retired policy revalidation is idempotent, paper only, audited and cannot reuse old performance',t=>{
  const registry=require('../backend/services/modelRegistry'),{buildCandidate}=require('../backend/services/continuousRetraining');const dir=v13Temp(t),c=buildCandidate(v13Rows(),{mode:'paper'}),registered=registry.registerCandidate(dir,c);
  registry.retireModel(dir,registered.entry.id,'forward-strategy-decay');const trial=registry.openRevalidationTrial(dir,registered.entry.id);
  assert.equal(trial.ok,true);assert.equal(trial.created,true);assert.notEqual(trial.entry.id,registered.entry.id);assert.equal(trial.entry.revalidationOf,registered.entry.id);assert.equal(trial.entry.riskIncreaseEligible,false);assert.equal(trial.entry.provenance.mode,'paper');
  assert.equal(registry.openRevalidationTrial(dir,registered.entry.id).created,false);
  registry.updateForwardEvidence(dir,v13Rows(60).map(x=>({...x,candidateFingerprint:trial.entry.artifactFingerprint})));
  assert.equal(registry.registrySnapshot(dir).entries.find(e=>e.id===trial.entry.id).prospectiveEvidence.rows,0);
  assert.equal(registry.promoteChampion(dir,trial.entry.id).promoted,false);
  assert.ok(registry.registrySnapshot(dir).events.some(e=>e.type==='revalidation-trial-opened'));
  const saved=registry.exportDurableBundle(dir,{mode:'paper'});fs.rmSync(path.join(dir,'storage'),{recursive:true});assert.equal(registry.restoreDurableBundle(dir,saved).ok,true);assert.equal(registry.registrySnapshot(dir).experimentId,trial.entry.id);
});

test('v14 live correlation input is scoped, sample/freshness guarded and global exposure is checked',()=>{
  const {evaluatePortfolioRisk2}=require('../backend/services/portfolioLevelRiskManager');
  const positions=[{venue:'binance',symbol:'BTC/USDT',notionalUsd:30},{venue:'binance',symbol:'ETH/USDT',notionalUsd:30}],venueEquity={binance:100};const limits={venuePct:100,symbolPct:100,strategyPct:100,correlationPct:50};
  const key='binance:BTC/USDT|binance:ETH/USDT';
  const fresh=evaluatePortfolioRisk2({positions,venueEquity,limits,correlations:{[key]:{correlation:0,samples:30,asOf:Date.now()}}});assert.equal(fresh.passed,true);assert.ok(fresh.globalCorrelatedRiskUsd<50);
  for(const estimate of [{correlation:0,samples:2,asOf:Date.now()},{correlation:0,samples:30,asOf:Date.now()-120000},{correlation:0,samples:30,asOf:Date.now()+120000}])assert.equal(evaluatePortfolioRisk2({positions,venueEquity,limits,correlations:{[key]:estimate}}).passed,false);
  const cross=evaluatePortfolioRisk2({positions:[...positions,{venue:'bybit',symbol:'BTC/USDT',notionalUsd:60}],venueEquity:{binance:100,bybit:100},limits});assert.ok(cross.failures.includes('global-correlated-budget'));
});

test('v14 compounding integration uses at least 50 possible venue samples and restores actual current equity',()=>{
  assert.match(source,/const equitySample=currentStrategyVerifiedTrades\(db\)\.filter\(row=>onlineLearningMarketVenue\(row\)===decisionVenue\)\.slice\(0,200\)/);
  const {equityCurvePolicy}=require('../backend/services/portfolioLevelRiskManager');const rows=v13Rows(60).map(x=>({...x,netPnl:1,candidateFingerprint:'policy'}));
  const c={artifactFingerprint:'policy',riskIncreaseEligible:true,provenance:{mode:'paper'}};
  assert.equal(equityCurvePolicy(rows,1060,c).qualified,true);assert.equal(equityCurvePolicy(rows.slice(0,24),1060,c).qualified,false);
  assert.equal(equityCurvePolicy(rows.map(x=>({...x,mode:'staging'})),1060,c).qualified,false);
  const drawdown=equityCurvePolicy([{...rows[0],netPnl:-100}],900,null);assert.equal(drawdown.maxDrawdownPct,10);
});

test('v14 optional registry detail view escapes labels and exposes no execution authority',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'..','frontend','app.js'),'utf8'),start=ui.indexOf('function renderRegistryPolicyDetails('),end=ui.indexOf('\n}',start)+2;
  const html=vm.runInNewContext('('+ui.slice(start,end)+')',{S:{},asList:x=>Array.isArray(x)?x:[],escapeHtml:x=>String(x).replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),usd:x=>'$'+x,preciseTimeLabel:x=>x})({entries:[{id:'<unsafe>',status:'retired',prospectiveEvidence:{rows:0}}]});
  assert.match(html,/<details/);assert.match(html,/&lt;unsafe&gt;/);assert.doesNotMatch(html,/<unsafe>/);assert.match(html,/LIVE tiltva/);assert.match(html,/data-revalidate-model/);
});

test('v14 public REST depth adapters parse four own-venue snapshots without claiming delta continuity',()=>{
  const {parsePublicDepth,publicEdgeRoutes}=require('../backend/services/marketData'),{scoreOrderbook}=require('../backend/services/edge/orderbookAI'),now=Date.now();
  const bids=[['100','3'],['99','4']],asks=[['101','2'],['102','3']];
  const payloads={binance:{lastUpdateId:999,bids,asks},bybit:{retCode:0,result:{s:'BTCUSDT',b:bids,a:asks,ts:now,u:999}},okx:{code:'0',data:[{bids,asks,ts:String(now),seqId:999}]},kraken:{error:[],result:{XBTUSDT:{bids,asks}}}};
  for(const [v,raw] of Object.entries(payloads)){const book=parsePublicDepth(v,'BTC/USDT','spot',raw,now),score=scoreOrderbook(book,{previousSequence:1});assert.equal(score.trusted,true);assert.equal(score.sequenceValidation,'full-snapshot-no-delta-continuity-claim');assert.equal(book.venue,v);assert.equal(publicEdgeRoutes(v,'BTC/USDT','spot').funding,null);}
  assert.equal(scoreOrderbook({bids,asks,sequence:999,updatedAt:new Date(now).toISOString()},{previousSequence:1}).trusted,false);
  assert.throws(()=>publicEdgeRoutes('kraken','BTC/USDT','perp'),/UNSUPPORTED/);
});

test('v14 malformed/crossed/stale L2 and null perpetual funding fail closed; spot never acquires funding',()=>{
  const {parsePublicDepth,parsePublicFunding}=require('../backend/services/marketData'),{fundingBias}=require('../backend/services/edge/fundingEdge'),now=Date.now();
  assert.throws(()=>parsePublicDepth('binance','BTC/USDT','spot',{bids:[[101,1]],asks:[[100,1]]}),/CROSSED/);
  assert.throws(()=>parsePublicDepth('bybit','BTC/USDT','spot',{retCode:0,result:{s:'ETHUSDT',b:[[100,1]],a:[[101,1]],ts:now}}),/SYMBOL/);
  assert.throws(()=>parsePublicDepth('binance','BTC/USDT','spot',{bids:[[100,1]],asks:[[101,1]],T:now-10000}),/STALE/);
  assert.equal(fundingBias({productType:'perp',fundingRate:null}).status,'funding-data-missing');
  assert.throws(()=>parsePublicFunding('binance','BTC/USDT','perp',{symbol:'BTCUSDT',lastFundingRate:null}),/MISSING/);
  assert.equal(parsePublicFunding('binance','BTC/USDT','spot',{lastFundingRate:1}).status,'not-applicable-spot');
  const funding=parsePublicFunding('bybit','BTC/USDT','perp',{retCode:0,time:now,result:{list:[{symbol:'BTCUSDT',fundingRate:'0.0001',markPrice:'101',indexPrice:'100'}]}},now);
  assert.equal(fundingBias({...funding,productType:'perp'}).status,'validated');assert.equal(funding.fundingRate,0.0001);assert.equal(funding.basisPct,1);
});

test('v14 public edge poller bounds concurrency, separates products and expires stale cached depth',async()=>{
  const {PublicEdgeFeedCache}=require('../backend/services/marketData');let active=0,peak=0,requests=0;
  const cache=new PublicEdgeFeedCache(async(url,options)=>{assert.ok(options.signal);assert.equal(options.headers,undefined);requests++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,3));active--;return {ok:true,json:async()=>({lastUpdateId:10,bids:[[100,2]],asks:[[101,3]]})};});
  await cache.refresh([{venue:'binance',symbol:'BTC/USDT',productType:'spot'},{venue:'binance',symbol:'ETH/USDT',productType:'spot'},{venue:'binance',symbol:'SOL/USDT',productType:'spot'}]);assert.equal(requests,3);assert.ok(peak<=2);assert.ok(cache.get('binance','BTC/USDT','spot').depth);assert.equal(cache.get('binance','BTC/USDT','perp'),null);
  const row=cache.rows.get('binance|BTC/USDT|spot');row.depth.updatedAt=new Date(Date.now()-10000).toISOString();assert.equal(cache.get('binance','BTC/USDT','spot').depth,null);
  assert.match(source,/publicEdgeFeedTick/);assert.match(source,/publicEdgeFeeds.get\(v,s,marketType\)/);
});

test('v14 public edge provider failure is explicit and backoff avoids repeated requests',async()=>{
  const {PublicEdgeFeedCache}=require('../backend/services/marketData');let calls=0;const cache=new PublicEdgeFeedCache(async()=>{calls++;return {ok:false,status:429};});
  const markets=[{venue:'binance',symbol:'BTC/USDT',productType:'spot'}];await cache.refresh(markets);await cache.refresh(markets);assert.equal(calls,1);assert.equal(cache.status()[0].status,'unavailable');assert.equal(cache.status()[0].privateAuthority,false);assert.equal(cache.get('binance','BTC/USDT','spot').depth,null);
});

test('v15 identical artefacts cannot mix separate experiments or synthetic/future results',t=>{
 const r=require('../backend/services/modelRegistry'),{buildCandidate}=require('../backend/services/continuousRetraining'),dir=v13Temp(t);
 const parent=r.registerCandidate(dir,buildCandidate(v13Rows(),{mode:'paper'})).entry;r.retireModel(dir,parent.id);const trial=r.openRevalidationTrial(dir,parent.id).entry;
 assert.equal(parent.artifactFingerprint,trial.artifactFingerprint);
 const start=Date.now()-120000;trial.evaluation.holdoutEndAt=start-60000;trial.evaluation.embargoMs=0;
 const reg=r.readRegistry(dir);Object.assign(reg.entries.find(e=>e.id===trial.id),trial);r.writeRegistry(dir,reg);
 const rows=v13Rows(35).map((x,i)=>({...x,id:'own-'+i,candidateFingerprint:trial.artifactFingerprint,experimentId:trial.id,configFingerprint:trial.configFingerprint,openedAt:new Date(start+i*1000).toISOString(),closedAt:new Date(start+i*1000+500).toISOString()}));
 const bad=[...rows.map(x=>({...x,id:'old-'+x.id,experimentId:parent.id})),...rows.map(x=>({...x,id:'cfg-'+x.id,configFingerprint:'wrong'})),...rows.map(x=>({...x,id:'fake-'+x.id,synthetic:true})),...rows.map(x=>({...x,id:'future-'+x.id,closedAt:new Date(Date.now()+86400000).toISOString()}))];
 r.updateForwardEvidence(dir,[...rows,...bad]);assert.equal(r.registrySnapshot(dir).entries.find(e=>e.id===trial.id).prospectiveEvidence.rows,35);
 const {sealIntent,verifyIntent}=require('../backend/services/executionAuthority');const intent={decisionId:'one',mode:'paper',experimentId:trial.id,configFingerprint:trial.configFingerprint};assert.equal(verifyIntent({...intent,experimentId:parent.id},sealIntent(intent)),false);
});
test('v15 durable bundle rejects conflicting config, duplicate identities and invalid revisions',t=>{
 const r=require('../backend/services/modelRegistry'),dir=v13Temp(t);r.registerCandidate(dir,{artifact:{a:1}});const local=r.exportDurableBundle(dir,{risk:1}),remote=r.exportDurableBundle(dir,{risk:2});
 assert.equal(r.restoreDurableBundle(dir,remote,local).reason,'same-registry-config-conflict');
 for(const mutate of [b=>b.registry.entries.push(b.registry.entries[0]),b=>b.revision++,b=>b.registry.entries[0].status='invalid']){
  const b=JSON.parse(JSON.stringify(local));mutate(b);const {checksum,...body}=b;b.checksum=r.fingerprint(body);assert.equal(r.verifyBundle(b),false);
 }
});
test('v15 checkpoint order recovery keeps partial quantities, never reopens closed orders and blocks external submit',()=>{
 const {restoreCheckpointOrders}=require('../backend/services/modelRegistry');const old=[{id:'closed',status:'closed',quantity:1},{id:'newer',quantity:2,updatedAt:'2026-10-08'}];const incoming=[{id:'closed',quantity:1},{id:'newer',quantity:1,updatedAt:'2026-01-01'},{id:'partial',mode:'paper',quantity:1,positionLifecycle2:{remainingQty:0.4}},{id:'uncertain',mode:'testnet',quantity:1,status:'pending'},{id:'journal',quantity:1}];
 const result=restoreCheckpointOrders(old,incoming,[{orderId:'journal'}]);assert.equal(result.find(x=>x.id==='closed').status,'closed');assert.equal(result.find(x=>x.id==='newer').quantity,2);assert.equal(result.find(x=>x.id==='partial').positionLifecycle2.remainingQty,0.4);assert.equal(result.find(x=>x.id==='uncertain').recoverySubmitAllowed,false);assert.ok(!result.find(x=>x.id==='journal'));
 assert.match(source,/checkpoint-checksum-mismatch/);assert.match(source,/RESTART_RECONCILIATION_REQUIRED/);
});
test('v15 strict durable read distinguishes an unavailable database from a proven empty table',async()=>{
 const start=source.indexOf('async function supabaseSelectById('),end=source.indexOf('\n}',start)+2;
 const context={supabaseHeaders:()=>({}),process:{env:{SUPABASE_URL:'https://isolated.invalid'}},timeoutSignal:()=>({cancel:()=>{}}),CONTINUITY_CHECKPOINT_REMOTE_TIMEOUT_MS:1000,fetch:async()=>({ok:false,status:503}),markSupabaseRead:()=>{}};
 const fn=vm.runInNewContext('('+source.slice(start,end)+')',context);await assert.rejects(fn('state','one',{strict:true}),/503/);assert.equal((await fn('state','one')).length,0);
});
function v15Quotes(n=400){return Array.from({length:n},(_,i)=>({timeMs:Date.parse('2026-05-01')+i*10000,venueKey:'binance',symbol:'BTC/USDT',marketSourceVenue:'binance',source:'live_public',bid:100+Math.sin(i/8)*2+i*0.01,ask:100.05+Math.sin(i/8)*2+i*0.01}));}
test('v15 counterfactual replay generates new entries/exits, pays costs and reports unclosed positions',()=>{
 const {replayEntryExit}=require('../backend/services/continuousRetraining');const q=v15Quotes(),policy={family:'momentum',lookback:6,threshold:0.001,stopLoss:0.005,takeProfit:0.008,holdMs:60000};
 const a=replayEntryExit(q,policy,{feeRate:0,slippageRate:0}),b=replayEntryExit(q,policy,{feeRate:0.005,slippageRate:0});assert.ok(a.trades.length>0);assert.equal(a.trades.length,b.trades.length);assert.ok(b.metrics.netPnl<a.metrics.netPnl);
 const other=replayEntryExit(q,{...policy,family:'mean-reversion'});assert.notDeepEqual(a.decisions,other.decisions);assert.ok(a.decisions.every(d=>d.observedThrough<d.timeMs));assert.ok(a.trades.every(t=>Date.parse(t.openedAt)>a.decisions.find(d=>d.timeMs<Date.parse(t.openedAt)).timeMs));assert.equal(a.tradingEvidence,false);assert.ok(a.trades.every(t=>!t.verified));
 const prefix=replayEntryExit(q.slice(0,70),policy);assert.deepEqual(a.decisions.filter(d=>d.index<70),prefix.decisions);
 assert.throws(()=>replayEntryExit(q,{family:'unknown'}),/UNSUPPORTED/);
});
test('v15 train-only entry exit family search freezes winner before untouched holdouts',async()=>{
 const {searchEntryExitPolicies,prepareStrategyReplayInWorker}=require('../backend/services/continuousRetraining');const q=v15Quotes(),scope={venue:'binance',symbol:'BTC/USDT'},a=searchEntryExitPolicies(q,scope);
 const changed=q.map((x,i)=>i>=280?{...x,bid:x.bid*2,ask:x.ask*2}:x),b=searchEntryExitPolicies(changed,scope);assert.equal(a.skipped,false);assert.equal(a.trials.length,9);assert.equal(a.winner.policyFingerprint,b.winner.policyFingerprint);assert.equal(a.tradingEvidence,false);assert.equal(a.liveAuthority,false);assert.ok(a.split.validation>20);
 const worker=await prepareStrategyReplayInWorker(q,scope);assert.deepEqual(worker,a);
 assert.equal(searchEntryExitPolicies(q.map(x=>({...x,source:'simulated_fallback'})),scope).reason,'insufficient-own-public-quotes');assert.equal(searchEntryExitPolicies(q,{...scope,venue:'bybit'}).rows,0);
});
test('v15 damaged checkpoint is rejected before changing capital, journal or orders',()=>{
 const start=source.indexOf('function applyContinuityCheckpoint('),end=source.indexOf('\n}',start)+2;
 const fn=vm.runInNewContext('('+source.slice(start,end)+')',{modelFingerprint:require('../backend/services/modelRegistry').fingerprint});
 assert.equal(fn({schemaVersion:2,checksum:'broken',capital:{activeTradingCapital:999999}}).reason,'checkpoint-checksum-mismatch');
});

test('v15 quote replay stops valuation on a data gap and never calls it forward proof',()=>{
 const {replayEntryExit}=require('../backend/services/continuousRetraining');const quotes=v15Quotes(50);for(let i=20;i<quotes.length;i++)quotes[i].timeMs+=3600000;
 const out=replayEntryExit(quotes,{family:'momentum',lookback:3,threshold:0.0001,stopLoss:0.9,takeProfit:0.9,holdMs:3600000});
 assert.equal(out.openPosition.dataGap,true);assert.equal(out.valuationTrusted,false);assert.equal(out.unrealizedNetPnl,null);assert.equal(out.markedNetPnl,null);assert.equal(out.tradingEvidence,false);
});

// V16 fixtures exercise production paper code in disposable directories; these
// quotes are test inputs, never evidence of a real provider connection or profit.
function v16Fixture(){
  const registry=require('../backend/services/modelRegistry');
  const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'nexus-v16-test-'));
  const at=Date.now()-300000,scope={venue:'binance',symbol:'BTC/USDT'};
  const report={ok:true,selectionSource:'train-only',scope,costs:{notionalUsd:25,feeRate:.001,slippageRate:.0002,minNotional:5,maxGapMs:60000},datasetFingerprint:registry.fingerprint({fixture:at}),winner:{policy:{family:'momentum',lookback:3,threshold:.001,stopLoss:.005,takeProfit:.008,holdMs:1000},metrics:{}},validation:{metrics:{}},test:{metrics:{}},split:{holdoutEndAt:at-60000,embargoMs:0}};
  registry.registerPaperStrategy(root,report,'test-version');
  const quote=(i,price=100+i)=>({timeMs:at+i*1000,bid:price,ask:price+.01,quoteObserved:true,source:'live_public',venueKey:'binance',marketSourceVenue:'binance',symbol:'BTC/USDT'});
  return {root,at,registry,report,quote,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('v16 incremental interpreter equals shared replay, next-quote entry and fees',()=>{
  const {advanceEntryExit,replayEntryExit}=require('../backend/services/continuousRetraining');const f=v16Fixture();
  try{let state;const rows=Array.from({length:20},(_,i)=>f.quote(i));const trades=[];for(const q of rows){const x=advanceEntryExit(state,q,f.report.winner.policy,f.report.costs);state=x.state;if(x.trade)trades.push(x.trade);}
    const replay=replayEntryExit(rows,f.report.winner.policy,f.report.costs);assert.deepEqual(trades,replay.trades);assert.ok(trades.length>0);assert.ok(trades[0].fee>0);assert.ok(Date.parse(trades[0].openedAt)>replay.decisions[0].timeMs);
    for(const t of trades)assert.ok(Math.abs(t.netPnl-(t.grossPnl-t.fee))<1e-10);
  }finally{f.cleanup();}
});
test('v16 paper entry close journal forward and restart in a different OS process',()=>{
  const f=v16Fixture();try{
    for(let i=0;i<=4;i++)f.registry.paperStrategyTick(f.root,[f.quote(i)],{nowMs:f.at+i*1000});
    const before=f.registry.readRegistry(f.root).entries[0];assert.ok(before.paperRuntime.state.position);
    const child=require('node:child_process').spawnSync(process.execPath,['-e',`const r=require(process.argv[1]);const q=JSON.parse(process.argv[3]);console.log(JSON.stringify(r.paperStrategyTick(process.argv[2],[q],{nowMs:q.timeMs})));`,require.resolve('../backend/services/modelRegistry'),f.root,JSON.stringify(f.quote(5))],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);const entry=f.registry.readRegistry(f.root).entries[0];assert.equal(entry.paperRuntime.trades.length,1);assert.equal(entry.prospectiveEvidence.rows,1);assert.equal(entry.paperRuntime.trades[0].experimentId,entry.id);assert.equal(entry.paperRuntime.trades[0].configFingerprint,entry.configFingerprint);assert.ok(Math.abs(entry.paperRuntime.equityUsd-250-entry.paperRuntime.realizedNetPnl)<1e-10);
    f.registry.paperStrategyTick(f.root,[f.quote(5)],{nowMs:f.at+5000});assert.equal(f.registry.readRegistry(f.root).entries[0].paperRuntime.trades.length,1);
  }finally{f.cleanup();}
});
test('v16 paper kill switch, stale, cross-venue, synthetic and holdout quotes cannot enter',()=>{
  const f=v16Fixture();try{
    const original=f.registry.readRegistry(f.root).entries[0].paperRuntime.state;
    f.registry.paperStrategyTick(f.root,[f.quote(0)],{nowMs:f.at,blockedReason:'kill-switch-or-emergency'});
    for(const q of [{...f.quote(1),venueKey:'bybit'},{...f.quote(1),marketSourceVenue:'bybit'},{...f.quote(1),synthetic:true},{...f.quote(1),quoteObserved:false},f.quote(-100)])f.registry.paperStrategyTick(f.root,[q],{nowMs:f.at+1000});
    f.registry.paperStrategyTick(f.root,[f.quote(2)],{nowMs:f.at+100000});
    assert.deepEqual(f.registry.readRegistry(f.root).entries[0].paperRuntime.state,original);
  }finally{f.cleanup();}
});
test('v16 paper configuration mutation and corrupt registry fail closed',()=>{
  const f=v16Fixture();try{
    const r=f.registry.readRegistry(f.root);r.entries[0].artifact.policy.takeProfit=.00001;f.registry.writeRegistry(f.root,r);
    assert.throws(()=>f.registry.paperStrategyTick(f.root,[f.quote(1)],{nowMs:f.at+1000}),/INTEGRITY/);
    fs.writeFileSync(path.join(f.root,'storage/model_registry_v2.json'),'{');assert.throws(()=>f.registry.readRegistry(f.root),/READ_FAILED/);
  }finally{f.cleanup();}
});
test('v16 checksum bundle preserves open paper state, journals and exact config after local deletion',()=>{
  const f=v16Fixture();try{
    for(let i=0;i<=4;i++)f.registry.paperStrategyTick(f.root,[f.quote(i)],{nowMs:f.at+i*1000});
    const bundle=f.registry.exportDurableBundle(f.root,{mode:'paper'}),expected=bundle.registry.entries[0].paperRuntime;
    fs.unlinkSync(path.join(f.root,'storage/model_registry_v2.json'));assert.equal(f.registry.restoreDurableBundle(f.root,bundle).ok,true);
    assert.deepEqual(f.registry.readRegistry(f.root).entries[0].paperRuntime,expected);
    f.registry.paperStrategyTick(f.root,[f.quote(5)],{nowMs:f.at+5000});assert.equal(f.registry.readRegistry(f.root).entries[0].paperRuntime.trades.length,1);
  }finally{f.cleanup();}
});
test('v16 a data-gap protective close is journalled but cannot become verified forward proof',()=>{
  const f=v16Fixture();try{
    for(let i=0;i<=4;i++)f.registry.paperStrategyTick(f.root,[f.quote(i)],{nowMs:f.at+i*1000});
    f.registry.paperStrategyTick(f.root,[f.quote(100)],{nowMs:f.at+100000});
    const e=f.registry.readRegistry(f.root).entries[0];assert.equal(e.paperRuntime.trades.length,1);assert.equal(e.paperRuntime.trades[0].verified,false);assert.equal(e.prospectiveEvidence.rows,0);
  }finally{f.cleanup();}
});
test('v16 dense completed own-source candles expose patterns without score or order authority',()=>{
  const {detectOwnQuotePatterns}=require('../backend/services/ensembleAI'),f=v16Fixture();try{
    const minute=Math.floor(f.at/60000)*60000;const rows=[0,20,40,55].map((sec,i)=>({...f.quote(i),timeMs:minute+sec*1000,bid:[100,102,98,100][i],ask:[100,102,98,100][i]+.01}));
    const result=detectOwnQuotePatterns(rows,f.report.scope,minute+60000);assert.equal(result.available,true);assert.equal(result.patterns[0].name,'doji');assert.equal(result.scoreAdjustment,0);assert.equal(result.backtestValidated,false);
    assert.equal(detectOwnQuotePatterns(rows,{venue:'bybit',symbol:'BTC/USDT'},minute+60000).available,false);assert.equal(detectOwnQuotePatterns(rows,f.report.scope,minute+30000).available,false);
  }finally{f.cleanup();}
});
test('v16 reference benchmark separates cost-aware net PnL from own trading evidence',()=>{
  const {ownBuyHoldBenchmark}=require('../backend/services/ensembleAI'),f=v16Fixture();try{
    const rows=[f.quote(0),f.quote(1)],r=ownBuyHoldBenchmark(rows,f.report.scope);assert.equal(r.tradingEvidence,false);assert.equal(r.verified,false);assert.equal(r.accountScope,'reference-only');
    assert.ok(r.netPnl<ownBuyHoldBenchmark(rows,f.report.scope,{feeRate:0,slippageRate:0}).netPnl);assert.equal(ownBuyHoldBenchmark(rows,{venue:'bybit'}).available,false);
  }finally{f.cleanup();}
});
test('v16 optional Redis REST cache checks TTL checksum errors and keeps execution authority separate',async()=>{
  const {RedisRestHotCache}=require('../backend/services/modelRegistry');let stored=null,at=1000;const calls=[];
  const cache=new RedisRestHotCache({url:'https://fixture.invalid',token:'fixture-token',clock:()=>at,fetcher:async(url,opt)=>{const args=JSON.parse(opt.body);calls.push(args);if(args[0]==='SET'){stored=args[2];return {ok:true,json:async()=>({result:'OK'})};}return {ok:true,json:async()=>({result:stored})};}});
  await cache.put('paper-strategies',{closed:1},2);assert.deepEqual(calls[0].slice(-2),['EX',2]);assert.deepEqual(await cache.get('paper-strategies'),{closed:1});at=3000;assert.equal(await cache.get('paper-strategies'),null);
  const bad=JSON.parse(stored);bad.payload.closed=9;stored=JSON.stringify(bad);await assert.rejects(cache.get('paper-strategies'),/CORRUPT/);
  await assert.rejects(new RedisRestHotCache().get('x'),/NOT_CONFIGURED/);assert.throws(()=>new RedisRestHotCache({url:'http://fixture.invalid',token:'x'}),/HTTPS/);
});
test('v16 private artifact archive is immutable hash addressed and verifies readback before success',async()=>{
  const {SupabaseArtifactArchive}=require('../backend/services/modelRegistry'),f=v16Fixture();let content=null;try{
    const bundle=f.registry.exportDurableBundle(f.root,{mode:'paper'}),calls=[];
    const archive=new SupabaseArtifactArchive({url:'https://fixture.invalid',key:'fixture-secret',bucket:'nexus-models',fetcher:async(url,opt)=>{calls.push({url,method:opt.method});if(opt.method==='POST'){assert.equal(opt.headers['x-upsert'],'false');const existed=content!==null;content=opt.body;return {ok:!existed,status:existed?400:200};}return {ok:true,text:async()=>content};}});
    const saved=await archive.save(bundle);assert.equal(saved.verified,true);assert.ok(saved.uri.endsWith(saved.hash+'.json'));assert.deepEqual(await archive.read(saved.hash),bundle);assert.equal((await archive.save(bundle)).hash,saved.hash);
    content=JSON.stringify({...bundle,revision:999});await assert.rejects(archive.read(saved.hash),/HASH_OR_BUNDLE/);
    assert.ok(calls.some(c=>c.url.includes('/object/authenticated/')));assert.equal(JSON.stringify(saved).includes('fixture-secret'),false);
    const dangerous=f.registry.exportDurableBundle(f.root,{apiKey:'not-a-real-secret'});await assert.rejects(archive.save(dangerous),/SECRET_FIELD/);
  }finally{f.cleanup();}
});
test('v16 allocation audit distinguishes actual budget deltas from recommendations without transfers',()=>{
  const {allocationAudit}=require('../backend/services/metaSupervisor2');const prev=[{venue:'binance',currentRiskBudgetUsd:10,recommendedRiskSharePct:50}],next=[{venue:'binance',currentRiskBudgetUsd:8,recommendedRiskSharePct:40,allocationReason:'de-rated-learning-budget',score:30,executionEligible:false}];
  const rows=allocationAudit(prev,next,'loss-guard','2026-10-09T14:00:00Z');assert.equal(rows.length,2);assert.equal(rows[0].delta,-2);assert.equal(rows[0].authority,'observed-risk-budget-change');assert.equal(rows[1].authority,'recommendation-only');assert.ok(rows.every(r=>r.transferAuthority==='none' && r.reason==='loss-guard'));assert.deepEqual(allocationAudit(next,next),[]);
});
test('v16 frontend cache keys and startup title match the actual release',()=>{
  const root=path.join(__dirname,'..'),v=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')).version;
  const html=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8'),app=fs.readFileSync(path.join(root,'frontend/app.js'),'utf8');assert.ok(app.includes(`const FRONTEND_VERSION = '${v}'`));assert.ok(html.includes(`/app.js?v=${v}`));assert.ok(html.includes(`/style.css?v=${v}`));assert.ok(html.includes(`<title>NEXUS AI ${v}</title>`));
});
test('v16 monitoring snapshots bound journal payload while durable registry preserves all trades',()=>{
  const f=v16Fixture();try{const r=f.registry.readRegistry(f.root);r.entries[0].paperRuntime.trades=Array.from({length:100},(_,i)=>({id:'fixture-'+i,netPnl:i}));f.registry.writeRegistry(f.root,r);
    const snapshot=f.registry.registrySnapshot(f.root).entries[0].paperRuntime;assert.equal(snapshot.closedTradesCount,100);assert.equal(snapshot.recentTrades.length,10);assert.equal(snapshot.trades,undefined);assert.equal(snapshot.state.window,undefined);assert.equal(f.registry.readRegistry(f.root).entries[0].paperRuntime.trades.length,100);assert.equal(f.registry.exportDurableBundle(f.root).registry.entries[0].paperRuntime.trades.length,100);
  }finally{f.cleanup();}
});
test('v16 server paper scheduler respects restore locks, operator stop, kill, modes and overlap',async()=>{
  const start=source.indexOf('async function paperStrategyRuntimeTick('),end=source.indexOf('\n}',start)+2;assert.ok(start>0);
  for(const [patch,expected] of [[{renderRecovery:{recoveryLock:true}},'restart-restore-in-progress'],[{renderRecovery:{autoStartBlocked:true}},'restart-restore-in-progress'],[{autonomousSupervisor:{manualStop:true}},'operator-stop'],[{killSwitch:{active:true}},'kill-switch-or-emergency'],[{mode:'live'},'unsupported-mode-paper-experiment-blocked'],[{mode:'unknown'},'unsupported-mode-paper-experiment-blocked'],[{autopilot:false},'autopilot-disabled'],[{killSwitch:{active:false}},null]]){
    let seen='not-called';const context={dbReady:true,paperStrategyBusy:false,paperStrategyLastSearch:Date.now(),Date,ROOT:'/fixture',db:{autopilot:true,mode:'paper',marketSeriesHistory:[],...patch},asArray:x=>Array.isArray(x)?x:[],verifiedLearningTrades:()=>[],paperStrategyTick:(root,quotes,opts)=>{seen=opts.blockedReason;return {ok:true};},registrySnapshot:()=>({}),persistLearningState:async()=>{},optionalLearningInfrastructureTick:async()=>{},pushIncident:()=>{}};
    const fn=vm.runInNewContext('('+source.slice(start,end)+')',context);await fn();assert.equal(seen,expected);assert.equal(context.paperStrategyBusy,false);
    context.paperStrategyBusy=true;seen='not-called';await fn();assert.equal(seen,'not-called');
  }
});
