'use strict';

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, num(value, min))); }
function arr(value) { return Array.isArray(value) ? value : []; }
function venueOf(row = {}) {
  return String(row.requestedVenue || row.entryMarketVenue || row.marketVenue || row.venue || row.exchange || '').trim().toLowerCase();
}
function isOpenOrder(row = {}) {
  const status = String(row.status || row.fillState || '').toLowerCase();
  if (!status) return false;
  return !/(filled|closed|cancel|reject|quarantin|journal_saved|expired)/.test(status);
}
function tradeTime(row = {}) { return Date.parse(row.closedAt || row.time || row.created_at || '') || 0; }

function observedStablecoinBalance(sample) {
  if (!sample) return { available: null, equity: null, source: 'none' };
  if (!Array.isArray(sample) && typeof sample === 'object') {
    const stable = ['USDT', 'USDC', 'USD'];
    let direct = 0;
    let found = false;
    for (const key of stable) {
      if (Number.isFinite(Number(sample[key]))) { direct += Number(sample[key]); found = true; }
    }
    if (found) return { available: Number(direct.toFixed(4)), equity: Number(direct.toFixed(4)), source: 'staging-preview' };
  }
  const rows = arr(sample);
  let stableTotal = 0;
  let stableFound = false;
  let reportedEquity = null;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const candidate of [row.totalEquity, row.totalEq, row.totalWalletBalance, row.equityUsd]) {
      if (Number.isFinite(Number(candidate)) && Number(candidate) >= 0) {
        reportedEquity = Math.max(reportedEquity == null ? 0 : reportedEquity, Number(candidate));
      }
    }
    const asset = String(row.asset || row.coin || row.ccy || '').toUpperCase();
    if (['USDT', 'USDC', 'USD'].includes(asset)) {
      const value = num(row.free, 0) + num(row.locked, 0) || num(row.walletBalance, 0) || num(row.eq, 0) || num(row.balance, 0);
      if (value >= 0) { stableTotal += value; stableFound = true; }
    }
    for (const coin of arr(row.coin)) {
      const asset2 = String(coin.coin || coin.asset || coin.ccy || '').toUpperCase();
      if (!['USDT', 'USDC', 'USD'].includes(asset2)) continue;
      stableTotal += num(coin.walletBalance, num(coin.equity, num(coin.eq, num(coin.availableToWithdraw, 0))));
      stableFound = true;
    }
    for (const detail of arr(row.details)) {
      const asset3 = String(detail.ccy || detail.coin || detail.asset || '').toUpperCase();
      if (!['USDT', 'USDC', 'USD'].includes(asset3)) continue;
      stableTotal += num(detail.eq, num(detail.cashBal, num(detail.availEq, 0)));
      stableFound = true;
    }
  }
  return {
    available: stableFound ? Number(stableTotal.toFixed(4)) : null,
    equity: reportedEquity != null ? Number(reportedEquity.toFixed(4)) : (stableFound ? Number(stableTotal.toFixed(4)) : null),
    source: reportedEquity != null ? 'private-reported-equity' : stableFound ? 'private-stablecoin-balance' : 'unparsed-private-balance'
  };
}

function normalizeWeights(venues = [], weights = {}) {
  const valid = venues.map(v => String(v).toLowerCase());
  const raw = Object.fromEntries(valid.map(v => [v, Math.max(0, num(weights?.[v], 0))]));
  let total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) {
    for (const v of valid) raw[v] = valid.length ? 1 / valid.length : 0;
    total = 1;
  }
  return Object.fromEntries(valid.map(v => [v, Number((raw[v] / total).toFixed(6))]));
}

function summarizeTrades(rows = []) {
  const trades = arr(rows).slice().sort((a, b) => tradeTime(b) - tradeTime(a));
  const wins = trades.filter(t => num(t.netPnl, 0) > 0).length;
  const winPnl = trades.reduce((sum, t) => sum + Math.max(0, num(t.netPnl, 0)), 0);
  const lossPnl = trades.reduce((sum, t) => sum + Math.abs(Math.min(0, num(t.netPnl, 0))), 0);
  const netPnl = trades.reduce((sum, t) => sum + num(t.netPnl, 0), 0);
  let lossStreak = 0;
  for (const trade of trades) {
    if (num(trade.netPnl, 0) < 0) lossStreak += 1;
    else break;
  }
  return {
    trades: trades.length,
    wins,
    losses: Math.max(0, trades.length - wins),
    winRate: trades.length ? Number((wins / trades.length * 100).toFixed(1)) : null,
    profitFactor: Number((lossPnl > 0 ? winPnl / lossPnl : winPnl > 0 ? 99 : 0).toFixed(3)),
    netPnl: Number(netPnl.toFixed(4)),
    avgPnl: trades.length ? Number((netPnl / trades.length).toFixed(4)) : 0,
    lossStreak,
    lastTradeAt: trades[0]?.closedAt || trades[0]?.time || null
  };
}

