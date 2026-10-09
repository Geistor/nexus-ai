'use strict';

const { buildStrategyScorecard, metricSummary, verifiedTrade, netPnlOf } = require('./strategyScorecard');
const { fingerprint, registerCandidate, validateCandidate, promoteChampion, registrySnapshot, rollbackChampion, retireModel, updateForwardEvidence, forwardRowsForEntry } = require('./modelRegistry');
const { runTradeMonteCarlo } = require('./workflowManager');

function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function now() { return new Date().toISOString(); }
function routeArtifact(scorecard = {}) {
  const rows = Array.isArray(scorecard.routes) ? scorecard.routes : [];
  const weights = {};
  for (const row of rows.slice(0, 80)) {
    weights[row.key] = {
      score: num(row.score),
      reliability: num(row.reliability),
      expectancyUsd: num(row.expectancyUsd),
      profitFactor: num(row.profitFactor),
      sampleStatus: row.sampleStatus,
      riskHint: row.sampleStatus === 'qualified' && row.expectancyUsd > 0 && row.profitFactor >= 1.05
        ? Math.min(1.08, 0.95 + num(row.reliability) * 0.13)
        : row.sampleStatus === 'qualified' && (row.expectancyUsd < 0 || row.profitFactor < 0.9)
          ? Math.max(0.55, 0.9 - num(row.reliability) * 0.3)
          : 0.82
    };
  }
  return { routeWeights: weights, overall: scorecard.overall || {}, version: 'route-policy-2.0' };
}
function datasetSummary(rows = []) {
  const times = rows.map(r => Date.parse(r.closedAt || r.time || '')).filter(Number.isFinite).sort((a,b)=>a-b);
  return {
    rows: rows.length,
    firstAt: times.length ? new Date(times[0]).toISOString() : null,
    lastAt: times.length ? new Date(times[times.length - 1]).toISOString() : null,
    ids: rows.slice(-120).map(r => r.id || r.orderId || r.decisionId || null).filter(Boolean)
  };
}
function driftSignal(scorecard = {}, champion = null, policy = {}) {
  if (!champion) return { status: 'no-champion', drift: false, reasons: [] };
  const current = scorecard.overall || {};
  const base = champion.prospectiveEvidence?.metrics || champion.validationMetrics || {};
  const reasons = [];
  const scoreDrop = num(base.score) - num(current.score);
  const expectancyDrop = num(base.expectancyUsd) - num(current.expectancyUsd);
  const pfDrop = num(base.profitFactor) - num(current.profitFactor);
  if (scoreDrop >= num(policy.scoreDrop, 12)) reasons.push(`score-drop:${scoreDrop.toFixed(1)}`);
  if (expectancyDrop > num(policy.expectancyDrop, 0.02)) reasons.push(`expectancy-drop:${expectancyDrop.toFixed(4)}`);
  if (pfDrop > num(policy.profitFactorDrop, 0.35)) reasons.push(`pf-drop:${pfDrop.toFixed(3)}`);
  return { status: reasons.length ? 'drift-detected' : 'stable', drift: reasons.length > 0, reasons, scoreDrop, expectancyDrop, pfDrop };
}
// No wall-clock time participates in learned weights or candidate identity.
function closeTime(r) { return Date.parse(r.closedAt || r.time || ''); }
function openTime(r) {
  const explicit = Date.parse(r.openedAt || r.entryAt || r.submittedAt || '');
  return Number.isFinite(explicit) ? explicit : closeTime(r) - Math.max(0, num(r.holdingMs));
}
function canonicalTrade(r) {
  return { id:r.id || r.orderId || r.decisionId || null, venue:r.requestedVenue || r.venue || 'UNKNOWN',
    symbol:r.symbol, regime:r.regime || r.marketRegime, side:r.side,
    strategy:r.strategyKey || r.strategy || r.agentStrategy || r.strategyFamily,
    mode:r.executionMode || r.mode || 'paper', strategyVersion:r.strategyVersion || null,
    openedAt:openTime(r), closedAt:closeTime(r), netPnl:netPnlOf(r), grossPnl:r.grossPnl ?? null,
    fee:r.fee ?? r.fees ?? 0, slippage:r.slippage ?? r.slippageCost ?? 0, funding:r.fundingCost ?? 0,
    quantity:r.quantity ?? r.amount ?? null, candidateFingerprint:r.candidateFingerprint || null };
}
function purgedSplit(trades, options = {}) {
  const mode = String(options.mode || 'paper').toLowerCase();
  const seen = new Set();
  const ordered = trades.filter(r => verifiedTrade(r) && Number.isFinite(closeTime(r)) &&
    String(r.executionMode || r.mode || 'paper').toLowerCase() === mode &&
    (!options.strategyVersion || !r.strategyVersion || r.strategyVersion === options.strategyVersion))
    .sort((a,b)=>closeTime(a)-closeTime(b) || fingerprint(canonicalTrade(a)).localeCompare(fingerprint(canonicalTrade(b))))
    .filter(r => { const k=r.id || r.orderId || fingerprint(canonicalTrade(r)); if(seen.has(k))return false; seen.add(k); return true; });
  const cut = Math.max(1, Math.floor(ordered.length * (1 - num(options.validationFraction,0.3))));
  const holdout = ordered.slice(cut);
  const testCut = Math.ceil(holdout.length / 2);
  const validationRaw = holdout.slice(0,testCut), testRaw = holdout.slice(testCut);
  const embargoMs = Math.max(0,num(options.embargoMs,60000));
  const boundary = validationRaw.length ? Math.min(...validationRaw.map(openTime)) : Infinity;
  const train = ordered.slice(0,cut).filter(r => closeTime(r) + embargoMs < boundary);
  const testBoundary = testRaw.length ? Math.min(...testRaw.map(openTime)) : Infinity;
  const validation = validationRaw.filter(r => closeTime(r) + embargoMs < testBoundary && openTime(r) > Math.max(0,...train.map(closeTime)) + embargoMs);
  const test = testRaw.filter(r=>openTime(r)>Math.max(0,...validation.map(closeTime),...train.map(closeTime))+embargoMs);
  return { train, validation, test, ordered, purged:ordered.length-train.length-validation.length-test.length, embargoMs };
}
function evaluateFrozenPolicy(artifact, rows, options = {}) {
  const { routeKey } = require('./strategyQualityAutopilot2');
  const replay = rows.map(row => {
    const key = routeKey({venue:row.requestedVenue || row.venue, symbol:row.symbol,regime:row.regime || row.marketRegime,
      side:row.side,strategy:row.strategyKey || row.strategy || row.agentStrategy || row.strategyFamily});
    const scale = Math.min(1,Math.max(0.55,num(artifact.routeWeights?.[key]?.riskHint,0.82)));
    // Fixed historical entries/exits; proportional cost assumption. NOT counterfactual new-entry proof.
    return {...row,netPnl:netPnlOf(row)*scale,grossPnl:num(row.grossPnl,netPnlOf(row))*scale,
      fee:num(row.fee ?? row.fees)*scale,slippage:num(row.slippage ?? row.slippageCost)*scale,
      fundingCost:num(row.fundingCost)*scale,policyScale:scale};
  });
  const asOf = rows.length ? Math.max(...rows.map(closeTime)) : 0;
  return { metrics:metricSummary(replay,options.minSamples || 8,{nowMs:asOf,halfLifeDays:options.halfLifeDays || 21}),
    outcomes:replay.map(r=>r.netPnl), source:'frozen-policy-fixed-decision-proportional-cost-replay',
    tradingEvidence:false,riskIncreaseEligible:false, limitations:['historical entries/exits unchanged','minimum fee/lot effects not replayed','prospective candidate-tagged results required'] };
}
function buildCandidate(trades = [], options = {}) {
  const split=purgedSplit(trades,options);
  const asOf=split.train.length ? new Date(Math.max(...split.train.map(closeTime))).toISOString() : '1970-01-01T00:00:00.000Z';
  const common={strategyVersion:options.strategyVersion,minSamples:options.minSamples || 8,halfLifeDays:options.halfLifeDays || 21,asOf,allowedModes:[options.mode || 'paper']};
  const train=buildStrategyScorecard(split.train,{...common,reason:'train-only'});
  const policySearch=boundedPolicySearch(split.train,{seed:fingerprint(split.train.map(canonicalTrade))});
  const artifact=policySearch.winner?.artifact || routeArtifact(train);
  // Experimental replay may only reduce risk. Champion risk needs separate prospective proof.
  for(const route of Object.values(artifact.routeWeights)) route.riskHint=Math.min(1,route.riskHint);
  const artifactFingerprint=fingerprint(artifact);
  const validation=evaluateFrozenPolicy(artifact,split.validation,options);
  const test=evaluateFrozenPolicy(artifact,split.test,options);
  const trainData=split.train.map(canonicalTrade);
  const summary=datasetSummary(split.ordered);
  const config={validationFraction:num(options.validationFraction,0.3),minSamples:options.minSamples || 8,
    halfLifeDays:options.halfLifeDays || 21,embargoMs:split.embargoMs,evaluatorVersion:'search-frozen-policy-replay-4',searchBudget:6,searchAlpha:0.05,searchReturnBoundUsd:10,searchSelection:'train-hoeffding-lower-bound',mode:options.mode || 'paper'};
  const lastHoldout=Math.max(0,...split.validation.map(closeTime),...split.test.map(closeTime));
  return { forwardBindingVersion:2,type:'strategy-route-policy-model',strategyVersion:options.strategyVersion || null,datasetSummary:summary,
    datasetFingerprint:fingerprint(split.ordered.map(canonicalTrade)),trainFingerprint:fingerprint(trainData),artifactFingerprint,
    config,artifact,policySearch,trainMetrics:train.overall,validationMetrics:validation.metrics,testMetrics:test.metrics,
    evaluation:{...validation,test,searchValidation:{selectionAudit:policySearch.trials,winnerId:policySearch.winner?.id || null,selectionSource:'train-only',selectionPenalty:policySearch.winner?.selectionPenalty || 0,validation:validation.metrics,test:test.metrics,paperExperimentAllowed:true,riskIncreaseEligible:false},trainEndAt:asOf,holdoutEndAt:lastHoldout,validationIds:split.validation.map(r=>r.id),testIds:split.test.map(r=>r.id),purged:split.purged,embargoMs:split.embargoMs},
    prospectiveEvidence:{source:'candidate-tagged-forward-paper',artifactFingerprint,metrics:metricSummary([],30),rows:0,passed:false},
    walkForward:{status:'replay-only',leakageGuard:'purged-chronological-train-validation-test'},
    provenance:{source:'verified-trade-journal',mode:options.mode || 'paper',leakageGuard:'purged-chronological-train-validation-test',trainingOnly:true},
    scorecards:{train,validation:{overall:validation.metrics},full:buildStrategyScorecard(split.ordered,{...common,asOf:undefined,reason:'diagnostic-only'})} };
}
function prepareTraining(ctx={}) {
  const options={...ctx.policy,strategyVersion:ctx.strategyVersion,mode:ctx.mode};
  const candidate=buildCandidate((ctx.trades || []).slice(-4000),options);
  const outcomes=candidate.evaluation.test.outcomes;
  const monteCarlo=runTradeMonteCarlo(outcomes,{seed:candidate.datasetFingerprint,iterations:Math.min(400,num(ctx.policy?.monteCarloIterations,200)),
    initialEquity:10000,maxRuinProbabilityPct:5,maxP95DrawdownPct:8,minP05NetPnl:0});
  monteCarlo.sampleSource='untouched-test-frozen-policy-replay';
  const policySearch=candidate.policySearch;
  return {candidate,monteCarlo,policySearch};
}
async function prepareTrainingInWorker(ctx, options={}) {
  const {Worker}=require('worker_threads');
  return new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:{nexusTraining:true,ctx:{trades:(ctx.trades || []).slice(-4000),strategyVersion:ctx.strategyVersion,mode:ctx.mode,policy:ctx.policy}},resourceLimits:{maxOldGenerationSizeMb:128}});
    let settled=false;
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(result);};
    const timer=setTimeout(()=>finish(new Error('TRAINING_BUDGET_TIMEOUT')),options.timeoutMs || 10000);
    worker.once('message',message=>finish(message.error?new Error(message.error):null,message));
    worker.once('error',error=>finish(error));
    worker.once('exit',code=>{if(!settled)finish(new Error('TRAINING_WORKER_EXIT_WITHOUT_RESULT:'+code));});
  });
}

