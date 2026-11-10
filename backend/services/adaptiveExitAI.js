'use strict';

function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, num(v, a))); }
function arr(v) { return Array.isArray(v) ? v : []; }
function venueOf(r = {}) { return String(r.requestedVenue || r.entryMarketVenue || r.marketVenue || r.venue || '').toLowerCase(); }
function symbolOf(r = {}) { return String(r.symbol || '').toUpperCase(); }
function sideOf(r = {}) { return String(r.side || '').toUpperCase(); }
function strategyOf(r = {}) { return String(r.agentStrategy || r.strategyFamily || r.strategy || '').trim().toLowerCase() || 'adaptive'; }
function regimeOf(r = {}) { return String(r.regime || r.marketRegime || r.features?.regime || 'unknown').trim().toLowerCase(); }
function ts(r = {}) { return Date.parse(r.closedAt || r.exitTime || r.time || r.created_at || '') || 0; }

const STRATEGY_PRIORS = {
  trend:            { tp: 1.18, sl: 0.96, min: 1.00, soft: 1.18, hard: 1.22, trailArm: 0.90, trailGiveback: 0.58 },
  momentum:         { tp: 1.10, sl: 0.94, min: 0.90, soft: 1.02, hard: 1.06, trailArm: 0.86, trailGiveback: 0.54 },
  breakout:         { tp: 1.16, sl: 0.98, min: 0.92, soft: 1.08, hard: 1.12, trailArm: 0.88, trailGiveback: 0.56 },
  'mean-reversion': { tp: 0.86, sl: 0.88, min: 0.82, soft: 0.78, hard: 0.72, trailArm: 0.74, trailGiveback: 0.42 },
  scalp:            { tp: 0.76, sl: 0.82, min: 0.72, soft: 0.64, hard: 0.58, trailArm: 0.68, trailGiveback: 0.36 },
  adaptive:         { tp: 1.00, sl: 1.00, min: 1.00, soft: 1.00, hard: 1.00, trailArm: 1.00, trailGiveback: 0.48 }
};

const REGIME_PRIORS = {
  'trend-up':   { tp: 1.08, sl: 0.97, hold: 1.12, trail: 1.06 },
  'trend-down': { tp: 1.08, sl: 0.97, hold: 1.12, trail: 1.06 },
  volatile:     { tp: 1.03, sl: 0.92, hold: 0.86, trail: 0.86 },
  ranging:      { tp: 0.88, sl: 0.90, hold: 0.76, trail: 0.82 },
  transition:   { tp: 0.94, sl: 0.91, hold: 0.82, trail: 0.88 },
  quiet:        { tp: 0.86, sl: 0.90, hold: 0.74, trail: 0.80 },
  unknown:      { tp: 1.00, sl: 1.00, hold: 1.00, trail: 1.00 }
};

function versionWeight(row = {}, currentVersion = '') {
  const v = String(row.strategyVersion || row.executionEpoch || '').trim();
  if (currentVersion && v === currentVersion) return 1;
  if (v.startsWith('v199_186-') || v === 'v199_186-shadow-strategy-lab-champion-challenger-regime-routing-core') return 0.99;
  if (v.startsWith('v199_185-') || v.startsWith('v199_185_')) return 0.96;
  if (v.startsWith('v199_184-')) return 0.92;
  if (/^v199_(17[7-9]|18[0-3])-/.test(v)) return 0.82;
  return 0.35;
}

function recencyWeight(index) {
  if (index < 20) return 1.0;
  if (index < 50) return 0.72;
  if (index < 100) return 0.46;
  return 0.20;
}

