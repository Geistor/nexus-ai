function scoreOrderbook(snapshot = {}) {
  const bidDepth = Number(snapshot.bidDepth || 0);
  const askDepth = Number(snapshot.askDepth || 0);
  const spreadBps = Number(snapshot.spreadBps || 0);
  const imbalance = (bidDepth - askDepth) / Math.max(1, bidDepth + askDepth);
  let signal = 'neutral';
  if (imbalance > 0.15 && spreadBps < 8) signal = 'buy_pressure';
  else if (imbalance < -0.15 && spreadBps < 8) signal = 'sell_pressure';
  else if (spreadBps > 20) signal = 'wide_spread_caution';
  return { signal, imbalance: Number(imbalance.toFixed(4)), spreadBps, confidence: Number(Math.max(0.3, Math.min(0.9, 0.5 + Math.abs(imbalance))).toFixed(2)) };
}
module.exports = { scoreOrderbook };
