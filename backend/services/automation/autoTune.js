function suggestTuning(metrics = {}) {
  const winRate = Number(metrics.winRate || 0);
  const drawdown = Number(metrics.drawdown || 0);
  const confidenceFloor = winRate < 0.45 ? 0.62 : 0.55;
  const riskScale = drawdown > 0.1 ? 0.75 : 1.0;
  return {
    confidenceFloor,
    riskScale,
    notes: [
      winRate < 0.45 ? 'emeld a minimum confidence küszöböt' : 'confidence küszöb rendben',
      drawdown > 0.1 ? 'csökkentsd a risk budgetet' : 'risk budget rendben'
    ]
  };
}
module.exports = { suggestTuning };
