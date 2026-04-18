function norm01(v, min, max) {
  const x = Number(v || 0);
  if (max <= min) return 0.5;
  return Math.max(0, Math.min(1, (x - min) / (max - min)));
}

function deterministicScores(features) {
  let buy = 0.0;
  let sell = 0.0;
  const reasons = [];

  if (features.ema20 > features.ema50) {
    buy += 0.22;
    reasons.push('EMA20 > EMA50, emelkedő trend');
  } else {
    sell += 0.22;
    reasons.push('EMA20 < EMA50, csökkenő trend');
  }

  if (features.rsi < 33) {
    buy += 0.18;
    reasons.push('RSI túladott zóna');
  } else if (features.rsi > 67) {
    sell += 0.18;
    reasons.push('RSI túlvett zóna');
  }

  if ((features.macd?.MACD || 0) > (features.macd?.signal || 0)) {
    buy += 0.20;
    reasons.push('MACD bullish keresztezés');
  } else {
    sell += 0.20;
    reasons.push('MACD bearish keresztezés');
  }

  if ((features.volRatio || 1) > 1.15) {
    if (buy > sell) {
      buy += 0.10;
      reasons.push('A forgalom megerősíti az emelkedést');
    } else if (sell > buy) {
      sell += 0.10;
      reasons.push('A forgalom megerősíti a csökkenést');
    }
  }

  return { buy, sell, hold: Math.max(0.05, 1 - Math.max(buy, sell)), reasons };
}

function rlStyleScores(ctx, symbol, features) {
  const hist = ctx.state.closedTrades?.filter(t => t.symbol === symbol) || [];
  const recent = hist.slice(0, 20);
  const avgPnl = recent.length ? recent.reduce((a, b) => a + Number(b.pnl || 0), 0) / recent.length : 0;
  const winRate = recent.length ? recent.filter(t => Number(t.pnl || 0) > 0).length / recent.length : 0.5;

  const trend = (Number(features.ema20 || 0) - Number(features.ema50 || 0)) / Math.max(1, Number(features.price || 1));
  const trendScore = norm01(trend, -0.01, 0.01);
  const rsiBuy = 1 - norm01(features.rsi, 30, 70);
  const rsiSell = norm01(features.rsi, 30, 70);
  const pnlAdj = norm01(avgPnl, -10, 10);
  const winAdj = norm01(winRate, 0.3, 0.7);

  let buy = 0.15 + trendScore * 0.25 + rsiBuy * 0.10 + pnlAdj * 0.10 + winAdj * 0.10;
  let sell = 0.15 + (1 - trendScore) * 0.25 + rsiSell * 0.10 + (1 - pnlAdj) * 0.10 + (1 - winAdj) * 0.10;
  const hold = Math.max(0.05, 1 - Math.max(buy, sell));

  const reasons = [
    `RL-stílusú jutalomfigyelés: átlagos közelmúltbeli PnL ${avgPnl.toFixed(2)}`,
    `RL-stílusú találati arány figyelés: ${(winRate * 100).toFixed(1)}%`,
  ];

  return { buy, sell, hold, reasons };
}

function combineScores(a, b, wA = 0.55, wB = 0.45) {
  return {
    buy: a.buy * wA + b.buy * wB,
    sell: a.sell * wA + b.sell * wB,
    hold: a.hold * wA + b.hold * wB,
  };
}

function ensembleDecision(ctx, symbol, features, nnDecision = null) {
  const base = deterministicScores(features);
  const rl = rlStyleScores(ctx, symbol, features);

  let combined = combineScores(base, rl, 0.55, 0.45);
  let reasons = [...base.reasons, ...rl.reasons];

  if (nnDecision) {
    const nnAction = nnDecision.action || 'HOLD';
    const nnConf = Number(nnDecision.confidence || 0.5);
    if (nnAction === 'BUY') combined.buy += nnConf * 0.20;
    else if (nnAction === 'SELL') combined.sell += nnConf * 0.20;
    else combined.hold += nnConf * 0.20;
    reasons.push(`Neurális háló hozzájárulás: ${nnAction} ${(nnConf * 100).toFixed(1)}%`);
  }

  const maxSide = Math.max(combined.buy, combined.sell, combined.hold);
  let action = 'HOLD';
  if (combined.buy === maxSide) action = 'BUY';
  else if (combined.sell === maxSide) action = 'SELL';

  const confidence = Math.min(0.95, Math.max(0.35, maxSide));
  return {
    action,
    confidence: Number(confidence.toFixed(2)),
    reasons,
    source: 'ensemble-rl'
  };
}

module.exports = { ensembleDecision };
