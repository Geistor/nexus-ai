'use strict';
const {registryPromotionPolicy}=require('./modelRegistry');

function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, num(v, a))); }
function arr(v) { return Array.isArray(v) ? v : []; }
function venueOf(r = {}) { return String(r.requestedVenue || r.entryMarketVenue || r.marketVenue || r.venue || '').toLowerCase(); }
function symbolOf(r = {}) { return String(r.symbol || '').toUpperCase(); }
function sideOf(r = {}) { return String(r.side || '').toUpperCase(); }
function ts(r = {}) { return Date.parse(r.closedAt || r.settledAt || r.time || r.created_at || '') || 0; }
function strategyOf(r = {}) {
  return String(r.agentStrategy || r.strategyFamily || r.strategy || r.signalRouting?.agentStrategy || '').trim().toLowerCase() || 'legacy';
}

const STRATEGIES = ['trend', 'momentum', 'breakout', 'mean-reversion', 'scalp'];
const REGIME_PRIORS = {
  'trend-up': { trend: 10, momentum: 8, breakout: 6, scalp: 1, 'mean-reversion': -7 },
  'trend-down': { trend: 10, momentum: 8, breakout: 6, scalp: 1, 'mean-reversion': -7 },
  volatile: { breakout: 10, momentum: 6, scalp: 4, trend: 2, 'mean-reversion': -4 },
  ranging: { 'mean-reversion': 10, scalp: 7, momentum: -2, trend: -4, breakout: -3 },
  transition: { momentum: 6, scalp: 4, breakout: 3, trend: 2, 'mean-reversion': 1 },
  quiet: { 'mean-reversion': 7, trend: 3, scalp: 2, momentum: 0, breakout: -2 },
  unknown: { trend: 0, momentum: 0, breakout: 0, 'mean-reversion': 0, scalp: 0 }
};

function recencyWeight(index) {
  if (index < 20) return 1.0;
  if (index < 50) return 0.72;
  if (index < 100) return 0.46;
  return 0.20;
}