function runContinuousRetrainingCycle(ctx = {}) {
  const projectRoot = ctx.projectRoot;
  const trades = Array.isArray(ctx.trades) ? ctx.trades : [];
  const minTrades = Math.max(8, num(ctx.policy?.minTrades, 20));
  if (!projectRoot) return { ok: false, skipped: true, reason: 'missing-project-root' };
  if (trades.length < minTrades) {
    return { ok: true, skipped: true, reason: 'insufficient-verified-trades', trades: trades.length, minTrades, registry: registrySnapshot(projectRoot) };
  }
  updateForwardEvidence(projectRoot,trades);
  const prior=registrySnapshot(projectRoot);
  for(const entry of prior.entries)if(entry.status==='validated' && entry.riskIncreaseEligible)promoteChampion(projectRoot,entry.id);
  const prepared=ctx.prepared || prepareTraining(ctx);
  const candidate=prepared.candidate;
  const registered = registerCandidate(projectRoot, candidate);
  if(!registered.created)return {ok:true,skipped:true,reason:'unchanged-candidate-content',candidateId:registered.entry.id,registry:registrySnapshot(projectRoot)};
  const validated = validateCandidate(projectRoot, registered.entry.id, {
    minTrades: ctx.policy?.validationMinTrades || Math.max(5, Math.floor(minTrades * 0.2)),
    minProfitFactor: ctx.policy?.validationMinProfitFactor ?? 0.98,
    minExpectancyUsd: ctx.policy?.validationMinExpectancyUsd ?? -0.005,
    minReliability: ctx.policy?.validationMinReliability ?? 0.12,
    minScore: ctx.policy?.validationMinScore ?? 42,
    requireStableWalkForward: false
  });
  const monteCarlo=prepared.monteCarlo;
  let promotion = { promoted: false, reason: 'validation-failed' };
  if (validated.decision?.passed && monteCarlo.accepted && candidate.prospectiveEvidence.passed) {
    promotion = promoteChampion(projectRoot, registered.entry.id, {
      minScoreDelta: ctx.policy?.promotionMinScoreDelta ?? 1.5,
      minExpectancyDelta: ctx.policy?.promotionMinExpectancyDelta ?? 0,
      maxPfRegression: ctx.policy?.promotionMaxPfRegression ?? 0.15
    });
  } else if (validated.decision?.passed && !monteCarlo.accepted) {
    promotion = { promoted: false, reason: 'monte-carlo-risk-envelope-failed', monteCarlo };
  }
  const snapshot = registrySnapshot(projectRoot);
  const matchingForward=snapshot.champion ? forwardRowsForEntry(snapshot.champion,trades) : [];
  const drift = matchingForward.length>=30 ? driftSignal({overall:metricSummary(matchingForward.slice(-30),30)}, snapshot.champion, ctx.policy?.drift || {}) : {status:'insufficient-matching-forward-evidence',drift:false,reasons:[]};
  // Retire on matching forward evidence only; historical baseline trades are not candidate decay proof.
  const championRows=matchingForward;
  if (snapshot.champion && championRows.length>=30) {
    const recent=metricSummary(championRows.slice(-30),30);
    if(recent.expectancyUsd<0 && recent.profitFactor<0.9) retireModel(projectRoot,snapshot.champion.id,'forward-strategy-decay');
  }
  let rollback = { rolledBack: false, reason: 'not-needed' };
  if (championRows.length>=30 && drift.drift && snapshot.previousChampionId && ctx.policy?.autoRollback !== false) {
    rollback = rollbackChampion(projectRoot, `drift:${drift.reasons.join(',')}`);
  }
  return {
    ok: true,
    skipped: false,
    ranAt: now(),
    candidateId: registered.entry.id,
    candidateCreated: registered.created,
    validation: validated.decision,
    monteCarlo,
    policySearch:prepared.policySearch,
    promotion,
    drift,
    rollback,
    registry: registrySnapshot(projectRoot),
    trainingIsolation: 'statistical-policy-training-no-exchange-submit-no-runtime-blocking',
    leakageGuard: 'chronological-train-validation-split',
    simulationEvidencePolicy: 'bootstrap-monte-carlo-is-validation-only-never-verified-trading-evidence'
  };
}

