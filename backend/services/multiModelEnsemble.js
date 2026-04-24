function voteToScores(votes = []) {
  const scores = { BUY: 0, SELL: 0, HOLD: 0 };
  for (const v of votes) {
    const action = v.action || 'HOLD';
    const conf = Number(v.confidence || 0.5);
    scores[action] = (scores[action] || 0) + conf;
  }
  return scores;
}

function pickWinner(scores) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [action, score] = entries[0];
  const total = entries.reduce((s, [,v]) => s + Number(v || 0), 0) || 1;
  return { action, confidence: Number(Math.max(0.35, Math.min(0.95, score / total)).toFixed(2)) };
}

function buildModelVotes(ctx, symbol, features, regimeInfo, strategyInfo, baseDecision) {
  const votes = [];
  votes.push({ model: 'base_ensemble', action: baseDecision.action, confidence: Number(baseDecision.confidence || 0.5), reasons: baseDecision.reasons || [] });

  if (regimeInfo?.regime === 'bull') {
    votes.push({ model: 'regime_trend', action: features.ema20 > features.ema50 ? 'BUY' : 'HOLD', confidence: 0.62, reasons: ['Bull regime trend vote'] });
  } else if (regimeInfo?.regime === 'bear') {
    votes.push({ model: 'regime_trend', action: features.ema20 < features.ema50 ? 'SELL' : 'HOLD', confidence: 0.62, reasons: ['Bear regime trend vote'] });
  } else {
    votes.push({ model: 'regime_mean_reversion', action: Number(features.rsi || 50) < 30 ? 'BUY' : (Number(features.rsi || 50) > 70 ? 'SELL' : 'HOLD'), confidence: 0.58, reasons: ['Sideways mean reversion vote'] });
  }

  if (strategyInfo?.strategy === 'breakout') {
    votes.push({ model: 'breakout_model', action: Number(features.volRatio || 1) > 1.2 ? (features.ema20 > features.ema50 ? 'BUY' : 'SELL') : 'HOLD', confidence: 0.60, reasons: ['Breakout strategy vote'] });
  }

  if (strategyInfo?.strategy === 'mean_reversion') {
    votes.push({ model: 'mean_reversion_model', action: Number(features.rsi || 50) < 35 ? 'BUY' : (Number(features.rsi || 50) > 65 ? 'SELL' : 'HOLD'), confidence: 0.57, reasons: ['Mean reversion strategy vote'] });
  }

  if (features.microstructure?.signal === 'efficient_flow') {
    votes.push({ model: 'microstructure_model', action: features.ema20 >= features.ema50 ? 'BUY' : 'SELL', confidence: 0.56, reasons: ['Efficient flow vote'] });
  } else if (features.microstructure?.signal === 'toxic_flow') {
    votes.push({ model: 'microstructure_model', action: 'HOLD', confidence: 0.61, reasons: ['Toxic flow caution vote'] });
  }

  return votes;
}

function combineModelVotes(ctx, symbol, features, regimeInfo, strategyInfo, baseDecision) {
  const votes = buildModelVotes(ctx, symbol, features, regimeInfo, strategyInfo, baseDecision);
  const scores = voteToScores(votes);
  const winner = pickWinner(scores);
  return {
    action: winner.action,
    confidence: winner.confidence,
    reasons: [...(baseDecision.reasons || []), `Multi-model votes: ${votes.map(v => `${v.model}:${v.action}@${v.confidence}`).join(' | ')}`],
    source: 'multi-model-ensemble',
    votes,
    scoreBoard: scores
  };
}

module.exports = { combineModelVotes };
