function reinvestPlan(performance = {}) {
  const netPnl = Number(performance.netPnl || 0);
  const drawdown = Number(performance.drawdown || 0);
  if (netPnl <= 0 || drawdown > 0.12) return { mode: 'preserve', reinvestPct: 0 };
  if (drawdown <= 0.05) return { mode: 'compound', reinvestPct: 0.35 };
  return { mode: 'partial_compound', reinvestPct: 0.15 };
}
module.exports = { reinvestPlan };
