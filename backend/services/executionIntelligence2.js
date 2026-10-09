'use strict';
const crypto = require('crypto');
function num(v,f=0){ const n=Number(v); return Number.isFinite(n)?n:f; }
function clamp(v,min,max){ return Math.max(min,Math.min(max,num(v,min))); }
function stableHash(input){ return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex'); }
function buildExecutionPlan(input = {}) {
  const mode = String(input.mode || 'paper').toLowerCase();
  const side = String(input.side || '').toUpperCase();
  const spreadPct = Math.max(0,num(input.spreadPct));
  const latencyMs = Math.max(0,num(input.latencyMs));
  const dataAgeMs = Math.max(0,num(input.dataAgeMs));
  const edge = num(input.signalEdge);
  const estimatedCostPct = Math.max(0,num(input.estimatedRoundTripCostPct));
  const microstructure = input.microstructure && typeof input.microstructure === 'object' ? input.microstructure : {};
  const orderbook = microstructure.orderbook && typeof microstructure.orderbook === 'object' ? microstructure.orderbook : {};
  const funding = microstructure.funding && typeof microstructure.funding === 'object' ? microstructure.funding : {};
  const fundingCostPct = funding.status === 'validated' ? Math.max(0,num(funding.expectedFundingCostPct)) : 0;
  const afterCostEdge = edge - estimatedCostPct - fundingCostPct;
  const privateExecutionEnabled = input.privateExecutionEnabled === true;
  const blockers=[];
  if (!['BUY','SELL'].includes(side)) blockers.push('invalid-side');
  if (input.marketDataTrusted === false || dataAgeMs > Math.max(5000,num(input.maxDataAgeMs,15000))) blockers.push('stale-or-untrusted-market-data');
  if (spreadPct > num(input.maxSpreadPct,0.25)) blockers.push('spread-too-wide');
  if (mode === 'live' && !privateExecutionEnabled) blockers.push('live-private-execution-not-authorized');
  if (afterCostEdge <= 0 && input.activeLearningProbe !== true) blockers.push('non-positive-after-cost-edge');
  const volatility = String(input.volatility || 'medium').toLowerCase();
  let orderType='LIMIT'; let liquidity='MAKER'; let timeInForce='GTC';
  if (volatility === 'high' || latencyMs > 900 || afterCostEdge > Math.max(0.3,(estimatedCostPct+fundingCostPct)*2.2)) { orderType='MARKET'; liquidity='TAKER'; timeInForce='IOC'; }
  else if (orderbook.trusted === true && num(orderbook.liquidityScore) >= 60 && num(orderbook.spreadBps,999) <= 10) { orderType='LIMIT'; liquidity='MAKER'; timeInForce='GTC'; }
  else if (spreadPct > 0.12) { orderType='LIMIT'; liquidity='MAKER'; timeInForce='GTC'; }
  const retry = { maxAttempts: mode === 'live' ? 2 : 3, baseDelayMs: 350, maxDelayMs: 1800, staleAfterMs: volatility === 'high' ? 8000 : 15000 };
  const identity = { decisionId:input.decisionId||null, venue:String(input.venue||'').toLowerCase(), symbol:String(input.symbol||'').toUpperCase(), side, quantity:Number(num(input.quantity).toFixed(8)), strategyVersion:input.strategyVersion||null, marketSnapshotId:input.marketSnapshotId||null };
  return {
    version:'execution-intelligence-2.0',
    authority:'deterministic-execution-plan',
    accepted:blockers.length===0,
    blockers,
    idempotencyKey:stableHash(identity).slice(0,40),
    orderType, liquidity, timeInForce,
    retry,
    reconciliation:{ required:true, idempotent:true, partialFillPolicy:'accumulate-until-filled-cancelled-or-stale', uncertainStatePolicy:'reconcile-before-resubmit' },
    costs:{ spreadPct:Number(spreadPct.toFixed(5)), estimatedRoundTripCostPct:Number(estimatedCostPct.toFixed(5)), fundingCostPct:Number(fundingCostPct.toFixed(5)), signalEdge:Number(edge.toFixed(5)), afterCostEdge:Number(afterCostEdge.toFixed(5)) },
    microstructure:{ orderbookTrusted:orderbook.trusted === true, orderbookStatus:orderbook.dataStatus || null, liquidityScore:num(orderbook.liquidityScore), fundingStatus:funding.status || 'not-provided', fundingBias:funding.bias || 'neutral' },
    telemetry:{ latencyMs, dataAgeMs, volatility },
    policy:'freshness-risk-cost-idempotency-before-submit'
  };
}
module.exports={ buildExecutionPlan };
