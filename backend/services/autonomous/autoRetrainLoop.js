function retrainDecision(ctx) {
  const totalTrades = Number(ctx.state.analytics?.summary?.total || 0);
  const winRate = Number(ctx.state.analytics?.summary?.winRate || 0);
  const shouldRetrain = totalTrades >= 20 && winRate < 0.5;
  return { shouldRetrain, reason: shouldRetrain ? 'Van elég adat és a win rate gyenge' : 'Még nem szükséges retrain' };
}
module.exports = { retrainDecision };
