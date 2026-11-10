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



function clamp(v, min, max) {
  const n = Number(v);
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}
function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function sideFromReturn(v, threshold = 0.008) {
  const x = n(v, 0);
  if (x >= threshold) return 'BUY';
  if (x <= -threshold) return 'SELL';
  return 'HOLD';
}
function buildMultiTimeframeContext(technical = {}) {
  const shortSide = sideFromReturn(technical.shortReturnPct, 0.008);
  const mediumSide = sideFromReturn(technical.mediumReturnPct, 0.012);
  const longSide = sideFromReturn(technical.longReturnPct, 0.018);
  const emaSide = sideFromReturn(technical.emaSpreadPct, 0.006);
  const votes = [shortSide, mediumSide, longSide, emaSide];
  const buy = votes.filter(x => x === 'BUY').length;
  const sell = votes.filter(x => x === 'SELL').length;
  const directional = Math.max(buy, sell);
  const consensusSide = buy > sell ? 'BUY' : sell > buy ? 'SELL' : 'HOLD';
  const alignmentPct = directional / votes.length * 100;
  const conflict = buy > 0 && sell > 0;
  const ready = technical.ready === true && n(technical.sampleCount, 0) >= 10;
  const confidence = ready ? clamp(alignmentPct - (conflict ? 12 : 0) + Math.min(18, Math.abs(n(technical.momentumScore, 0)) * 0.18), 20, 96) : 0;
  return {
    version: 'multi-timeframe-ai-1.0', ready, shortSide, mediumSide, longSide, emaSide,
    consensusSide, alignmentPct: Number(alignmentPct.toFixed(1)), conflict,
    confidence: Number(confidence.toFixed(1)),
    inputs: {
      shortReturnPct: n(technical.shortReturnPct, 0), mediumReturnPct: n(technical.mediumReturnPct, 0),
      longReturnPct: n(technical.longReturnPct, 0), emaSpreadPct: n(technical.emaSpreadPct, 0)
    },
    policy: 'short-medium-long-ema-consensus-no-independent-entry-authority'
  };
}

function buildEnsembleIntelligence2(input = {}) {
  const technical = input.technical || {};
  const mtf = input.multiTimeframe || buildMultiTimeframeContext(technical);
  const cross = input.crossMarket || {};
  const transition = input.regimeTransition || {};
  const route = input.routeScore || {};
  let buyAdjustment = 0;
  let sellAdjustment = 0;
  let holdAdjustment = 0;
  const reasons = [];

  const mtfStrength = clamp(n(mtf.confidence, 0) / 100, 0, 1);
  if (mtf.ready && mtf.consensusSide === 'BUY') { buyAdjustment += 7 * mtfStrength; reasons.push('MTF BUY konszenzus'); }
  if (mtf.ready && mtf.consensusSide === 'SELL') { sellAdjustment += 7 * mtfStrength; reasons.push('MTF SELL konszenzus'); }
  if (mtf.conflict) { holdAdjustment += 3.5; reasons.push('MTF idősík konfliktus'); }

  const crossConfidence = clamp(n(cross.confidence, 0) / 100, 0, 1);
  if (cross.marketBias === 'risk-on') { buyAdjustment += 4.5 * crossConfidence; reasons.push('Cross-market risk-on'); }
  if (cross.marketBias === 'risk-off') { sellAdjustment += 4.5 * crossConfidence; reasons.push('Cross-market risk-off'); }
  if (cross.marketBias === 'mixed') { holdAdjustment += 2.0 * crossConfidence; reasons.push('Cross-market vegyes'); }
  if (n(cross.targetBtcCorrelation, 0) >= 0.45 && cross.btcSide === 'BUY') buyAdjustment += 2.5 * crossConfidence;
  if (n(cross.targetBtcCorrelation, 0) >= 0.45 && cross.btcSide === 'SELL') sellAdjustment += 2.5 * crossConfidence;

  const phase = String(transition.phase || 'stable');
  if (phase.includes('unstable')) { holdAdjustment += 4.5; reasons.push('Regime átmenet instabil'); }
  else if (phase.includes('emerging')) { holdAdjustment += 2.5; reasons.push('Regime átmenet megerősítésre vár'); }

  if (route && Number(route.trades || 0) >= Number(route.minSamples || 8)) {
    const pf = n(route.profitFactor, 0);
    const exp = n(route.expectancyUsd, 0);
    const side = String(input.side || '').toUpperCase();
    let routeAdjustment = clamp((pf - 1) * 3.5 + exp * 18, -7, 6);
    if (side === 'BUY') buyAdjustment += routeAdjustment;
    if (side === 'SELL') sellAdjustment += routeAdjustment;
    reasons.push(`Scorecard route ${routeAdjustment >= 0 ? '+' : ''}${routeAdjustment.toFixed(1)}`);
  }

  const directionalPenalty = clamp(holdAdjustment * 0.55, 0, 5);
  buyAdjustment -= directionalPenalty;
  sellAdjustment -= directionalPenalty;
  const opportunityAdjustment = clamp(Math.max(buyAdjustment, sellAdjustment) - holdAdjustment, -10, 10);
  const confidenceMultiplier = clamp(1 + opportunityAdjustment / 100, 0.82, 1.08);
  return {
    version: 'ensemble-intelligence-2.0', authority: 'bounded-score-adjustment-no-independent-entry',
    buyAdjustment: Number(buyAdjustment.toFixed(3)), sellAdjustment: Number(sellAdjustment.toFixed(3)),
    holdAdjustment: Number(holdAdjustment.toFixed(3)), opportunityAdjustment: Number(opportunityAdjustment.toFixed(3)),
    confidenceMultiplier: Number(confidenceMultiplier.toFixed(3)), reasons, multiTimeframe: mtf,
    crossMarket: cross, regimeTransition: transition,
    policy: 'route-score-mtf-cross-market-transition-bounded-ensemble'
  };
}

