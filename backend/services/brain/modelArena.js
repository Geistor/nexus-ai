function arenaScores(ctx, symbol, features = {}, edge = {}) {
  const trend = Number(features.ema20 || 0) - Number(features.ema50 || 0);
  const rsi = Number(features.rsi || 50);
  const imbalance = Number(edge.orderbook?.imbalance || 0);
  const scores = {
    trend_model: Number((0.5 + Math.tanh(trend / Math.max(1, Number(features.price || 1))) * 0.25).toFixed(4)),
    mean_reversion_model: Number((0.5 + (rsi < 35 ? 0.18 : rsi > 65 ? -0.18 : 0)).toFixed(4)),
    microstructure_model: Number((0.5 + imbalance * 0.3).toFixed(4)),
    momentum_model: Number((0.5 + Math.min(0.2, Math.max(-0.2, (Number(features.volRatio || 1) - 1) * 0.15))).toFixed(4))
  };
  const winner = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0];
  return { scores, activeModel: winner[0], activeScore: Number(winner[1].toFixed(4)) };
}
module.exports = { arenaScores };
