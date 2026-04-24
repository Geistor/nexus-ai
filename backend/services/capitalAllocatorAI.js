function scoreSymbol(ctx, symbol, decision, features, regimeInfo) {
  const recent = (ctx.state.closedTrades || []).filter(t => t.symbol === symbol).slice(0, 20);
  const winRate = recent.length ? recent.filter(t => Number(t.pnl || 0) > 0).length / recent.length : 0.5;
  const avgPnl = recent.length ? recent.reduce((s, t) => s + Number(t.pnl || 0), 0) / recent.length : 0;
  const conf = Number(decision?.confidence || 0.5);
  const trend = Math.abs(Number(features?.ema20 || 0) - Number(features?.ema50 || 0)) / Math.max(1, Number(features?.price || 1));

  let score = 0.35 * conf + 0.2 * winRate + Math.max(-0.1, Math.min(0.1, avgPnl / 100)) + Math.min(0.15, trend * 10);
  if (regimeInfo?.regime === 'sideways') score -= 0.05;
  return Number(Math.max(0.1, Math.min(1.0, score)).toFixed(4));
}

function buildCapitalPlan(ctx, candidateMap = {}) {
  const rows = Object.entries(candidateMap).map(([symbol, item]) => ({
    symbol,
    score: scoreSymbol(ctx, symbol, item.decision, item.features, item.regimeInfo),
    regime: item.regimeInfo?.regime || 'unknown',
    strategy: item.strategyInfo?.strategy || 'balanced',
    confidence: Number(item.decision?.confidence || 0.5)
  }));

  const total = rows.reduce((s, r) => s + r.score, 0) || 1;
  return rows.sort((a, b) => b.score - a.score).map(r => ({
    ...r,
    allocationPct: Number((r.score / total).toFixed(4)),
    allocationLabel: `${(r.score / total * 100).toFixed(2)}%`
  }));
}

function allocationMultiplierFromPlan(plan, symbol) {
  const row = (plan || []).find(x => x.symbol === symbol);
  if (!row) return 1;
  const pct = Number(row.allocationPct || 0);
  return Number(Math.max(0.5, Math.min(1.75, 0.5 + pct * 3)).toFixed(2));
}

module.exports = { buildCapitalPlan, allocationMultiplierFromPlan };