function performanceStats(rows = []) {
  const sorted = arr(rows).slice().sort((a,b) => ts(b)-ts(a));
  const pnls = sorted.map(r => num(r.netPnl, 0));
  const wins = pnls.filter(v => v > 0);
  const losses = pnls.filter(v => v < 0);
  const net = pnls.reduce((a,b) => a+b, 0);
  const grossWin = wins.reduce((a,b) => a+b, 0);
  const grossLoss = Math.abs(losses.reduce((a,b) => a+b, 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 3 : 1;
  const expectancy = pnls.length ? net / pnls.length : 0;
  let equity = 0, peak = 0, maxDd = 0;
  for (const pnl of pnls.slice().reverse()) {
    equity += pnl;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }
  let lossStreak = 0;
  for (const pnl of pnls) { if (pnl < 0) lossStreak += 1; else break; }
  return {
    trades: pnls.length,
    wins: wins.length,
    losses: losses.length,
    winRate: pnls.length ? Number((wins.length / pnls.length * 100).toFixed(2)) : null,
    netPnl: Number(net.toFixed(4)),
    expectancyUsd: Number(expectancy.toFixed(4)),
    profitFactor: Number(pf.toFixed(3)),
    maxDrawdownUsd: Number(maxDd.toFixed(4)),
    lossStreak,
    lastTradeAt: sorted[0]?.closedAt || sorted[0]?.time || null
  };
}

function weightedPerformance(rows = [], filter = {}) {
  const sorted = arr(rows).filter(r => {
    if (filter.venue && venueOf(r) !== String(filter.venue).toLowerCase()) return false;
    if (filter.symbol && symbolOf(r) !== String(filter.symbol).toUpperCase()) return false;
    if (filter.side && sideOf(r) !== String(filter.side).toUpperCase()) return false;
    if (filter.strategy && strategyOf(r) !== String(filter.strategy).toLowerCase()) return false;
    return true;
  }).sort((a,b) => ts(b)-ts(a));
  let w = 0, wins = 0, net = 0, grossWin = 0, grossLoss = 0;
  sorted.forEach((r, i) => {
    const rw = recencyWeight(i) * clamp(r.learningWeight ?? 1, 0.05, 1);
    const pnl = num(r.netPnl, 0);
    w += rw; net += pnl * rw;
    if (pnl > 0) { wins += rw; grossWin += pnl * rw; }
    if (pnl < 0) grossLoss += Math.abs(pnl) * rw;
  });
  const wr = w > 0 ? wins / w * 100 : 50;
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 3 : 1;
  return {
    rawTrades: sorted.length,
    effectiveSamples: Number(w.toFixed(3)),
    weightedWinRate: Number(wr.toFixed(2)),
    weightedNetPnl: Number(net.toFixed(4)),
    weightedExpectancyUsd: Number((w > 0 ? net / w : 0).toFixed(4)),
    profitFactor: Number(pf.toFixed(3)),
    lastTradeAt: sorted[0]?.closedAt || sorted[0]?.time || null
  };
}

function rollingWindows(rows = [], filter = {}) {
  const sorted = arr(rows).filter(r => {
    if (filter.venue && venueOf(r) !== String(filter.venue).toLowerCase()) return false;
    if (filter.symbol && symbolOf(r) !== String(filter.symbol).toUpperCase()) return false;
    if (filter.side && sideOf(r) !== String(filter.side).toUpperCase()) return false;
    if (filter.strategy && strategyOf(r) !== String(filter.strategy).toLowerCase()) return false;
    return true;
  }).sort((a,b) => ts(b)-ts(a));
  return {
    last20: performanceStats(sorted.slice(0,20)),
    last50: performanceStats(sorted.slice(0,50)),
    last100: performanceStats(sorted.slice(0,100)),
    all: performanceStats(sorted)
  };
}

function adaptiveCapitalSignal(rows = [], venue = '') {
  const weighted = weightedPerformance(rows, { venue });
  const windows = rollingWindows(rows, { venue });
  const w20 = windows.last20, w50 = windows.last50, w100 = windows.last100;
  const evidence = clamp(weighted.effectiveSamples / 18, 0, 1);
  const scoreWindow = (w, baseWeight) => {
    if (!w.trades) return 0;
    const wr = (num(w.winRate, 50) - 50) * 0.42;
    const pf = (clamp(w.profitFactor, 0, 3) - 1) * 18;
    const exp = clamp(w.expectancyUsd * 8, -16, 16);
    const streak = Math.min(12, num(w.lossStreak, 0) * 2.4);
    return baseWeight * (wr + pf + exp - streak);
  };
  const performanceScore = clamp(50 + scoreWindow(w20, 0.50) + scoreWindow(w50, 0.30) + scoreWindow(w100, 0.20), 0, 100);
  let multiplier = 0.62 + (performanceScore - 50) / 100;
  multiplier = 1 + (multiplier - 1) * evidence;
  if (w20.trades >= 5 && (w20.profitFactor < 0.75 || w20.lossStreak >= 4)) multiplier *= 0.72;
  if (w20.trades >= 8 && w20.profitFactor >= 1.45 && num(w20.expectancyUsd, 0) > 0) multiplier *= 1.10;
  if (w50.trades >= 12 && w50.profitFactor >= 1.25 && num(w50.expectancyUsd, 0) > 0) multiplier *= 1.06;
  multiplier = clamp(multiplier, 0.35, 1.32);
  const confidence = clamp(35 + evidence * 55, 35, 90);
  const state = performanceScore >= 68 && evidence >= 0.45 ? 'scale-up'
    : performanceScore >= 52 ? 'normal'
    : performanceScore >= 38 ? 'reduced'
    : 'protective';
  return {
    performanceScore: Number(performanceScore.toFixed(1)),
    evidence: Number(evidence.toFixed(3)),
    confidence: Number(confidence.toFixed(1)),
    multiplier: Number(multiplier.toFixed(3)),
    state,
    windows,
    weighted,
    policy: '20-50-100-window-net-expectancy-profit-factor-drawdown-aware'
  };
}

function inferMarketRegime(technical = {}, context = {}) {
  const m = num(technical.momentumScore, 0);
  const persistence = Math.max(num(technical.positivePersistencePct, 0), num(technical.negativePersistencePct, 0));
  const align = Math.max(num(technical.bullishAlignmentPct, 0), num(technical.bearishAlignmentPct, 0));
  const flips = num(technical.directionFlipPct, 50);
  const accel = Math.abs(num(technical.accelerationPct ?? technical.acceleration, 0));
  const volatility = String(context.volatility || technical.volatility || '').toLowerCase();
  if (volatility === 'high' || accel >= 0.18) return 'volatile';
  if (persistence >= 68 && align >= 66 && flips <= 34 && Math.abs(m) >= 10) return m >= 0 ? 'trend-up' : 'trend-down';
  if (flips >= 54 || (persistence <= 48 && Math.abs(m) < 12)) return 'ranging';
  if (volatility === 'low' && Math.abs(m) < 8) return 'quiet';
  return 'transition';
}


function inferRegimeTransition(technical = {}, previous = {}, context = {}) {
  const rawRegime = String(context.regimeOverride || inferMarketRegime(technical, context) || 'transition').toLowerCase();
  const prevEffective = String(previous.effectiveRegime || previous.regime || rawRegime).toLowerCase();
  const prevRaw = String(previous.rawRegime || prevEffective).toLowerCase();
  const sameCandidate = rawRegime === prevRaw;
  const candidateCount = sameCandidate ? Math.max(1, num(previous.candidateCount, 0) + 1) : 1;
  const persistence = Math.max(num(technical.positivePersistencePct, 0), num(technical.negativePersistencePct, 0));
  const alignment = Math.max(num(technical.bullishAlignmentPct, 0), num(technical.bearishAlignmentPct, 0));
  const flips = num(technical.directionFlipPct, 50);
  const momentum = Math.abs(num(technical.momentumScore, 0));
  const confidence = clamp(
    34 + persistence * 0.22 + alignment * 0.22 + momentum * 0.20 - Math.max(0, flips - 35) * 0.34,
    20, 96
  );
  const abrupt = rawRegime === 'volatile' || (momentum >= 42 && alignment >= 80 && persistence >= 78);
  const requiredConfirmations = abrupt ? 1 : rawRegime === 'transition' ? 3 : 2;
  let phase = 'stable';
  let effectiveRegime = rawRegime;
  if (previous && Object.keys(previous).length) {
    if (rawRegime === prevEffective) {
      phase = 'stable';
      effectiveRegime = rawRegime;
    } else if (candidateCount >= requiredConfirmations && confidence >= 52) {
      phase = 'confirmed-transition';
      effectiveRegime = rawRegime;
    } else {
      phase = flips >= 62 || rawRegime === 'transition' ? 'unstable-transition' : 'emerging-transition';
      effectiveRegime = prevEffective;
    }
  }
  let riskMultiplier = 1;
  if (phase === 'emerging-transition') riskMultiplier = 0.78;
  if (phase === 'unstable-transition') riskMultiplier = 0.62;
  if (phase === 'confirmed-transition') riskMultiplier = 0.88;
  if (rawRegime === 'volatile') riskMultiplier = Math.min(riskMultiplier, 0.66);
  const direction = rawRegime === prevEffective ? `${rawRegime}->${rawRegime}` : `${prevEffective}->${rawRegime}`;
  return {
    version: 'regime-transition-ai-1.0',
    rawRegime,
    previousRegime: prevEffective,
    effectiveRegime,
    phase,
    direction,
    candidateCount,
    requiredConfirmations,
    confidence: Number(confidence.toFixed(1)),
    riskMultiplier: Number(riskMultiplier.toFixed(3)),
    switchGuardActive: effectiveRegime !== rawRegime,
    policy: 'hysteresis-confirmed-transition-no-single-tick-regime-flip'
  };
}

function regimeBias(regime = 'unknown', strategy = '') {
  return num(REGIME_PRIORS[regime]?.[strategy], 0);
}

function suggestedStrategySide(strategy, technical = {}, fallbackSide = 'BUY') {
  const m = num(technical.momentumScore, 0);
  const rsi = num(technical.rsi, 50);
  const primary = ['BUY','SELL'].includes(String(fallbackSide).toUpperCase()) ? String(fallbackSide).toUpperCase() : (m >= 0 ? 'BUY' : 'SELL');
  if (strategy === 'mean-reversion') {
    if (rsi >= 56) return 'SELL';
    if (rsi <= 44) return 'BUY';
    return m >= 0 ? 'SELL' : 'BUY';
  }
  return primary;
}

function strategyCandidates(technical = {}, context = {}) {
  const m = num(technical.momentumScore, 0);
  const persistence = Math.max(num(technical.positivePersistencePct, 0), num(technical.negativePersistencePct, 0));
  const align = Math.max(num(technical.bullishAlignmentPct, 0), num(technical.bearishAlignmentPct, 0));
  const flips = num(technical.directionFlipPct, 50);
  const ema = Math.abs(num(technical.emaSpreadPct, 0));
  const accel = Math.abs(num(technical.accelerationPct, 0));
  const rsi = num(technical.rsi, 50);
  const costCoverage = num(context.costCoverageRatio, 0);
  const side = String(context.side || (m >= 0 ? 'BUY' : 'SELL')).toUpperCase();
  const directional = side === 'BUY' ? m : -m;
  const regime = String(context.regimeOverride || inferMarketRegime(technical, context));

  const rows = [
    { key: 'trend', score: 48 + directional * 0.55 + align * 0.22 + ema * 45 - flips * 0.12 },
    { key: 'momentum', score: 46 + directional * 0.72 + persistence * 0.20 + accel * 38 + costCoverage * 5 - flips * 0.09 },
    { key: 'breakout', score: 42 + directional * 0.58 + persistence * 0.24 + align * 0.18 + costCoverage * 7 + ema * 55 - flips * 0.08 },
    { key: 'mean-reversion', score: 44 + Math.max(0, Math.abs(rsi - 50) - 10) * 0.9 + Math.max(0, 55 - persistence) * 0.22 - Math.abs(directional) * 0.22 - ema * 25 },
    { key: 'scalp', score: 45 + costCoverage * 9 + Math.max(0, 60 - flips) * 0.16 + persistence * 0.12 - Math.max(0, num(technical.spreadPct, 0) - 0.08) * 80 }
  ];
  return rows.map(r => ({
    ...r,
    regime,
    regimeBias: regimeBias(regime, r.key),
    suggestedSide: suggestedStrategySide(r.key, technical, side),
    score: Number(clamp(r.score + regimeBias(regime, r.key), 0, 100).toFixed(2))
  })).sort((a,b) => b.score-a.score);
}

function shadowPerformance(rows = [], filter = {}) {
  const sorted = arr(rows).filter(r => {
    if (r.trainingOnly !== true && r.shadow !== true) return false;
    if (filter.venue && venueOf(r) !== String(filter.venue).toLowerCase()) return false;
    if (filter.symbol && symbolOf(r) !== String(filter.symbol).toUpperCase()) return false;
    if (filter.strategy && strategyOf(r) !== String(filter.strategy).toLowerCase()) return false;
    if (filter.regime && String(r.regime || 'unknown').toLowerCase() !== String(filter.regime).toLowerCase()) return false;
    return Number.isFinite(Number(r.netPct));
  }).sort((a,b) => ts(b)-ts(a));
  let w = 0, wins = 0, net = 0, grossWin = 0, grossLoss = 0;
  sorted.forEach((r, i) => {
    const rw = recencyWeight(i) * clamp(r.learningWeight ?? 1, 0.10, 1);
    const pnl = num(r.netPct, 0);
    w += rw; net += pnl * rw;
    if (pnl > 0) { wins += rw; grossWin += pnl * rw; }
    if (pnl < 0) grossLoss += Math.abs(pnl) * rw;
  });
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 3 : 1;
  return {
    rawSamples: sorted.length,
    effectiveSamples: Number(w.toFixed(3)),
    weightedWinRate: Number((w > 0 ? wins / w * 100 : 50).toFixed(2)),
    weightedNetPct: Number(net.toFixed(5)),
    weightedExpectancyPct: Number((w > 0 ? net / w : 0).toFixed(5)),
    profitFactor: Number(pf.toFixed(3)),
    lastSettledAt: sorted[0]?.settledAt || sorted[0]?.closedAt || sorted[0]?.time || null
  };
}

function strategyPerformanceRanking(rows = [], venue = '', shadowRows = [], regime = null) {
  return STRATEGIES.map(strategy => {
    const perf = weightedPerformance(rows, { venue, strategy });
    const windows = rollingWindows(rows, { venue, strategy });
    const evidence = clamp(perf.effectiveSamples / 10, 0, 1);
    const shadow = shadowPerformance(shadowRows, { venue, strategy, ...(regime ? { regime } : {}) });
    const shadowEvidence = clamp(shadow.effectiveSamples / 12, 0, 1);
    const verifiedScore = (perf.weightedWinRate - 50) * 0.42 + (perf.profitFactor - 1) * 18 + clamp(perf.weightedExpectancyUsd * 8, -18, 18);
    const shadowScore = (shadow.weightedWinRate - 50) * 0.34 + (shadow.profitFactor - 1) * 12 + clamp(shadow.weightedExpectancyPct * 90, -15, 15);
    const score = clamp(50 + verifiedScore * Math.max(0.25, evidence) + shadowScore * shadowEvidence * 0.75 + (regime ? regimeBias(regime, strategy) : 0), 0, 100);
    return { strategy, score: Number(score.toFixed(1)), evidence: Number(evidence.toFixed(3)), performance: perf, windows, shadow, shadowEvidence: Number(shadowEvidence.toFixed(3)), regime: regime || null };
  }).sort((a,b) => b.score - a.score);
}

function championChallenger(rows = [], shadowRows = [], venue = '', regime = 'unknown') {
  const ranking = strategyPerformanceRanking(rows, venue, shadowRows, regime);
  const champion = ranking[0] || null;
  const challenger = ranking[1] || null;
  const margin = champion && challenger ? Number((champion.score - challenger.score).toFixed(2)) : null;
  const championEvidence = champion ? Math.max(num(champion.evidence, 0), num(champion.shadowEvidence, 0)) : 0;
  return {
    regime,
    champion,
    challenger,
    margin,
    status: championEvidence >= 0.65 ? 'evidence-backed' : championEvidence >= 0.30 ? 'provisional' : 'warmup',
    policy: 'champion-default-controlled-positive-challenger-exploration'
  };
}

function buildVenueAgentDecision(input = {}) {
  const venue = String(input.venue || '').toLowerCase();
  const symbol = String(input.symbol || '').toUpperCase();
  const side = String(input.side || '').toUpperCase();
  const technical = input.technical || {};
  const transition = input.regimeTransition || inferRegimeTransition(technical, input.previousRegimeState || {}, { volatility: input.volatility, costCoverageRatio: input.costCoverageRatio });
  const regime = String(transition.effectiveRegime || inferMarketRegime(technical, { volatility: input.volatility, costCoverageRatio: input.costCoverageRatio }));
  const candidates = strategyCandidates(technical, { side, costCoverageRatio: input.costCoverageRatio, volatility: input.volatility, regimeOverride: regime });
  const trades = arr(input.verifiedTrades);
  const shadowRows = arr(input.shadowResults);
  const venuePerf = weightedPerformance(trades, { venue });
  const symbolPerf = weightedPerformance(trades, { venue, symbol });
  const capitalSignal = adaptiveCapitalSignal(trades, venue);
  const evaluated = candidates.map(c => {
    const perf = weightedPerformance(trades, { venue, symbol, side: c.suggestedSide, strategy: c.key });
    const evidence = Math.min(1, perf.effectiveSamples / 12);
    const shadow = shadowPerformance(shadowRows, { venue, strategy: c.key, regime });
    const shadowEvidence = Math.min(1, shadow.effectiveSamples / 12);
    const learningScore = (perf.weightedWinRate - 50) * 0.48 + (perf.profitFactor - 1) * 18 + Math.max(-14, Math.min(14, perf.weightedExpectancyUsd * 8));
    const shadowScore = (shadow.weightedWinRate - 50) * 0.32 + (shadow.profitFactor - 1) * 12 + clamp(shadow.weightedExpectancyPct * 100, -16, 16);
    // Execution keeps the production signal direction authoritative. A strategy whose
    // counterfactual direction disagrees with that signal may still learn in shadow,
    // but it cannot win the real order label just because old/shadow stats are strong.
    const sideConflictPenalty = c.suggestedSide !== side ? 18 : 0;
    const blended = c.score + learningScore * evidence + shadowScore * shadowEvidence * 0.80 - sideConflictPenalty;
    return { ...c, sideConflictPenalty, performance: perf, evidence: Number(evidence.toFixed(3)), shadowPerformance: shadow, shadowEvidence: Number(shadowEvidence.toFixed(3)), blendedScore: Number(clamp(blended, 0, 100).toFixed(2)) };
  }).sort((a,b) => b.blendedScore-a.blendedScore);
  // Real execution keeps the authoritative production direction. Strategies whose
  // counterfactual side disagrees remain fully available to the shadow lab, but may
  // not become the real champion/challenger for this signal.
  const executionEligible = evaluated.filter(row => row.suggestedSide === side);
  const executionPool = executionEligible.length ? executionEligible : evaluated;
  const champion = executionPool[0] || { key: 'trend', suggestedSide: side || 'BUY', blendedScore: 50, performance: weightedPerformance([]), shadowPerformance: shadowPerformance([]), shadowEvidence: 0, evidence: 0 };
  const challenger = executionPool[1] || champion;
  const margin = champion.blendedScore - challenger.blendedScore;
  const challengerPositive = num(challenger.shadowPerformance?.effectiveSamples, 0) >= 4
    && num(challenger.shadowPerformance?.weightedExpectancyPct, 0) > 0
    && num(challenger.shadowPerformance?.profitFactor, 0) >= 1.05;
  const explorationSlot = input.allowChallenger !== false && Number.isFinite(Number(input.explorationSeed)) && Math.abs(Math.trunc(Number(input.explorationSeed))) % 9 === 0;
  const useChallenger = explorationSlot && challengerPositive && margin <= 7.5 && num(challenger.blendedScore, 0) >= 50;
  const selected = useChallenger ? challenger : champion;
  const runnerUp = useChallenger ? champion : challenger;
  const confidenceMargin = Math.abs(selected.blendedScore - runnerUp.blendedScore);
  const confidence = clamp(45 + confidenceMargin * 1.2 + Math.max(0, selected.blendedScore - 55) * 0.55, 35, 95);
  const quality = clamp(
    0.31 * selected.blendedScore +
    0.20 * venuePerf.weightedWinRate +
    0.16 * symbolPerf.weightedWinRate +
    7 * Math.min(2.5, venuePerf.profitFactor) +
    4 * Math.min(2.5, symbolPerf.profitFactor) +
    0.18 * capitalSignal.performanceScore, 0, 100);
  let riskMultiplier = 0.72 + (quality - 50) / 100;
  if (venuePerf.effectiveSamples < 4) riskMultiplier *= 0.78;
  if (venuePerf.profitFactor < 0.75) riskMultiplier *= 0.55;
  if (venuePerf.weightedWinRate < 35 && venuePerf.effectiveSamples >= 6) riskMultiplier *= 0.55;
  if (quality >= 68 && venuePerf.profitFactor >= 1.15) riskMultiplier *= 1.10;
  if (useChallenger) riskMultiplier *= 0.55;
  riskMultiplier *= clamp(transition.riskMultiplier ?? 1, 0.55, 1);
  riskMultiplier = clamp(riskMultiplier, 0.18, 1.28);
  const registryChampion=input.registry?.champion;
  const promotionPolicy=registryPromotionPolicy(input.registry || {},{venue,mode:input.mode || 'paper',symbol,regime,side:side || selected.suggestedSide || 'BUY',strategy:selected.key});
  const registryQualified=promotionPolicy.riskIncreaseEligible;
  if(!registryQualified)riskMultiplier=Math.min(1,riskMultiplier);
  const mode = quality >= 70 ? 'promote' : quality >= 52 ? 'active' : quality >= 38 ? 'cautious' : 'shadow-first';
  return {
    venue, symbol, side: side || selected.suggestedSide || 'BUY',
    agentId: `venue-agent-${venue}`,
    regime,
    regimeTransition: transition,
    selectedStrategy: selected.key,
    selectedStrategyRole: useChallenger ? 'challenger-exploration' : 'champion',
    promotionPolicy,
    selectedStrategyScore: selected.blendedScore,
    strategyConfidence: Number(confidence.toFixed(1)),
    qualityScore: Number(quality.toFixed(1)),
    riskMultiplier: Number(riskMultiplier.toFixed(3)),
    adaptiveCapital: capitalSignal,
    adaptiveCapitalApplication: 'venue-risk-budget-only',
    mode,
    shadowRecommended: mode === 'shadow-first',
    venuePerformance: venuePerf,
    symbolPerformance: symbolPerf,
    strategies: evaluated,
    championChallenger: {
      champion: champion.key,
      championScore: champion.blendedScore,
      challenger: challenger.key,
      challengerScore: challenger.blendedScore,
      margin: Number(margin.toFixed(2)),
      challengerEligible: challengerPositive,
      challengerSelected: useChallenger,
      policy: 'deterministic-1-in-9-only-positive-shadow-challenger'
    },
    policy: 'venue-local-multi-strategy-competition-regime-routing-shadow-counterfactual-champion-challenger-adaptive-capital-supervised'
  };
}

function buildVenueAgentFleet(input = {}) {
  const venues = arr(input.venues);
  const trades = arr(input.verifiedTrades);
  const shadowRows = arr(input.shadowResults);
  const agents = {};
  for (const venue of venues) {
    const perf = weightedPerformance(trades, { venue });
    const adaptiveCapital = adaptiveCapitalSignal(trades, venue);
    const overallRanking = strategyPerformanceRanking(trades, venue, shadowRows, null);
    const topStrategy = overallRanking[0] || null;
    const byRegime = {};
    for (const regime of Object.keys(REGIME_PRIORS).filter(r => r !== 'unknown')) byRegime[regime] = championChallenger(trades, shadowRows, venue, regime);
    agents[venue] = {
      venue,
      agentId: `venue-agent-${venue}`,
      status: perf.effectiveSamples >= 6 || shadowRows.some(r => venueOf(r) === venue) ? 'learning-active' : 'warmup',
      performance: perf,
      adaptiveCapital,
      performanceScore: adaptiveCapital.performanceScore,
      capitalMultiplier: adaptiveCapital.multiplier,
      capitalState: adaptiveCapital.state,
      topStrategy: topStrategy?.strategy || null,
      topStrategyScore: topStrategy?.score ?? null,
      strategyRanking: overallRanking,
      championByRegime: byRegime,
      shadowSamples: shadowRows.filter(r => venueOf(r) === venue).length,
      capitalIsolation: 'strict-venue-local',
      lastUpdatedAt: new Date().toISOString()
    };
  }
  return {
    enabled: true,
    agents,
    weighting: { last20: 1, last50: 0.72, last100: 0.46, history: 0.20 },
    policy: 'recent-evidence-plus-counterfactual-shadow-regime-champion-challenger-adaptive-capital-by-venue',
    safeguards: { crossVenueBorrowing: false, automaticTransfers: false, multiplierBounds: [0.35, 1.32], shadowAffectsVerifiedPnl: false }
  };
}

module.exports = {
  STRATEGIES,
  buildVenueAgentDecision,
  buildVenueAgentFleet,
  weightedPerformance,
  rollingWindows,
  adaptiveCapitalSignal,
  strategyCandidates,
  strategyPerformanceRanking,
  inferMarketRegime,
  inferRegimeTransition,
  suggestedStrategySide,
  shadowPerformance,
  championChallenger
};