module.exports = { buildCandidate, runContinuousRetrainingCycle, driftSignal, routeArtifact, datasetSummary, purgedSplit, evaluateFrozenPolicy, canonicalTrade, prepareTraining, prepareTrainingInWorker };
const {isMainThread,parentPort,workerData}=require('worker_threads');
if(!isMainThread && workerData?.nexusTraining) { try {parentPort.postMessage(prepareTraining(workerData.ctx));}catch(error){parentPort.postMessage({error:error.message});} }

function boundedPolicySearch(trainRows=[],options={}) {
  const seed=String(options.seed || 'fixed');
  const scales=[0.65,0.8,1],thresholds=[0,45],search=[];
  const sc=buildStrategyScorecard(trainRows,{asOf:trainRows.length?new Date(Math.max(...trainRows.map(closeTime))).toISOString():'1970-01-01',minSamples:8});
  const base=routeArtifact(sc),familySize=6,alpha=0.05;
  for(const scale of scales)for(const scoreThreshold of thresholds) {
    const artifact=JSON.parse(JSON.stringify(base));
    for(const route of Object.values(artifact.routeWeights))route.riskHint=Math.max(0.55,Math.min(1,route.score<scoreThreshold?0.55:route.riskHint*scale));
    const evaluation=evaluateFrozenPolicy(artifact,trainRows);
    const outcomes=evaluation.outcomes,returnBoundUsd=10,range=2*returnBoundUsd;
    const boundedMean=outcomes.length?outcomes.reduce((sum,x)=>sum+Math.max(-returnBoundUsd,Math.min(returnBoundUsd,x)),0)/outcomes.length:0;
    // Family-wise union bound over the six fixed trials; used in actual selection, not only displayed.
    const selectionPenalty=outcomes.length?range*Math.sqrt(Math.log(familySize/alpha)/(2*outcomes.length)):Infinity;
    const objective=outcomes.length?boundedMean-selectionPenalty-Math.max(0,evaluation.metrics.drawdown.maxDrawdownUsd)*0.01:-1e100;
    search.push({id:fingerprint({seed,scale,scoreThreshold,artifact}),scale,scoreThreshold,artifact,selectionPenalty:Number.isFinite(selectionPenalty)?selectionPenalty:null,objective});
  }
  search.sort((a,b)=>b.objective-a.objective || a.id.localeCompare(b.id));
  return {version:'bounded-safe-policy-search-2',mode:'shadow-paper-only',searchBudget:6,seed,variants:search.length,
    winner:search[0] || null,trials:search.map(t=>({id:t.id,scale:t.scale,scoreThreshold:t.scoreThreshold,selectionPenalty:t.selectionPenalty,objective:t.objective,artifactFingerprint:fingerprint(t.artifact)})),multipleTestingPenalty:Math.sqrt(2*Math.log(familySize)),
    correction:{method:'Hoeffding-family-wise-union-bound',familySize,alpha,selectionUsesPenalty:true,returnBoundUsd:10,clippedObjective:true,assumption:'independent bounded objective; temporal dependence needs prospective validation'},
    selectionSource:'train-only',validationRequired:true,liveAuthority:false,entryMutation:false};
}
module.exports.boundedPolicySearch=boundedPolicySearch;