function evidenceStats(rows = [], filter = {}, currentVersion = '') {
  const exact = arr(rows).filter(r => {
    if (!Number.isFinite(Number(r.netPnl))) return false;
    if (filter.venue && venueOf(r) !== String(filter.venue).toLowerCase()) return false;
    if (filter.strategy && strategyOf(r) !== String(filter.strategy).toLowerCase()) return false;
    if (filter.regime && regimeOf(r) !== String(filter.regime).toLowerCase()) return false;
    if (filter.side && sideOf(r) !== String(filter.side).toUpperCase()) return false;
    return true;
  }).sort((a,b) => ts(b) - ts(a)).slice(0, 160);

  let w = 0, wins = 0, net = 0, grossWin = 0, grossLoss = 0, hold = 0, winningHold = 0, losingHold = 0, winningW = 0, losingW = 0;
  for (let i = 0; i < exact.length; i++) {
    const row = exact[i];
    const rw = recencyWeight(i) * versionWeight(row, currentVersion) * clamp(row.learningWeight ?? 1, 0.05, 1);
    const pnl = num(row.netPnl, 0);
    const h = Math.max(0, num(row.holdingMs, 0));
    w += rw;
    net += pnl * rw;
    hold += h * rw;
    if (pnl > 0) { wins += rw; grossWin += pnl * rw; winningHold += h * rw; winningW += rw; }
    else if (pnl < 0) { grossLoss += Math.abs(pnl) * rw; losingHold += h * rw; losingW += rw; }
  }
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 3 : 1;
  return {
    rawSamples: exact.length,
    effectiveSamples: Number(w.toFixed(3)),
    winRate: Number((w > 0 ? wins / w * 100 : 50).toFixed(2)),
    profitFactor: Number(pf.toFixed(3)),
    expectancyUsd: Number((w > 0 ? net / w : 0).toFixed(5)),
    netPnlUsd: Number(net.toFixed(4)),
    avgHoldMs: Math.round(w > 0 ? hold / w : 0),
    avgWinningHoldMs: Math.round(winningW > 0 ? winningHold / winningW : 0),
    avgLosingHoldMs: Math.round(losingW > 0 ? losingHold / losingW : 0),
    lastTradeAt: exact[0]?.closedAt || exact[0]?.time || null
  };
}

function chooseEvidence(rows = [], context = {}, currentVersion = '') {
  const exact = evidenceStats(rows, { venue: context.venue, strategy: context.strategy, regime: context.regime, side: context.side }, currentVersion);
  const strategyRegime = evidenceStats(rows, { venue: context.venue, strategy: context.strategy, regime: context.regime }, currentVersion);
  const strategyVenue = evidenceStats(rows, { venue: context.venue, strategy: context.strategy }, currentVersion);
  const venue = evidenceStats(rows, { venue: context.venue }, currentVersion);
  if (exact.effectiveSamples >= 6) return { scope: 'venue-strategy-regime-side', stats: exact };
  if (strategyRegime.effectiveSamples >= 7) return { scope: 'venue-strategy-regime', stats: strategyRegime };
  if (strategyVenue.effectiveSamples >= 10) return { scope: 'venue-strategy', stats: strategyVenue };
  return { scope: 'venue-prior', stats: venue };
}

