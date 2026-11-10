function liquidityExecutionProfile(edge = {}) {
  const spreadBps = Number(edge.orderbook?.spreadBps || 10);
  const imbalance = Number(edge.orderbook?.imbalance || 0);
  if (spreadBps <= 6 && Math.abs(imbalance) > 0.12) return { profile: 'liquidity_sniper', aggression: 0.75 };
  if (spreadBps > 15) return { profile: 'wait_or_split', aggression: 0.25 };
  return { profile: 'balanced_execution', aggression: 0.5 };
}
module.exports = { liquidityExecutionProfile };
