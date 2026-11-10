function selfEvolvingPolicy(ctx) {
  const summary = ctx.state.analytics?.summary || {};
  const winRate = Number(summary.winRate || 0);
  const netPnl = Number(summary.netPnl || 0);
  const tuning = ctx.state.automationSummary?.tuning || {};
  let mode = 'stable';
  if (winRate < 0.42 || netPnl < 0) mode = 'repair';
  else if (winRate > 0.55 && netPnl > 0) mode = 'exploit';
  return { mode, suggestedConfidenceFloor: Number(tuning.confidenceFloor || 0.55), suggestedRiskScale: Number(tuning.riskScale || 1.0) };
}
module.exports = { selfEvolvingPolicy };
