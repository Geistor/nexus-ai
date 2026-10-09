function symbolScore(ctx, symbol, decision, features) {
  const hist = (ctx.state.closedTrades || []).filter(t => t.symbol === symbol).slice(0, 20);
  const avgPnl = hist.length ? hist.reduce((a, b) => a + Number(b.pnl || 0), 0) / hist.length : 0;
  const winRate = hist.length ? hist.filter(t => Number(t.pnl || 0) > 0).length / hist.length : 0.5;
  const confidence = Number(decision?.confidence || 0.5);
  const trend = Math.abs(Number(features?.ema20 || 0) - Number(features?.ema50 || 0)) / Math.max(1, Number(features?.price || 1));
  const volPenalty = Math.min(0.25, Number(features?.atr || 0) / Math.max(1, Number(features?.price || 1)));

  let score = confidence * 0.45 + winRate * 0.20 + Math.max(-0.1, Math.min(0.1, avgPnl / 100)) + Math.min(0.15, trend * 15) - volPenalty;
  return Math.max(0.10, Number(score.toFixed(4)));
}

function allocationMultiplier(ctx, symbol, decision, features) {
  const s = symbolScore(ctx, symbol, decision, features);
  // maps roughly to 0.5x - 1.35x
  return Math.max(0.50, Math.min(1.35, 0.35 + s));
}

module.exports = { allocationMultiplier, symbolScore };
