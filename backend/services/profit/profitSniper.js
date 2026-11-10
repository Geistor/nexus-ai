function profitOpportunity(ctx, symbol, features = {}, edge = {}) {
  const volRatio = Number(features.volRatio || 1);
  const atr = Number(features.atr || 0);
  const price = Math.max(1, Number(features.price || features.close || 1));
  const spreadBps = Number(edge.orderbook?.spreadBps || 10);
  const imbalance = Number(edge.orderbook?.imbalance || 0);
  const fundingBias = String(edge.funding?.bias || 'neutral');
  let score = 0.45;
  score += Math.min(0.18, Math.max(0, (volRatio - 1) * 0.18));
  score += Math.min(0.12, (atr / price) * 6);
  score += spreadBps < 10 ? 0.08 : -0.06;
  score += imbalance > 0.15 ? 0.08 : imbalance < -0.15 ? 0.08 : 0;
  score += fundingBias !== 'neutral' ? 0.04 : 0;
  let mode = 'normal';
  if (score > 0.72) mode = 'sniper';
  else if (score < 0.48) mode = 'defensive';
  return { symbol, score: Number(Math.max(0.1, Math.min(0.95, score)).toFixed(2)), mode, expectedEdgeBps: Number((Math.max(0, score - 0.5) * 100).toFixed(2)) };
}
module.exports = { profitOpportunity };