// Quote-path replay: every signal observes only preceding quotes, executes at the
// next quote's ask, exits at bid, and pays both fees. Spot long only; no OHLC path claims.
function normalizeReplayQuotes(input=[],scope={}) {
  const seen=new Set();return input.filter(q=>{
    const at=Number(q.timeMs || Date.parse(q.time || ''));
    const venue=String(q.venueKey || q.venue || '').toLowerCase();
    if(scope.venue && venue!==scope.venue || scope.symbol && q.symbol!==scope.symbol)return false;
    if(q.historicalSeed || q.synthetic || /fallback|synthetic|simulation/.test(String(q.source)))return false;
    if(!['live_public','public','public_rest','public_ws','websocket','rest'].includes(String(q.source || '').toLowerCase()))return false;
    if(q.marketSourceVenue && String(q.marketSourceVenue).toLowerCase()!==venue)return false;
    return Number.isFinite(at) && at>0 && Number(q.bid)>0 && Number(q.ask)>=Number(q.bid) && Number.isFinite(Number(q.ask));
  }).map(q=>({...q,timeMs:Number(q.timeMs || Date.parse(q.time))})).sort((a,b)=>a.timeMs-b.timeMs).filter(q=>{if(seen.has(q.timeMs))return false;seen.add(q.timeMs);return true;}).slice(-4000);
}
// One interpreter for both historical replay and incremental public-paper execution.
function advanceEntryExit(state, q, policy={}, costs={}) {
  if(!['momentum','breakout','mean-reversion'].includes(policy.family))throw new Error('UNSUPPORTED_REPLAY_FAMILY');
  const lookback=Math.max(3,Math.min(60,num(policy.lookback,12))), threshold=Math.max(0.0001,num(policy.threshold,0.002));
  const stop=Math.max(0.001,num(policy.stopLoss,0.005)),take=Math.max(0.001,num(policy.takeProfit,0.008));
  const holdMs=Math.max(1000,Math.min(3600000,num(policy.holdMs,300000)));
  const fee=num(costs.feeRate,0.001),slip=num(costs.slippageRate,0.0002);
  if(fee<0 || fee>0.1 || slip<0 || slip>0.1)throw new Error('INVALID_REPLAY_COST');
  if(!Number.isFinite(q.timeMs) || !(Number(q.bid)>0) || !(Number(q.ask)>=Number(q.bid)))throw new Error('INVALID_POLICY_QUOTE');
  const out=JSON.parse(JSON.stringify(state || {window:[],lastAt:0,position:null,pending:null}));
  if(q.timeMs<=out.lastAt)return {state:out,reason:'duplicate-or-out-of-order',trade:null,decision:null};
  let reason='collecting-lookback',trade=null,decision=null;
  const bid=Number(q.bid)*(1-slip),ask=Number(q.ask)*(1+slip);
  if(out.lastAt && q.timeMs-out.lastAt>num(costs.maxGapMs,60000)){
    out.pending=null;out.window=[];if(out.position)out.position.dataGap=true;reason='data-gap';
  }
  out.lastAt=q.timeMs;
  if(out.position){
    const pos=out.position,move=bid/pos.entry-1;
    if(pos.dataGap || move<=-stop || move>=take || q.timeMs-pos.openedAt>=holdMs){
      const gross=(bid-pos.entry)*pos.quantity,fees=(bid+pos.entry)*pos.quantity*fee;
      trade={id:'cf-'+q.timeMs,openedAt:new Date(pos.openedAt).toISOString(),closedAt:new Date(q.timeMs).toISOString(),entryPrice:pos.entry,exitPrice:bid,quantity:pos.quantity,grossPnl:gross,fee:fees,netPnl:gross-fees,exitReason:pos.dataGap?'data-gap-protective-exit':move<=-stop?'stop':move>=take?'take-profit':'time',dataGap:!!pos.dataGap,verified:false,evidenceSource:'counterfactual-quote-replay'};
      out.position=null;reason=trade.exitReason;
    }else reason='position-managed';
  }else if(out.pending){
    const notional=Math.max(1,Math.min(100,num(costs.notionalUsd,25))),step=num(costs.stepSize);
    let quantity=notional/ask;if(step>0)quantity=Math.floor(quantity/step)*step;
    if(quantity>0 && quantity*ask>=num(costs.minNotional,5)){out.position={entry:ask,quantity,openedAt:q.timeMs,decisionAt:out.pending.timeMs};reason='paper-entry';}else reason='below-lot-or-min-notional';
    out.pending=null;
  }else if(out.window.length>=lookback){
    const past=out.window.slice(-lookback),prices=past.map(x=>(Number(x.bid)+Number(x.ask))/2),last=prices.at(-1),first=prices[0],mean=prices.reduce((a,b)=>a+b,0)/prices.length;
    const enter=policy.family==='momentum'?last/first-1>threshold:policy.family==='breakout'?last>Math.max(...prices.slice(0,-1))*(1+threshold):last/mean-1<-threshold;
    if(enter){out.pending={timeMs:q.timeMs};decision={timeMs:q.timeMs,observedThrough:past.at(-1).timeMs};reason='entry-signal-next-quote';}else reason='no-family-entry-signal';
  }
  out.window=[...out.window,{timeMs:q.timeMs,bid:Number(q.bid),ask:Number(q.ask)}].slice(-60);
  return {state:out,reason,trade,decision};
}
function replayEntryExit(quotes,policy={},costs={}) {
  let state={window:[],lastAt:0,position:null,pending:null};const trades=[],decisions=[];
  for(let i=0;i<quotes.length;i++){
    // Historical gaps cannot claim executable fill evidence. Runtime instead exits on first fresh quote.
    if(state.position && state.lastAt && quotes[i].timeMs-state.lastAt>num(costs.maxGapMs,60000)){state.position.dataGap=true;break;}
    const step=advanceEntryExit(state,quotes[i],policy,costs);state=step.state;
    if(step.trade)trades.push(step.trade);if(step.decision)decisions.push({...step.decision,index:i});
  }
  const position=state.position,last=quotes.at(-1),slip=num(costs.slippageRate,0.0002),fee=num(costs.feeRate,0.001);
  const mark=position && last?(Number(last.bid)*(1-slip)-position.entry)*position.quantity-(position.entry+Number(last.bid)*(1-slip))*position.quantity*fee:0;
  return {metrics:metricSummary(trades,8,{nowMs:last?.timeMs || 0}),trades,decisions,openPosition:position,valuationTrusted:!position?.dataGap,unrealizedNetPnl:position?.dataGap?null:mark,markedNetPnl:position?.dataGap?null:trades.reduce((s,t)=>s+t.netPnl,0)+mark,policy,policyFingerprint:fingerprint(policy),tradingEvidence:false,liveAuthority:false,source:'counterfactual-quote-path-replay',assumptions:['next-quote ask entry; bid exit; explicit two-sided fee/slippage','spot long only; no partial-fill or intrabar path proof','open position reported; no artificial profitable terminal close']};
}
module.exports.advanceEntryExit=advanceEntryExit;
function searchEntryExitPolicies(input=[],scope={},costs={}) {
  const quotes=normalizeReplayQuotes(input,scope);
  if(quotes.length<90)return {ok:true,skipped:true,reason:'insufficient-own-public-quotes',rows:quotes.length,required:90,liveAuthority:false};
  const a=Math.floor(quotes.length*0.7),b=Math.floor(quotes.length*0.85),embargoMs=60000;
  const train=quotes.slice(0,a),validation=quotes.slice(a,b).filter(q=>q.timeMs>train.at(-1).timeMs+embargoMs),test=quotes.slice(b).filter(q=>q.timeMs>quotes[b-1].timeMs+embargoMs);
  if(validation.length<20 || test.length<20)return {ok:true,skipped:true,reason:'insufficient-embargo-separated-quotes',rows:quotes.length,liveAuthority:false};
  const policies=[];for(const family of ['momentum','breakout','mean-reversion'])for(const holdMs of [60000,180000,300000])policies.push({family,lookback:12,threshold:family==='breakout'?0.0005:0.002,stopLoss:0.005,takeProfit:0.008,holdMs});
  const trials=policies.map(policy=>{const report=replayEntryExit(train,policy,costs);const bounded=report.trades.map(t=>Math.max(-10,Math.min(10,t.netPnl)));const penalty=bounded.length?20*Math.sqrt(Math.log(policies.length/0.05)/(2*bounded.length)):null;const objective=bounded.length?bounded.reduce((a,b)=>a+b,0)/bounded.length-penalty-Math.max(0,report.metrics.drawdown.maxDrawdownUsd)*0.01:-1e100;return {policy,policyFingerprint:report.policyFingerprint,metrics:report.metrics,penalty,objective};});
  trials.sort((a,b)=>b.objective-a.objective || a.policyFingerprint.localeCompare(b.policyFingerprint));const winner=trials[0];
  return {ok:true,skipped:false,version:'entry-exit-quote-replay-1',scope,costs,rows:quotes.length,selectionSource:'train-only',trials,winner,validation:replayEntryExit(validation,winner.policy,costs),test:replayEntryExit(test,winner.policy,costs),split:{train:train.length,validation:validation.length,test:test.length,embargoMs,trainEndAt:train.at(-1).timeMs,holdoutEndAt:test.at(-1).timeMs},datasetFingerprint:fingerprint(quotes),tradingEvidence:false,liveAuthority:false,correction:{familySize:9,alpha:0.05,returnBoundUsd:10,assumption:'independent bounded objective; forward validation still required'}};
}
function prepareStrategyReplayInWorker(input=[],scope={},costs={}) {
  const {Worker}=require('worker_threads');return new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:{nexusStrategyReplay:true,input:input.slice(-4000),scope,costs},resourceLimits:{maxOldGenerationSizeMb:128}});
    let settled=false;const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(result);};
    const timer=setTimeout(()=>finish(new Error('STRATEGY_REPLAY_BUDGET_TIMEOUT')),10000);
    worker.once('message',x=>finish(x.error?new Error(x.error):null,x));worker.once('error',e=>finish(e));worker.once('exit',code=>{if(!settled)finish(new Error('STRATEGY_REPLAY_WORKER_EXIT:'+code));});
  });
}
module.exports.normalizeReplayQuotes=normalizeReplayQuotes;
module.exports.replayEntryExit=replayEntryExit;
module.exports.searchEntryExitPolicies=searchEntryExitPolicies;
module.exports.prepareStrategyReplayInWorker=prepareStrategyReplayInWorker;
if(!isMainThread && workerData?.nexusStrategyReplay){try{parentPort.postMessage(searchEntryExitPolicies(workerData.input,workerData.scope,workerData.costs));}catch(e){parentPort.postMessage({error:e.message});}}