function drawdownFromTrades(initialCapital, trades = []) {
  let equity = Math.max(0, num(initialCapital, 0));
  let peak = equity;
  let maxDrawdownUsd = 0;
  for (const row of arr(trades).slice().sort((a, b) => tradeTime(a) - tradeTime(b))) {
    equity += num(row.netPnl, 0);
    peak = Math.max(peak, equity);
    maxDrawdownUsd = Math.max(maxDrawdownUsd, peak - equity);
  }
  return {
    maxDrawdownUsd: Number(maxDrawdownUsd.toFixed(4)),
    maxDrawdownPct: peak > 0 ? Number((maxDrawdownUsd / peak * 100).toFixed(4)) : 0,
    endingEquity: Number(equity.toFixed(4))
  };
}

function buildVenueCapitalSupervisor(input = {}) {
  const venues = arr(input.venues).map(v => String(v).toLowerCase());
  const totalInitialCapital = Math.max(1, num(input.totalInitialCapital, 10000));
  const weights = normalizeWeights(venues, input.weights || {});
  const verifiedTrades = arr(input.verifiedTrades);
  const openOrders = arr(input.openOrders).filter(isOpenOrder);
  const currentStrategyVersion = String(input.currentStrategyVersion || '');
  const freshMarkets = input.freshMarkets || {};
  const observedBalances = input.observedBalances || {};
  const policy = {
    maxVenueExposurePct: clamp(input.policy?.maxVenueExposurePct ?? 70, 10, 100),
    softDrawdownPct: clamp(input.policy?.softDrawdownPct ?? 2.5, 0.25, 20),
    hardDrawdownPct: clamp(input.policy?.hardDrawdownPct ?? 6, 0.5, 35),
    softLossStreak: Math.max(1, Math.round(num(input.policy?.softLossStreak, 2))),
    hardLossStreak: Math.max(2, Math.round(num(input.policy?.hardLossStreak, 3))),
    minCapitalUsd: Math.max(1, num(input.policy?.minCapitalUsd, 10)),
    promoteMinTrades: Math.max(3, Math.round(num(input.policy?.promoteMinTrades, 6))),
    hardLossCooldownMs: Math.max(60000, Math.min(180000, num(input.policy?.hardLossCooldownMs, 120000))),
    discoveryIdleMs: Math.max(30000, Math.min(60000, num(input.policy?.discoveryIdleMs, 45000))),
    discoveryPositionSizePct: clamp(input.policy?.discoveryPositionSizePct ?? 0.02, 0.01, 0.04)
  };

  const rows = [];
  for (const venue of venues) {
    const venueTrades = verifiedTrades.filter(row => venueOf(row) === venue);
    const currentTrades = venueTrades.filter(row => String(row.strategyVersion || row.executionEpoch || '') === currentStrategyVersion);
    const perf = summarizeTrades(venueTrades);
    const current = summarizeTrades(currentTrades);
    const initialCapital = totalInitialCapital * num(weights[venue], venues.length ? 1 / venues.length : 0);
    const dd = drawdownFromTrades(initialCapital, venueTrades);
    const openExposureUsd = openOrders
      .filter(row => venueOf(row) === venue)
      .reduce((sum, row) => sum + Math.abs(num(row.quantity ?? row.qty ?? row.amount, 0) * num(row.entryPrice ?? row.price, 0)), 0);
    const equityUsd = Math.max(0, initialCapital + perf.netPnl);
    const availableCapitalUsd = Math.max(0, equityUsd - openExposureUsd);
    const freshness = freshMarkets?.[venue] || {};
    const freshMarketCount = Math.max(0, num(freshness.fresh, freshness.freshMarketCount || 0));
    const expectedMarketCount = Math.max(0, num(freshness.expected, freshness.expectedMarketCount || 0));
    const observed = observedBalances?.[venue] || { available: null, equity: null, source: 'none' };

    let mode = 'active';
    let reason = 'venue-healthy';
    let riskMultiplier = 1;
    const currentLastTradeMs = Date.parse(current.lastTradeAt || '');
    const currentLossAgeMs = Number.isFinite(currentLastTradeMs) ? Math.max(0, Date.now() - currentLastTradeMs) : Infinity;
    if (freshMarketCount <= 0) { mode = 'paused'; reason = 'no-own-venue-market'; riskMultiplier = 0; }
    else if (equityUsd < policy.minCapitalUsd) { mode = 'paused'; reason = 'venue-capital-depleted'; riskMultiplier = 0; }
    else if (dd.maxDrawdownPct >= policy.hardDrawdownPct) {
      mode = 'paused'; reason = 'venue-hard-drawdown'; riskMultiplier = 0;
    } else if (current.lossStreak >= policy.hardLossStreak && currentLossAgeMs < policy.hardLossCooldownMs) {
      mode = 'paused'; reason = 'venue-hard-loss-streak-cooldown'; riskMultiplier = 0;
    } else if (current.lossStreak >= policy.hardLossStreak) {
      // Autonomous recovery is time-based, not win-based: after the cool-off the venue may only
      // take an ordinary strict/protective signal at tiny risk. Learning probes remain blocked by
      // the strategy loss guard, so this cannot become forced exploration.
      mode = 'protective'; reason = 'venue-hard-loss-probation'; riskMultiplier = 0.12;
    } else if (dd.maxDrawdownPct >= policy.softDrawdownPct || current.lossStreak >= policy.softLossStreak || (current.trades >= 4 && current.profitFactor < 0.70)) {
      mode = 'protective'; reason = current.lossStreak >= policy.softLossStreak ? 'venue-loss-streak-protection' : dd.maxDrawdownPct >= policy.softDrawdownPct ? 'venue-drawdown-protection' : 'venue-profit-factor-protection'; riskMultiplier = 0.28;
    } else if (current.trades < 2 || (expectedMarketCount > 0 && freshMarketCount < expectedMarketCount)) {
      mode = 'cautious'; reason = current.trades < 2 ? 'venue-current-engine-warmup' : 'venue-market-partial'; riskMultiplier = 0.62;
    } else if (current.trades >= policy.promoteMinTrades && current.netPnl > 0 && current.profitFactor >= 1.25 && num(current.winRate, 0) >= 52) {
      mode = 'promoted'; reason = 'venue-positive-current-engine-evidence'; riskMultiplier = 1.12;
    }

    const exposureLimitUsd = Math.max(0, equityUsd * policy.maxVenueExposurePct / 100);
    const exposureRoomUsd = Math.max(0, exposureLimitUsd - openExposureUsd);
    const riskBudgetUsd = Math.max(0, Math.min(availableCapitalUsd, exposureRoomUsd) * riskMultiplier);
    const tradeAllowed = riskMultiplier > 0 && riskBudgetUsd >= policy.minCapitalUsd * 0.25;
    const currentEngineIdleMs = Number.isFinite(currentLastTradeMs) ? Math.max(0, Date.now() - currentLastTradeMs) : Infinity;
    // v199_177: soft-loss protection reduces discovery size/thresholds through the signal layer,
    // but it must not freeze the venue forever. Hard-loss cooldown still pauses the venue entirely.
    const discoveryBlockedByLoss = mode === 'paused';
    const discoveryRiskFactor = mode === 'protective' ? 0.35 : mode === 'cautious' ? 0.70 : 1;
    const discoveryAllowed = tradeAllowed
      && !discoveryBlockedByLoss
      && freshMarketCount > 0
      && currentEngineIdleMs >= policy.discoveryIdleMs;
    const discoveryNotionalUsd = discoveryAllowed
      ? Math.max(0, Math.min(riskBudgetUsd, availableCapitalUsd * (policy.discoveryPositionSizePct / 100) * discoveryRiskFactor))
      : 0;
    const discoveryStatus = !tradeAllowed ? 'venue-paused'
      : freshMarketCount <= 0 ? 'market-wait'
      : currentEngineIdleMs < policy.discoveryIdleMs ? 'idle-timer'
      : mode === 'protective' ? 'protective-ready'
      : 'ready';
    let score = 52;
    score += current.trades ? (num(current.winRate, 50) - 50) * 0.45 : 0;
    score += Math.min(16, Math.max(-16, (current.profitFactor - 1) * 16));
    score += Math.min(12, Math.max(-12, current.netPnl / Math.max(1, initialCapital) * 1000));
    score -= Math.min(24, dd.maxDrawdownPct * 3.0);
    score -= Math.min(18, current.lossStreak * 6);
    if (freshMarketCount > 0) score += 8;
    if (mode === 'paused') score = Math.min(score, 20);
    score = clamp(score, 0, 100);

    rows.push({
      venue,
      mode,
      reason,
      tradeAllowed,
      initialWeight: weights[venue],
      initialCapitalUsd: Number(initialCapital.toFixed(4)),
      equityUsd: Number(equityUsd.toFixed(4)),
      availableCapitalUsd: Number(availableCapitalUsd.toFixed(4)),
      openExposureUsd: Number(openExposureUsd.toFixed(4)),
      exposureLimitUsd: Number(exposureLimitUsd.toFixed(4)),
      riskBudgetUsd: Number(riskBudgetUsd.toFixed(4)),
      realizedPnlUsd: perf.netPnl,
      drawdownPct: dd.maxDrawdownPct,
      performance: perf,
      currentEngine: { ...current, lossAgeMs: Number.isFinite(currentLossAgeMs) ? currentLossAgeMs : null },
      market: { freshMarketCount, expectedMarketCount },
      observedExchangeBalance: observed,
      riskMultiplier: Number(riskMultiplier.toFixed(4)),
      score: Number(score.toFixed(1)),
      discovery: {
        allowed: discoveryAllowed,
        status: discoveryStatus,
        idleMs: Number.isFinite(currentEngineIdleMs) ? currentEngineIdleMs : null,
        idleRequiredMs: policy.discoveryIdleMs,
        positionSizePct: policy.discoveryPositionSizePct,
        maxNotionalUsd: Number(discoveryNotionalUsd.toFixed(4)),
        riskFactor: Number(discoveryRiskFactor.toFixed(3)),
        policy: 'paper-staging-continuous-venue-flow-positive-after-cost-live-edge-supervised-microorder'
      }
    });
  }

  const allocatable = rows.filter(row => row.tradeAllowed);
  const scoreTotal = allocatable.reduce((sum, row) => sum + Math.max(1, row.score) * Math.max(0.1, row.riskMultiplier), 0) || 1;
  for (const row of rows) {
    row.targetRiskShare = row.tradeAllowed
      ? Number(((Math.max(1, row.score) * Math.max(0.1, row.riskMultiplier)) / scoreTotal).toFixed(6))
      : 0;
    row.targetRiskSharePct = Number((row.targetRiskShare * 100).toFixed(2));
  }
  rows.sort((a, b) => b.score - a.score || b.riskBudgetUsd - a.riskBudgetUsd);

  const activeVenues = rows.filter(row => row.tradeAllowed).map(row => row.venue);
  const pausedVenues = rows.filter(row => !row.tradeAllowed).map(row => row.venue);
  return {
    enabled: input.enabled !== false,
    status: activeVenues.length ? 'supervising' : 'all-venues-protected',
    mode: String(input.mode || 'paper').toLowerCase(),
    totalInitialCapitalUsd: Number(totalInitialCapital.toFixed(4)),
    totalEquityUsd: Number(rows.reduce((sum, row) => sum + row.equityUsd, 0).toFixed(4)),
    totalAvailableCapitalUsd: Number(rows.reduce((sum, row) => sum + row.availableCapitalUsd, 0).toFixed(4)),
    totalOpenExposureUsd: Number(rows.reduce((sum, row) => sum + row.openExposureUsd, 0).toFixed(4)),
    totalRiskBudgetUsd: Number(rows.reduce((sum, row) => sum + row.riskBudgetUsd, 0).toFixed(4)),
    activeVenues,
    pausedVenues,
    venues: Object.fromEntries(rows.map(row => [row.venue, row])),
    ranking: rows.map(row => ({ venue: row.venue, score: row.score, mode: row.mode, targetRiskSharePct: row.targetRiskSharePct, riskBudgetUsd: row.riskBudgetUsd })),
    policy: {
      ...policy,
      capitalIsolation: 'strict-no-cross-venue-borrowing',
      realBalanceUse: 'read-only-observation-until-live-unlocked',
      transferPolicy: 'no-automatic-cross-exchange-transfer'
    },
    lastUpdatedAt: new Date().toISOString()
  };
}

module.exports = { buildVenueCapitalSupervisor, observedStablecoinBalance, normalizeWeights, summarizeTrades };
