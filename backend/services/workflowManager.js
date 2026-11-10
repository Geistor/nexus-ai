const { evaluatePromotion, canSetStage } = require('./promotionRules');

function computePaperStats(state) {
  const trades = state.closedTrades || [];
  const total = trades.length;
  const wins = trades.filter(t => Number(t.pnl || 0) > 0).length;
  const netPnl = trades.reduce((s, t) => s + Number(t.pnl || 0), 0);
  const winRate = total ? wins / total : 0;
  return { totalTrades: total, wins, losses: total - wins, winRate: Number(winRate.toFixed(4)), netPnl: Number(netPnl.toFixed(2)) };
}

function evaluateReadiness(state) {
  const stats = computePaperStats(state);
  const exchangeCount = Object.keys(state.exchangeConnections || {}).length;
  const hasRemote = !!state.remoteStorage?.enabled;
  const hasModel = !!state.modelLoaded;
  const enoughPaper = stats.totalTrades >= 10;
  const profitable = stats.netPnl > 0;
  const decentWinRate = stats.winRate >= 0.45;
  return { exchangeCount, hasRemoteStorage: hasRemote, hasModel, enoughPaperHistory: enoughPaper, profitablePaper: profitable, decentWinRate, canPromoteToLive: exchangeCount > 0 && hasRemote && enoughPaper && profitable && decentWinRate };
}

function getWorkflowState(ctx) {
  const mode = ctx.state.workflow?.mode || 'paper_safe';
  const status = ctx.state.workflow?.status || 'idle';
  const stats = computePaperStats(ctx.state);
  const readiness = evaluateReadiness(ctx.state);
  const promotion = evaluatePromotion(ctx.state);
  return { mode, status, stage: ctx.state.workflow?.stage || 'paper', stats, readiness, promotion, lastStartAt: ctx.state.workflow?.lastStartAt || null, lastStopAt: ctx.state.workflow?.lastStopAt || null, liveApprovalAt: ctx.state.workflow?.liveApprovalAt || null };
}

function setWorkflowMode(ctx, mode) {
  const allowed = new Set(['paper', 'paper_safe', 'live_armed', 'live']);
  if (!allowed.has(mode)) throw new Error('Érvénytelen workflow mód.');
  ctx.state.workflow = ctx.state.workflow || {};
  ctx.state.workflow.mode = mode;
  return getWorkflowState(ctx);
}
function markStarted(ctx) { ctx.state.workflow = ctx.state.workflow || {}; ctx.state.workflow.status = 'running'; ctx.state.workflow.lastStartAt = new Date().toISOString(); return getWorkflowState(ctx); }
function markStopped(ctx) { ctx.state.workflow = ctx.state.workflow || {}; ctx.state.workflow.status = 'stopped'; ctx.state.workflow.lastStopAt = new Date().toISOString(); return getWorkflowState(ctx); }
function armLive(ctx) {
  const readiness = evaluateReadiness(ctx.state);
  if (!readiness.canPromoteToLive) throw new Error('A rendszer még nem kész élő módra.');
  ctx.state.workflow = ctx.state.workflow || {}; ctx.state.workflow.mode = 'live_armed'; ctx.state.workflow.liveApprovalAt = new Date().toISOString(); return getWorkflowState(ctx);
}
function setWorkflowStage(ctx, stage) {
  const gate = canSetStage(ctx.state, stage);
  if (!gate.ok) throw new Error(gate.reason || 'A stage váltás nem engedélyezett.');
  ctx.state.workflow = ctx.state.workflow || {}; ctx.state.workflow.stage = stage;
  if (stage === 'paper') ctx.state.workflow.mode = 'paper_safe';
  if (stage === 'staging') ctx.state.workflow.mode = 'paper';
  if (stage === 'live') ctx.state.workflow.mode = 'live';
  ctx.state.workflow.lastStageChangeAt = new Date().toISOString();
  return getWorkflowState(ctx);
}