module.exports = { ensembleDecision, buildMultiTimeframeContext, buildEnsembleIntelligence2 };


// Features from completed, own-source quote candles. Sparse OHLC is explicitly unavailable.
function detectOwnQuotePatterns(quotes=[],scope={},nowMs=Date.now()) {
  const rows=require('./continuousRetraining').normalizeReplayQuotes(quotes,scope);
  const buckets=new Map();for(const q of rows){const minute=Math.floor(q.timeMs/60000)*60000;if(minute+60000>nowMs)continue;(buckets.get(minute) || (buckets.set(minute,[]),buckets.get(minute))).push(q);}
  const candles=[...buckets].sort((a,b)=>a[0]-b[0]).filter(([,q])=>q.length>=3 && q.at(-1).timeMs-q[0].timeMs>=40000).map(([timeMs,q])=>{const prices=q.map(x=>(Number(x.bid)+Number(x.ask))/2);return {timeMs,open:prices[0],close:prices.at(-1),high:Math.max(...prices),low:Math.min(...prices),samples:q.length};});
  const latest=candles.at(-1),previous=candles.at(-2),patterns=[];
  if(!latest || nowMs-latest.timeMs>180000)return {available:false,reason:'no-completed-fresh-dense-own-candle',patterns,authority:'feature-only',scope};
  const body=Math.abs(latest.close-latest.open),range=latest.high-latest.low;
  if(range>0 && body/range<=0.1)patterns.push({name:'doji',direction:'neutral'});
  if(range>0 && Math.min(latest.open,latest.close)-latest.low>=2*Math.max(body,range*0.05) && latest.high-Math.max(latest.open,latest.close)<=range*0.2)patterns.push({name:'hammer',direction:'bullish'});
  if(previous && latest.timeMs-previous.timeMs===60000){
    if(previous.close<previous.open && latest.close>latest.open && latest.open<=previous.close && latest.close>=previous.open)patterns.push({name:'bullish-engulfing',direction:'bullish'});
    if(previous.close>previous.open && latest.close<latest.open && latest.open>=previous.close && latest.close<=previous.open)patterns.push({name:'bearish-engulfing',direction:'bearish'});
  }
  return {available:true,scope,patterns,candle:latest,authority:'feature-only',backtestValidated:false,scoreAdjustment:0};
}
function ownBuyHoldBenchmark(quotes=[],scope={},costs={}) {
  const rows=require('./continuousRetraining').normalizeReplayQuotes(quotes,scope),fee=Number(costs.feeRate ?? 0.001),slip=Number(costs.slippageRate ?? 0.0002),notional=Number(costs.notionalUsd ?? 25);
  if(rows.length<2)return {available:false,reason:'insufficient-own-quotes',scope,tradingEvidence:false};
  if(!Number.isFinite(fee) || fee<0 || fee>0.1 || !Number.isFinite(slip) || slip<0 || slip>0.1 || !(notional>0))throw new Error('INVALID_BENCHMARK_COST');
  const entry=rows[0].ask*(1+slip),exit=rows.at(-1).bid*(1-slip),quantity=notional/entry,netPnl=(exit-entry)*quantity-(entry+exit)*quantity*fee;
  return {available:true,name:'own-quote-buy-and-hold',scope,startAt:rows[0].timeMs,endAt:rows.at(-1).timeMs,rows:rows.length,netPnl,feeRate:fee,slippageRate:slip,verified:false,tradingEvidence:false,accountScope:'reference-only',externalLeaderFeed:false};
}
module.exports.detectOwnQuotePatterns=detectOwnQuotePatterns;
module.exports.ownBuyHoldBenchmark=ownBuyHoldBenchmark;