function buildAdaptiveExitProfile(input = {}) {
  const baseTakeProfitPct = Math.max(0.01, num(input.baseTakeProfitPct, 0.35));
  const baseStopLossPct = Math.max(0.01, num(input.baseStopLossPct, 0.25));
  const baseMinHoldMs = Math.max(15000, num(input.baseMinHoldMs, 20000));
  const baseSoftHoldMs = Math.max(baseMinHoldMs, num(input.baseSoftHoldMs, 60000));
  const baseHardHoldMs = Math.max(baseSoftHoldMs + 30000, num(input.baseHardHoldMs, 180000));
  const costPct = Math.max(0.01, num(input.estimatedCostPct, 0.15));
  const strategy = String(input.strategy || 'adaptive').toLowerCase();
  const regime = String(input.regime || 'unknown').toLowerCase();
  const side = String(input.side || '').toUpperCase();
  const venue = String(input.venue || '').toLowerCase();
  const p = STRATEGY_PRIORS[strategy] || STRATEGY_PRIORS.adaptive;
  const rp = REGIME_PRIORS[regime] || REGIME_PRIORS.unknown;
  const evidence = chooseEvidence(input.verifiedTrades, { venue, strategy, regime, side }, input.currentVersion || '');
  const s = evidence.stats;
  const reliability = clamp(s.effectiveSamples / 22, 0, 1);

  // Positive evidence may let winners breathe. Negative evidence must reduce exposure faster;
  // it is never allowed to widen the stop materially or extend losers indefinitely.
  const quality = clamp((s.winRate - 50) / 50 * 0.35 + (clamp(s.profitFactor, 0, 3) - 1) * 0.34 + clamp(s.expectancyUsd * 10, -1, 1) * 0.31, -1, 1);
  const qualityBlend = quality * reliability;

  const tpMultiplier = clamp(p.tp * rp.tp * (1 + Math.max(-0.16, qualityBlend * 0.18)), 0.62, 1.42);
  const slMultiplier = clamp(p.sl * rp.sl * (1 + Math.min(0.04, qualityBlend * 0.03)), 0.62, 1.04);
  const holdMultiplier = clamp(p.hard * rp.hold * (1 + qualityBlend * 0.16), 0.48, 1.28);
  const softMultiplier = clamp(p.soft * rp.hold * (1 + qualityBlend * 0.10), 0.52, 1.22);
  const minMultiplier = clamp(p.min * (1 + Math.min(0.08, qualityBlend * 0.06)), 0.62, 1.10);

  const takeProfitPct = clamp(baseTakeProfitPct * tpMultiplier, Math.max(0.08, costPct * 1.10), 0.72);
  const stopLossPct = clamp(baseStopLossPct * slMultiplier, Math.max(0.06, costPct * 0.42), Math.min(0.36, baseStopLossPct * 1.04));
  const minHoldMs = Math.round(clamp(baseMinHoldMs * minMultiplier, 15000, 45000));
  const softHoldMs = Math.round(clamp(baseSoftHoldMs * softMultiplier, minHoldMs + 15000, 150000));
  const hardHoldMs = Math.round(clamp(baseHardHoldMs * holdMultiplier, softHoldMs + 30000, 300000));
  const trailingArmPct = Math.max(costPct * 1.22, takeProfitPct * clamp(p.trailArm * rp.trail, 0.48, 0.98));
  const trailingGivebackRatio = clamp(p.trailGiveback * (qualityBlend > 0 ? 1.05 : 0.90), 0.28, 0.68);

  const status = reliability >= 0.65 ? 'evidence-backed' : reliability >= 0.30 ? 'provisional' : 'prior-assisted';
  const confidence = Number(clamp(38 + reliability * 50 + Math.abs(qualityBlend) * 8, 38, 94).toFixed(1));
  return {
    enabled: true,
    version: 'v199_187',
    venue, strategy, regime, side,
    status, confidence,
    evidenceScope: evidence.scope,
    evidence: s,
    reliability: Number(reliability.toFixed(3)),
    quality: Number(quality.toFixed(3)),
    base: { takeProfitPct: baseTakeProfitPct, stopLossPct: baseStopLossPct, minHoldMs: baseMinHoldMs, softHoldMs: baseSoftHoldMs, hardHoldMs: baseHardHoldMs },
    takeProfitPct: Number(takeProfitPct.toFixed(4)),
    stopLossPct: Number(stopLossPct.toFixed(4)),
    minHoldMs,
    softHoldMs,
    hardHoldMs,
    trailingArmPct: Number(trailingArmPct.toFixed(4)),
    trailingGivebackRatio: Number(trailingGivebackRatio.toFixed(3)),
    policy: 'strategy-regime-venue-evidence-bounded-exit-optimization-no-stop-widening-beyond-4pct'
  };
}