function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function bounded(value, min, max) { return Math.max(min, Math.min(max, finite(value, min))); }
function seed32(seed = 'nexus') {
  const text = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seededRng(seed = 'nexus') {
  let a = seed32(seed);
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function percentile(values = [], p = 0.5) {
  const rows = values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if (!rows.length) return 0;
  const idx = Math.max(0, Math.min(rows.length - 1, (rows.length - 1) * p));
  const lo = Math.floor(idx), hi = Math.ceil(idx), w = idx - lo;
  return rows[lo] * (1 - w) + rows[hi] * w;
}
function pathRiskStats(values = [], initialEquity = 10000) {
  let equity = finite(initialEquity, 10000), peak = equity, maxDd = 0, lossStreak = 0, maxLossStreak = 0;
  for (const pnl of values) {
    equity += finite(pnl, 0); peak = Math.max(peak, equity); maxDd = Math.max(maxDd, peak - equity);
    if (pnl < 0) { lossStreak += 1; maxLossStreak = Math.max(maxLossStreak, lossStreak); } else if (pnl > 0) lossStreak = 0;
  }
  return { netPnl: equity - initialEquity, endingEquity: equity, maxDrawdownUsd: maxDd, maxDrawdownPct: peak > 0 ? maxDd / peak * 100 : 0, maxLossStreak };
}

function runTradeMonteCarlo(tradePnls = [], options = {}) {
  const rows = tradePnls.map(Number).filter(Number.isFinite);
  const iterations = Math.max(50, Math.min(1000, Math.round(finite(options.iterations, 250))));
  const seed = String(options.seed || 'nexus-monte-carlo');
  const initialEquity = Math.max(1, finite(options.initialEquity, 10000));
  if (rows.length < 3) return { version:'monte-carlo-1.0', source:'verified-trade-bootstrap-simulation', accepted:false, status:'insufficient-samples', samples:rows.length, iterations:0, seed, tradingEvidence:false };
  const rng = seededRng(seed);
  const results = [];
  for (let i = 0; i < iterations; i += 1) {
    const sampled = [];
    for (let n = 0; n < rows.length; n += 1) sampled.push(rows[Math.floor(rng() * rows.length)]);
    results.push(pathRiskStats(sampled, initialEquity));
  }
  const net = results.map(x=>x.netPnl), dd = results.map(x=>x.maxDrawdownPct), streak = results.map(x=>x.maxLossStreak);
  const ruinFloorPct = Math.max(0.1, finite(options.ruinFloorPct, 20));
  const ruin = results.filter(x => x.endingEquity <= initialEquity * (1 - ruinFloorPct / 100)).length / results.length * 100;
  const p05NetPnl = percentile(net, 0.05), medianNetPnl = percentile(net, 0.5), p95DrawdownPct = percentile(dd, 0.95), p95LossStreak = percentile(streak, 0.95);
  const accepted = ruin <= finite(options.maxRuinProbabilityPct, 20)
    && p95DrawdownPct <= finite(options.maxP95DrawdownPct, 12)
    && p05NetPnl >= finite(options.minP05NetPnl, -0.05);
  return {
    version:'monte-carlo-1.0', source:'verified-trade-bootstrap-simulation', tradingEvidence:false, accepted,
    status:accepted?'risk-envelope-pass':'risk-envelope-fail', samples:rows.length, iterations, seed,
    p05NetPnl:Number(p05NetPnl.toFixed(4)), medianNetPnl:Number(medianNetPnl.toFixed(4)),
    p95DrawdownPct:Number(p95DrawdownPct.toFixed(3)), p95LossStreak:Number(p95LossStreak.toFixed(1)), ruinProbabilityPct:Number(ruin.toFixed(2)),
    policy:{ maxRuinProbabilityPct:finite(options.maxRuinProbabilityPct,20), maxP95DrawdownPct:finite(options.maxP95DrawdownPct,12), minP05NetPnl:finite(options.minP05NetPnl,-0.05), ruinFloorPct }
  };
}

function runMarketStressValidation(input = {}) {
  const expectedMovePct = Math.max(0, finite(input.expectedMovePct, 0));
  const baseCostPct = Math.max(0, finite(input.estimatedRoundTripCostPct, finite(input.costPct, 0)));
  const spreadPct = Math.max(0, finite(input.spreadPct, 0));
  const routeExpectancyPct = finite(input.routeExpectancyPct, 0);
  const volatility = String(input.volatility || 'medium').toLowerCase();
  const scenarios = [
    { key:'base', move:1, cost:1, extra:0 }, { key:'spread-shock', move:0.92, cost:1.65, extra:spreadPct * 0.45 },
    { key:'slippage-shock', move:0.90, cost:1.45, extra:Math.max(0.02, spreadPct * 0.30) }, { key:'latency-decay', move:0.74, cost:1.12, extra:0.015 },
    { key:'liquidity-loss', move:0.62, cost:1.90, extra:Math.max(0.04, spreadPct * 0.65) }
  ];
  if (volatility === 'high') scenarios.push({ key:'volatility-spike', move:0.70, cost:2.10, extra:0.06 });
  const results = scenarios.map(s => { const stressedMove = expectedMovePct * s.move; const stressedCost = baseCostPct * s.cost + s.extra; const netEdgePct = stressedMove - stressedCost + Math.min(0.04, routeExpectancyPct * 0.15); return { key:s.key, netEdgePct:Number(netEdgePct.toFixed(5)), survives:netEdgePct > 0, movePct:Number(stressedMove.toFixed(5)), costPct:Number(stressedCost.toFixed(5)) }; });
  const survived = results.filter(x => x.survives).length, survivalRate = results.length ? survived / results.length : 0;
  const worstNetEdgePct = results.length ? Math.min(...results.map(x => x.netEdgePct)) : 0;
  const avgNetEdgePct = results.length ? results.reduce((s,x)=>s+x.netEdgePct,0) / results.length : 0;
  const score = bounded(survivalRate * 72 + bounded(avgNetEdgePct * 300, -18, 18) + (worstNetEdgePct > -0.15 ? 10 : 0), 0, 100);
  const state = score >= 72 ? 'resilient' : score >= 50 ? 'mixed' : 'fragile';
  const sizeMultiplier = state === 'resilient' ? 1 : state === 'mixed' ? 0.82 : 0.62;
  return { version:'market-stress-validation-2.0', authority:'ranking-and-risk-only-no-entry-generation', state, score:Number(score.toFixed(1)), survivalRate:Number((survivalRate*100).toFixed(1)), worstNetEdgePct:Number(worstNetEdgePct.toFixed(5)), avgNetEdgePct:Number(avgNetEdgePct.toFixed(5)), sizeMultiplier, scenarios:results, opportunityAdjustment:Number(((score-50)*0.12).toFixed(3)), policy:'spread-slippage-latency-liquidity-volatility-deterministic-stress-grid' };
}

function syntheticReturnPath(kind, steps, volatilityPct, rng) {
  const out = []; const vol = Math.max(0.002, volatilityPct / 100 || 0.0008);
  for (let i=0;i<steps;i+=1) {
    const z = (rng()+rng()+rng()+rng()+rng()+rng()-3) * vol;
    let drift = 0;
    if (kind === 'trend-up') drift = vol * 0.28;
    if (kind === 'trend-down') drift = -vol * 0.28;
    if (kind === 'pump') drift = i < steps*0.35 ? vol*1.3 : -vol*0.08;
    if (kind === 'crash') drift = i < steps*0.28 ? -vol*1.45 : vol*0.10;
    if (kind === 'range') drift = (i % 2 ? -1 : 1) * vol * 0.08;
    if (kind === 'liquidity-loss') drift = z * 0.15;
    out.push(drift + z);
  }
  return out;
}

function replayHistoricalPrices(history = []) {
  const rows = history.map(row => ({ ts:Date.parse(row.time || row.ts || row.timestamp || '') || finite(row.timeMs,0), price:finite(row.price ?? row.mid ?? row.close,0) })).filter(x=>x.price>0).sort((a,b)=>a.ts-b.ts);
  const returns=[];
  for(let i=1;i<rows.length;i+=1) if(rows[i-1].price>0) returns.push((rows[i].price-rows[i-1].price)/rows[i-1].price);
  return returns;
}

function evaluateScenarioReturns(returns = [], input = {}, scenario = {}) {
  const side = String(input.side || 'HOLD').toUpperCase();
  if (!['BUY','SELL'].includes(side) || !returns.length) return { status:'not-evaluable', netPnlUsd:0, maxDrawdownPct:0, filled:false };
  const direction = side === 'SELL' ? -1 : 1;
  const notional = Math.max(1, finite(input.notionalUsd, 100));
  const feePct = Math.max(0, finite(input.feePct, 0.10));
  const spreadPct = Math.max(0, finite(input.spreadPct, 0.04)) * finite(scenario.spreadMultiplier,1);
  const slippagePct = Math.max(0, finite(input.slippagePct, 0.02)) * finite(scenario.slippageMultiplier,1);
  const fundingPct = String(input.productType || 'spot').toLowerCase().includes('perp') ? finite(input.fundingPct,0) * finite(scenario.fundingMultiplier,1) : 0;
  const fillRatio = bounded(finite(scenario.fillRatio,1),0,1);
  if (scenario.rejected === true || fillRatio <= 0) return { status:'rejected', netPnlUsd:0, maxDrawdownPct:0, filled:false, fillRatio:0 };
  const equityPath=[]; let pnl=0, peak=0, maxDd=0;
  for(const r of returns){ pnl += notional*fillRatio*direction*finite(r,0); peak=Math.max(peak,pnl); maxDd=Math.max(maxDd,peak-pnl); equityPath.push(pnl); }
  const costs = notional*fillRatio*(feePct+spreadPct+slippagePct+Math.abs(fundingPct))/100;
  pnl -= costs;
  return { status:scenario.disconnect?'reconciled-after-disconnect':'filled', netPnlUsd:Number(pnl.toFixed(4)), maxDrawdownPct:Number((maxDd/Math.max(1,notional*fillRatio)*100).toFixed(3)), filled:true, fillRatio:Number(fillRatio.toFixed(3)), costsUsd:Number(costs.toFixed(4)), steps:returns.length };
}

function runMarketSimulationLab(input = {}) {
  const seed = String(input.seed || 'nexus-simulation-lab'); const rng = seededRng(seed);
  const volatilityPct = Math.max(0.02, finite(input.volatilityPct, 0.12)); const steps = Math.max(12, Math.min(720, Math.round(finite(input.steps, 96))));
  const definitions = [
    { key:'historical-replay', historical:true }, { key:'trend-up' }, { key:'trend-down' }, { key:'range' }, { key:'pump', slippageMultiplier:1.35 },
    { key:'crash', spreadMultiplier:1.7, slippageMultiplier:1.8 }, { key:'liquidity-loss', spreadMultiplier:2.4, slippageMultiplier:2.8, fillRatio:0.55, disconnect:true },
    { key:'partial-fill', fillRatio:0.42 }, { key:'rejection', rejected:true }
  ];
  const historyReturns = replayHistoricalPrices(input.history || []);
  const scenarios = definitions.map(def => {
    const returns = def.historical ? historyReturns : syntheticReturnPath(def.key, steps, volatilityPct, rng);
    const result = evaluateScenarioReturns(returns, input, def);
    return { key:def.key, source:def.historical?'historical-chronological-replay':'synthetic-seeded-scenario', ...result };
  });
  const evaluable=scenarios.filter(x=>x.status!=='not-evaluable' && x.status!=='rejected');
  const profitable=evaluable.filter(x=>x.netPnlUsd>0).length;
  const maxDd=evaluable.length?Math.max(...evaluable.map(x=>x.maxDrawdownPct)):0;
  const score = evaluable.length ? bounded((profitable/evaluable.length)*70 + Math.max(0,30-maxDd*2),0,100) : 0;
  return {
    version:'market-simulation-lab-1.0', seed, generatedAt:new Date().toISOString(), tradingEvidence:false,
    dataPolicy:'historical-replay-and-synthetic-scenarios-never-count-as-verified-trades', side:String(input.side||'HOLD').toUpperCase(), scenarios,
    summary:{ scenarioCount:scenarios.length, evaluableCount:evaluable.length, profitableCount:profitable, profitablePct:evaluable.length?Number((profitable/evaluable.length*100).toFixed(1)):0, worstDrawdownPct:Number(maxDd.toFixed(3)), resilienceScore:Number(score.toFixed(1)) },
    promotionAuthority:'validation-input-only-never-live-authorization'
  };
}

module.exports = { getWorkflowState, setWorkflowMode, setWorkflowStage, markStarted, markStopped, armLive, evaluateReadiness, runMarketStressValidation, runTradeMonteCarlo, runMarketSimulationLab, replayHistoricalPrices };
