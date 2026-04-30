function pickStrategyMode(regimeInfo, analytics = {}, symbolInfo = {}) {
  const regime = regimeInfo?.regime || 'sideways';
  const winRate = Number(analytics?.summary?.winRate || 0.5);
  let mode = 'balanced';
  const reasons = [];

  if (regime === 'bull') { mode = 'trend_follow'; reasons.push('Bull regime -> trend following'); }
  else if (regime === 'bear') { mode = 'defensive_short_bias'; reasons.push('Bear regime -> defensive short bias'); }
  else { mode = 'mean_reversion'; reasons.push('Sideways regime -> mean reversion'); }

  if (winRate < 0.4) { mode = 'capital_preservation'; reasons.push('Gyenge win rate -> capital preservation'); }
  if (symbolInfo?.microstructure?.signal === 'toxic_flow') { mode = 'defensive'; reasons.push('Toxic flow -> defensive mode'); }

  return { mode, reasons };
}

module.exports = { pickStrategyMode };