function adaptiveExitDecision(input = {}) {
  const profile = input.profile || {};
  const holdingMs = Math.max(0, num(input.holdingMs, 0));
  const marketMovePct = num(input.marketMovePct, 0);
  const netPnl = num(input.netPnl, 0);
  const peakMovePct = Math.max(marketMovePct, num(input.peakMovePct, marketMovePct));
  const technical = input.technical || {};
  const side = String(input.side || '').toUpperCase();
  const minHoldMs = Math.max(15000, num(profile.minHoldMs, input.baseMinHoldMs || 20000));
  const softHoldMs = Math.max(minHoldMs, num(profile.softHoldMs, input.baseSoftHoldMs || 60000));
  const hardHoldMs = Math.max(softHoldMs + 30000, num(profile.hardHoldMs, input.baseHardHoldMs || 180000));
  const tp = Math.max(0.01, num(profile.takeProfitPct, input.baseTakeProfitPct || 0.35));
  const sl = Math.max(0.01, num(profile.stopLossPct, input.baseStopLossPct || 0.25));
  const trailArm = Math.max(0.01, num(profile.trailingArmPct, tp * 0.58));
  const giveback = clamp(profile.trailingGivebackRatio, 0.28, 0.68);
  const m = num(technical.momentumScore, 0);
  const support = side === 'BUY'
    ? m >= -5 && num(technical.positivePersistencePct, 0) >= 42 && num(technical.bullishAlignmentPct, 0) >= 44
    : m <= 5 && num(technical.negativePersistencePct, 0) >= 42 && num(technical.bearishAlignmentPct, 0) >= 44;
  const opposite = side === 'BUY'
    ? (m <= -22 && num(technical.negativePersistencePct, 0) >= 62)
    : (m >= 22 && num(technical.positivePersistencePct, 0) >= 62);

  if (marketMovePct >= tp && netPnl > 0) return { action: 'exit', reason: 'adaptive_take_profit', confidence: profile.confidence || 50 };
  if (marketMovePct <= -sl) return { action: 'exit', reason: 'adaptive_stop_loss', confidence: Math.max(70, profile.confidence || 50) };
  if (holdingMs >= minHoldMs && peakMovePct >= trailArm && netPnl > 0 && marketMovePct <= peakMovePct * (1 - giveback)) return { action: 'exit', reason: 'adaptive_trailing_profit_lock', confidence: profile.confidence || 50 };
  if (holdingMs >= minHoldMs && netPnl < 0 && !support && opposite) return { action: 'exit', reason: 'adaptive_thesis_failure', confidence: Math.max(68, profile.confidence || 50) };
  if (holdingMs >= softHoldMs && netPnl > 0 && !support) return { action: 'exit', reason: 'adaptive_momentum_fade_profit', confidence: profile.confidence || 50 };
  if (holdingMs >= hardHoldMs) return { action: 'exit', reason: 'adaptive_hard_time_exit', confidence: Math.max(60, profile.confidence || 50) };
  return { action: 'hold', reason: support ? 'adaptive_hold_thesis_supported' : 'adaptive_hold_within_limits', confidence: profile.confidence || 50 };
}

function summarizeAdaptiveExit(rows = [], profiles = {}, decisions = {}) {
  const p = Object.values(profiles || {});
  const d = decisions || {};
  const reasons = d.exitReasons || {};
  return {
    enabled: true,
    version: 'v199_187',
    status: p.some(x => x.status === 'evidence-backed') ? 'learning-active' : 'warming-up',
    activeProfiles: p.length,
    evidenceBackedProfiles: p.filter(x => x.status === 'evidence-backed').length,
    provisionalProfiles: p.filter(x => x.status === 'provisional').length,
    totalDecisions: num(d.totalDecisions, 0),
    adaptiveExits: num(d.adaptiveExits, 0),
    holdDecisions: num(d.holdDecisions, 0),
    exitReasons: reasons,
    recentProfiles: p.sort((a,b) => Date.parse(b.computedAt || 0) - Date.parse(a.computedAt || 0)).slice(0, 16),
    verifiedEvidenceRows: arr(rows).length,
    policy: 'learn-exit-not-entry-bounded-strategy-regime-venue-exit-ai'
  };
}

module.exports = { buildAdaptiveExitProfile, adaptiveExitDecision, evidenceStats, summarizeAdaptiveExit, versionWeight };
