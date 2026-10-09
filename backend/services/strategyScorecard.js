'use strict';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, num(value, min))); }
function keyPart(value, fallback = 'UNKNOWN') {
  const text = String(value ?? '').trim();
  return text ? text.toUpperCase() : fallback;
}
function asArray(value) { return Array.isArray(value) ? value : []; }
function tradeTime(row = {}) {
  const raw = row.closedAt || row.time || row.updatedAt || row.created_at || row.createdAt || null;
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}
function closedTrade(row = {}) {
  const status = String(row.status || row.fillState || '').toLowerCase();
  return status === 'closed' || Boolean(row.closedAt) || row.exitPrice !== undefined || status === 'journal_saved';
}
function verifiedTrade(row = {}) {
  if (!row || !closedTrade(row)) return false;
  if (row.learningExcluded || row.journalExcluded || row.pnlExcluded || row.quarantined) return false;
  const integrity = String(row.integrityStatus || row.verificationStatus || row.reconciliationStatus || '').toLowerCase();
  if (/(failed|unverified|mismatch|quarantin|unknown-execution)/.test(integrity)) return false;
  if (row.reconciled === false || row.verified === false) return false;
  return Number.isFinite(Number(row.netPnl ?? row.pnl ?? row.realizedPnl));
}
function sourceMode(row = {}) {
  return keyPart(row.executionMode || row.mode || row.sourceMode || 'paper', 'PAPER');
}
function grossPnlOf(row = {}) {
  if (Number.isFinite(Number(row.grossPnl))) return num(row.grossPnl);
  const net = num(row.netPnl ?? row.pnl ?? row.realizedPnl);
  const fee = Math.abs(num(row.fee ?? row.fees));
  const slip = Math.abs(num(row.slippage ?? row.slippageCost));
  const funding = num(row.fundingCost ?? row.funding ?? row.fundingFee);
  return net + fee + slip + funding;
}
function netPnlOf(row = {}) {
  if (Number.isFinite(Number(row.netPnl))) return num(row.netPnl);
  if (Number.isFinite(Number(row.realizedPnl))) return num(row.realizedPnl);
  if (Number.isFinite(Number(row.pnl))) return num(row.pnl);
  const gross = num(row.grossPnl);
  return gross - Math.abs(num(row.fee ?? row.fees)) - Math.abs(num(row.slippage ?? row.slippageCost)) - num(row.fundingCost ?? row.funding ?? row.fundingFee);
}
function wilsonInterval(wins, total, z = 1.96) {
  if (!(total > 0)) return { lowerPct: null, upperPct: null, widthPct: null };
  const p = wins / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total) / denom;
  const lower = clamp(center - margin, 0, 1) * 100;
  const upper = clamp(center + margin, 0, 1) * 100;
  return { lowerPct: Number(lower.toFixed(1)), upperPct: Number(upper.toFixed(1)), widthPct: Number((upper - lower).toFixed(1)) };
}
function drawdownStats(rows = []) {
  const ordered = [...rows].sort((a, b) => tradeTime(a) - tradeTime(b));
  let equity = 0, peak = 0, maxDd = 0;
  for (const row of ordered) {
    equity += netPnlOf(row);
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }
  return {
    maxDrawdownUsd: Number(maxDd.toFixed(4)),
    maxDrawdownPctOfPeakPnl: peak > 0 ? Number((maxDd / peak * 100).toFixed(2)) : 0,
    endingNetPnl: Number(equity.toFixed(4))
  };
}
function recencyWeight(row, nowMs, halfLifeDays) {
  const ts = tradeTime(row);
  if (!ts) return 0.5;
  const ageDays = Math.max(0, nowMs - ts) / 86400000;
  return Math.pow(0.5, ageDays / Math.max(1, halfLifeDays));
}
function weightedMean(rows, selector, weightSelector) {
  let sum = 0, weight = 0;
  for (const row of rows) {
    const w = Math.max(0, num(weightSelector(row), 0));
    if (!w) continue;
    sum += num(selector(row)) * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : 0;
}
function freshness(rows = [], nowMs = Date.now()) {
  const times = rows.map(tradeTime).filter(Boolean).sort((a, b) => b - a);
  const last = times[0] || 0;
  const ageMinutes = last ? Math.max(0, nowMs - last) / 60000 : null;
  return {
    lastTradeAt: last ? new Date(last).toISOString() : null,
    lastAgeMinutes: ageMinutes == null ? null : Number(ageMinutes.toFixed(1)),
    stale24h: ageMinutes != null ? ageMinutes > 1440 : true,
    fresh1h: times.filter(t => nowMs - t <= 3600000).length,
    fresh6h: times.filter(t => nowMs - t <= 21600000).length,
    fresh24h: times.filter(t => nowMs - t <= 86400000).length
  };
}
function metricSummary(rows = [], minSamples = 8, options = {}) {
  const nowMs = num(options.nowMs, Date.now());
  const halfLifeDays = Math.max(1, num(options.halfLifeDays, 21));
  const trades = rows.length;
  const wins = rows.filter(r => netPnlOf(r) > 0).length;
  const losses = rows.filter(r => netPnlOf(r) < 0).length;
  const flats = Math.max(0, trades - wins - losses);
  const netPnl = rows.reduce((sum, r) => sum + netPnlOf(r), 0);
  const grossPnl = rows.reduce((sum, r) => sum + grossPnlOf(r), 0);
  const grossProfit = rows.reduce((sum, r) => sum + Math.max(0, netPnlOf(r)), 0);
  const grossLoss = rows.reduce((sum, r) => sum + Math.abs(Math.min(0, netPnlOf(r))), 0);
  const fees = rows.reduce((sum, r) => sum + Math.abs(num(r.fee ?? r.fees)), 0);
  const slippage = rows.reduce((sum, r) => sum + Math.abs(num(r.slippage ?? r.slippageCost)), 0);
  const funding = rows.reduce((sum, r) => sum + num(r.fundingCost ?? r.funding ?? r.fundingFee), 0);
  const totalCosts = fees + slippage + funding;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const expectancyUsd = trades ? netPnl / trades : 0;
  const winRate = trades ? wins / trades * 100 : null;
  const wilson = wilsonInterval(wins, trades);
  const effectiveSamples = rows.reduce((sum, row) => sum + recencyWeight(row, nowMs, halfLifeDays), 0);
  const recencyWeightedExpectancyUsd = weightedMean(rows, netPnlOf, row => recencyWeight(row, nowMs, halfLifeDays));
  const recencyWeightedWinRate = trades ? weightedMean(rows, row => netPnlOf(row) > 0 ? 100 : 0, row => recencyWeight(row, nowMs, halfLifeDays)) : null;
  const sampleReliability = Math.min(1, trades / Math.max(1, minSamples));
  const uncertaintyPenalty = wilson.widthPct == null ? 1 : clamp(1 - wilson.widthPct / 100, 0.15, 1);
  const reliability = clamp(sampleReliability * uncertaintyPenalty, 0, 1);
  const dd = drawdownStats(rows);
  const fresh = freshness(rows, nowMs);
  const pfComponent = Math.max(-25, Math.min(25, (Math.min(3, profitFactor) - 1) * 18));
  const wrComponent = winRate == null ? 0 : Math.max(-18, Math.min(18, (winRate - 50) * 0.32));
  const expComponent = Math.max(-24, Math.min(24, expectancyUsd * 80));
  const ddPenalty = Math.min(18, Math.max(0, dd.maxDrawdownUsd * 2));
  const freshnessPenalty = fresh.stale24h ? 8 : 0;
  const score = 50 + (pfComponent + wrComponent + expComponent - ddPenalty) * reliability - freshnessPenalty;
  const modes = {};
  for (const row of rows) modes[sourceMode(row)] = (modes[sourceMode(row)] || 0) + 1;
  return {
    trades, wins, losses, flats,
    winRate: winRate == null ? null : Number(winRate.toFixed(1)),
    winRateConfidence95: wilson,
    grossPnl: Number(grossPnl.toFixed(4)),
    netPnl: Number(netPnl.toFixed(4)),
    grossProfit: Number(grossProfit.toFixed(4)),
    grossLoss: Number(grossLoss.toFixed(4)),
    profitFactor: Number(Math.min(99, profitFactor).toFixed(3)),
    expectancyUsd: Number(expectancyUsd.toFixed(5)),
    recencyWeightedExpectancyUsd: Number(recencyWeightedExpectancyUsd.toFixed(5)),
    recencyWeightedWinRate: recencyWeightedWinRate == null ? null : Number(recencyWeightedWinRate.toFixed(1)),
    fees: Number(fees.toFixed(4)),
    slippage: Number(slippage.toFixed(4)),
    funding: Number(funding.toFixed(4)),
    totalCosts: Number(totalCosts.toFixed(4)),
    drawdown: dd,
    freshness: fresh,
    effectiveSamples: Number(effectiveSamples.toFixed(2)),
    reliability: Number(reliability.toFixed(3)),
    uncertainty: Number((1 - reliability).toFixed(3)),
    score: Number(clamp(score, 0, 100).toFixed(1)),
    sampleStatus: trades >= minSamples ? 'qualified' : 'warming-up',
    sourceModes: modes,
    lastTradeAt: fresh.lastTradeAt
  };
}
function groupRows(rows, descriptor, minSamples, options) {
  const map = new Map();
  for (const row of rows) {
    const parts = descriptor.parts.map(part => keyPart(part.value(row), part.fallback));
    const key = parts.join(' | ');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return Array.from(map.entries()).map(([key, values]) => ({
    key,
    dimensions: descriptor.parts.reduce((out, part, index) => {
      out[part.name] = key.split(' | ')[index];
      return out;
    }, {}),
    ...metricSummary(values, minSamples, options)
  }));
}
function chronologicalSplit(rows = [], validationFraction = 0.3) {
  const ordered = [...rows].sort((a, b) => tradeTime(a) - tradeTime(b));
  if (ordered.length < 2) return { train: ordered, validation: [] };
  const cut = Math.max(1, Math.min(ordered.length - 1, Math.floor(ordered.length * (1 - validationFraction))));
  return { train: ordered.slice(0, cut), validation: ordered.slice(cut) };
}
function buildWalkForward(rows = [], minSamples = 8, options = {}) {
  const folds = Math.max(2, Math.min(5, num(options.folds, 3)));
  const ordered = [...rows].sort((a, b) => tradeTime(a) - tradeTime(b));
  if (ordered.length < Math.max(minSamples * 2, folds * 3)) return { status: 'warming-up', folds: [], leakageGuard: 'chronological-only' };
  const foldRows = [];
  for (let i = 1; i <= folds; i++) {
    const trainEnd = Math.floor(ordered.length * i / (folds + 1));
    const validEnd = Math.floor(ordered.length * (i + 1) / (folds + 1));
    const train = ordered.slice(0, trainEnd);
    const validation = ordered.slice(trainEnd, validEnd);
    if (!train.length || !validation.length) continue;
    foldRows.push({
      fold: i,
      train: metricSummary(train, minSamples, options),
      validation: metricSummary(validation, minSamples, options),
      trainEndAt: new Date(tradeTime(train[train.length - 1])).toISOString(),
      validationStartAt: new Date(tradeTime(validation[0])).toISOString()
    });
  }
  const qualified = foldRows.filter(f => f.validation.trades >= Math.max(3, Math.floor(minSamples / 2)));
  const positive = qualified.filter(f => f.validation.expectancyUsd > 0 && f.validation.profitFactor >= 1).length;
  return {
    status: qualified.length ? (positive >= Math.ceil(qualified.length * 0.6) ? 'stable' : 'unstable') : 'warming-up',
    positiveValidationFolds: positive,
    qualifiedFolds: qualified.length,
    folds: foldRows,
    leakageGuard: 'strict-chronological-train-before-validation'
  };
}
function buildStrategyScorecard(trades = [], options = {}) {
  const minSamples = Math.max(3, num(options.minSamples, 8));
  const strategyVersion = String(options.strategyVersion || '').trim();
  const asOfMs = options.asOf ? Date.parse(options.asOf) : Date.now();
  const allowedModes = asArray(options.allowedModes).map(x => keyPart(x));
  const all = asArray(trades);
  const filtered = all.filter(row => {
    if (!verifiedTrade(row)) return false;
    const ts = tradeTime(row);
    if (ts && ts > asOfMs + 1000) return false;
    if (strategyVersion && row.strategyVersion && String(row.strategyVersion) !== strategyVersion) return false;
    if (allowedModes.length && !allowedModes.includes(sourceMode(row))) return false;
    return true;
  });
  const excluded = all.length - filtered.length;
  const metricOptions = { nowMs: asOfMs, halfLifeDays: options.halfLifeDays || 21 };
  const routeDescriptor = { parts: [
    { name: 'venue', value: r => r.requestedVenue || r.entryMarketVenue || r.marketVenue || r.venue, fallback: 'BINANCE' },
    { name: 'symbol', value: r => r.symbol, fallback: 'UNKNOWN' },
    { name: 'regime', value: r => r.regime || r.marketRegime, fallback: 'UNKNOWN' },
    { name: 'side', value: r => r.side, fallback: 'UNKNOWN' },
    { name: 'strategy', value: r => r.strategyKey || r.strategy || r.agentStrategy || r.strategyFamily, fallback: 'ADAPTIVE' }
  ] };
  const routes = groupRows(filtered, routeDescriptor, minSamples, metricOptions)
    .sort((a, b) => b.score - a.score || b.trades - a.trades);
  const qualified = routes.filter(r => r.trades >= minSamples && r.reliability >= 0.35);
  const bestRoutes = qualified.filter(r => r.expectancyUsd > 0 && r.profitFactor > 1 && (r.winRateConfidence95.lowerPct ?? 0) >= 25).slice(0, 12);
  const watchRoutes = qualified.filter(r => r.expectancyUsd <= 0 || r.profitFactor < 0.95)
    .sort((a, b) => a.score - b.score || b.trades - a.trades).slice(0, 12);
  const dimension = (name, selector) => groupRows(filtered, { parts: [{ name, value: selector, fallback: 'UNKNOWN' }] }, minSamples, metricOptions)
    .sort((a, b) => b.score - a.score || b.trades - a.trades);
  const overall = metricSummary(filtered, minSamples, metricOptions);
  const split = chronologicalSplit(filtered, num(options.validationFraction, 0.3));
  const walkForward = buildWalkForward(filtered, minSamples, metricOptions);
  return {
    ok: true,
    version: 'scorecard-2.0',
    authority: 'observe-only',
    policy: 'verified-reconciled-cost-aware-chronological-route-scorecard',
    strategyVersion: strategyVersion || null,
    generatedAt: new Date(asOfMs).toISOString(),
    reason: options.reason || 'snapshot',
    minSamples,
    totalInputTrades: all.length,
    totalDetailedTrades: filtered.length,
    excludedTrades: excluded,
    evidenceRules: {
      closedOnly: true,
      verifiedOnly: true,
      reconciledMismatchExcluded: true,
      futureDataExcluded: true,
      modeSeparated: true,
      leakageGuard: 'chronological-train-before-validation'
    },
    overall,
    chronologicalValidation: {
      train: metricSummary(split.train, minSamples, metricOptions),
      validation: metricSummary(split.validation, minSamples, metricOptions),
      trainEndAt: split.train.length ? new Date(tradeTime(split.train[split.train.length - 1])).toISOString() : null,
      validationStartAt: split.validation.length ? new Date(tradeTime(split.validation[0])).toISOString() : null
    },
    walkForward,
    routes,
    bestRoutes,
    watchRoutes,
    byVenue: dimension('venue', r => r.requestedVenue || r.entryMarketVenue || r.marketVenue || r.venue),
    bySymbol: dimension('symbol', r => r.symbol),
    byRegime: dimension('regime', r => r.regime || r.marketRegime),
    bySide: dimension('side', r => r.side),
    byStrategy: dimension('strategy', r => r.strategyKey || r.strategy || r.agentStrategy || r.strategyFamily),
    byMode: dimension('mode', sourceMode),
    note: filtered.length
      ? 'Strategy Scorecard 2.0: verified/reconciled closed trades, cost/funding, drawdown, recency, uncertainty and chronological validation. Observe-only.'
      : 'Még nincs használható verified/reconciled lezárt trade a Scorecard 2.0 számára.'
  };
}

module.exports = {
  buildStrategyScorecard,
  metricSummary,
  chronologicalSplit,
  buildWalkForward,
  verifiedTrade,
  netPnlOf,
  sourceMode
};
