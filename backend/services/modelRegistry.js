'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function now() { return new Date().toISOString(); }
function asArray(v) { return Array.isArray(v) ? v : []; }
function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, num(v, min))); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function defaultRegistry() {
  return {
    version: 3,
    revision: 0,
    lifecycle: ['candidate', 'validated', 'champion', 'retired'],
    championId: null,
    experimentId: null,
    previousChampionId: null,
    entries: [],
    events: [],
    updatedAt: null,
    policy: 'candidate-validated-champion-retired-with-auditable-rollback'
  };
}
function resolveFile(projectRoot, customFile) {
  return customFile || process.env.NEXUS_MODEL_REGISTRY_FILE || path.join(projectRoot, 'storage', 'model_registry_v2.json');
}
function ensureParent(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
function readRegistry(projectRoot, customFile) {
  const file = resolveFile(projectRoot, customFile);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if(!parsed || !Array.isArray(parsed.entries) || !Array.isArray(parsed.events))throw new Error('INVALID_REGISTRY_SHAPE');
    if(parsed.checksum){const {checksum,...payload}=parsed;if(fingerprint(payload)!==checksum)throw new Error('REGISTRY_CHECKSUM_MISMATCH');}
    return { ...defaultRegistry(), ...parsed, entries: asArray(parsed.entries).map(e=>({...e,artifactFingerprint:e.artifactFingerprint || fingerprint(e.artifact || {})})), events: asArray(parsed.events) };
  } catch(error) { if(error.code==='ENOENT')return defaultRegistry();throw new Error('MODEL_REGISTRY_READ_FAILED:'+error.message); }
}
function writeRegistry(projectRoot, registry, customFile) {
  const file = resolveFile(projectRoot, customFile);
  ensureParent(file);
  const next = { ...defaultRegistry(), ...registry, version:3, revision:num(registry.revision)+1, updatedAt: now(), entries: asArray(registry.entries), events: asArray(registry.events) };
  const tmp = file + '.tmp-' + process.pid;
  delete next.checksum;next.checksum=fingerprint(next);
  const fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(next,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(tmp, file);
  const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
  return next;
}
function addEvent(registry, type, details = {}) {
  registry.events = [{ id: fingerprint({ type, at: now(), details }).slice(0, 16), at: now(), type, ...details }, ...asArray(registry.events)];
}
function entryById(registry, id) { return asArray(registry.entries).find(x => x.id === id) || null; }
function champion(registry) { return registry.championId ? entryById(registry, registry.championId) : null; }
function normalizeMetrics(metrics = {}) {
  return {
    trades: num(metrics.trades),
    winRate: metrics.winRate == null ? null : num(metrics.winRate),
    profitFactor: num(metrics.profitFactor),
    expectancyUsd: num(metrics.expectancyUsd),
    netPnl: num(metrics.netPnl),
    drawdownUsd: num(metrics.drawdown?.maxDrawdownUsd ?? metrics.maxDrawdownUsd),
    reliability: clamp(metrics.reliability, 0, 1),
    score: clamp(metrics.score, 0, 100),
    lastTradeAt: metrics.lastTradeAt || null
  };
}
function registerCandidate(projectRoot, candidate = {}, options = {}) {
  const registry = readRegistry(projectRoot, options.file);
  const payload = {
    revalidationOf:candidate.revalidationOf || null,
    forwardBindingVersion: candidate.forwardBindingVersion || 1,
    type: candidate.type || 'strategy-policy-model',
    strategyVersion: candidate.strategyVersion || null,
    datasetFingerprint: candidate.datasetFingerprint || fingerprint(candidate.datasetSummary || {}),
    configFingerprint: candidate.configFingerprint || fingerprint(candidate.config || {}),
    artifact: candidate.artifact || {},
    artifactFingerprint:candidate.artifactFingerprint || fingerprint(candidate.artifact || {}),
    trainFingerprint:candidate.trainFingerprint || null,
    evaluation:candidate.evaluation || null,
    testMetrics:normalizeMetrics(candidate.testMetrics || {}),
    prospectiveEvidence:candidate.prospectiveEvidence || null,
    riskIncreaseEligible:candidate.prospectiveEvidence?.passed === true,
    trainMetrics: normalizeMetrics(candidate.trainMetrics || {}),
    validationMetrics: normalizeMetrics(candidate.validationMetrics || {}),
    walkForward: candidate.walkForward || null,
    provenance: candidate.provenance || {},
    createdAt: candidate.createdAt || now()
  };
  const {createdAt,provenance,...identity}=payload;
  const id = candidate.id || `mdl_${fingerprint({...identity,provenance:{source:provenance.source,mode:provenance.mode,leakageGuard:provenance.leakageGuard}}).slice(0, 20)}`;
  const existing = entryById(registry, id);
  if (existing) return { registry, entry: existing, created: false };
  const entry = {
    id,
    status: 'candidate',
    revision: 1,
    ...payload,
    validatedAt: null,
    promotedAt: null,
    retiredAt: null,
    retirementReason: null,
    validationDecision: null
  };
  registry.entries.unshift(entry);
  const activeExperiment=entryById(registry,registry.experimentId);
  if(entry.trainFingerprint && (!activeExperiment || activeExperiment.status==='retired' || num(activeExperiment.prospectiveEvidence?.rows)>=30))registry.experimentId=entry.id;
  addEvent(registry, 'candidate-registered', { modelId: id });
  return { registry: writeRegistry(projectRoot, registry, options.file), entry, created: true };
}
function validationDecision(entry, policy = {}) {
  const m = normalizeMetrics(entry.validationMetrics || {});
  const p = {
    minTrades: Math.max(3, num(policy.minTrades, 8)),
    minProfitFactor: num(policy.minProfitFactor, 1.02),
    minExpectancyUsd: num(policy.minExpectancyUsd, 0),
    maxDrawdownUsd: num(policy.maxDrawdownUsd, Infinity),
    minReliability: clamp(policy.minReliability ?? 0.25, 0, 1),
    minScore: clamp(policy.minScore ?? 48, 0, 100),
    requireStableWalkForward: policy.requireStableWalkForward === true
  };
  const failures = [];
  if (m.trades < p.minTrades) failures.push(`validation trades ${m.trades}/${p.minTrades}`);
  if (m.profitFactor < p.minProfitFactor) failures.push(`PF ${m.profitFactor}<${p.minProfitFactor}`);
  if (m.expectancyUsd < p.minExpectancyUsd) failures.push(`expectancy ${m.expectancyUsd}<${p.minExpectancyUsd}`);
  if (m.drawdownUsd > p.maxDrawdownUsd) failures.push(`drawdown ${m.drawdownUsd}>${p.maxDrawdownUsd}`);
  if (m.reliability < p.minReliability) failures.push(`reliability ${m.reliability}<${p.minReliability}`);
  if (m.score < p.minScore) failures.push(`score ${m.score}<${p.minScore}`);
  if (p.requireStableWalkForward && entry.walkForward?.status !== 'stable') failures.push(`walk-forward ${entry.walkForward?.status || 'missing'}`);
  return { passed: failures.length === 0, failures, metrics: m, policy: p };
}
function validateCandidate(projectRoot, id, policy = {}, options = {}) {
  const registry = readRegistry(projectRoot, options.file);
  const entry = entryById(registry, id);
  if (!entry) throw new Error(`MODEL_NOT_FOUND:${id}`);
  if (!['candidate', 'validated'].includes(entry.status)) return { registry, entry, decision: entry.validationDecision || null };
  const decision = validationDecision(entry, policy);
  entry.validationDecision = decision;
  if (decision.passed) {
    entry.status = 'validated';
    entry.validatedAt = now();
    addEvent(registry, 'candidate-validated', { modelId: id, metrics: decision.metrics });
  } else {
    addEvent(registry, 'candidate-validation-failed', { modelId: id, failures: decision.failures });
  }
  return { registry: writeRegistry(projectRoot, registry, options.file), entry, decision };
}
function promotionDecision(current, candidate, policy = {}) {
  const c = normalizeMetrics(candidate?.validationMetrics || {});
  const a = normalizeMetrics(current?.validationMetrics || current?.trainMetrics || {});
  const minScoreDelta = num(policy.minScoreDelta, current ? 1.5 : -Infinity);
  const minExpectancyDelta = num(policy.minExpectancyDelta, current ? 0 : -Infinity);
  const maxPfRegression = num(policy.maxPfRegression, 0.15);
  const reasons = [];
  if (candidate?.status !== 'validated') reasons.push('candidate-not-validated');
  if(candidate?.riskIncreaseEligible!==true || candidate?.prospectiveEvidence?.passed!==true) reasons.push('missing-positive-candidate-forward-proof');
  const forward=normalizeMetrics(candidate?.prospectiveEvidence?.metrics || {});
  if(forward.trades<30 || forward.expectancyUsd<=0 || forward.profitFactor<1.15 || forward.reliability<0.5) reasons.push('insufficient-net-positive-forward-sample');
  if (current) {
    if (c.score < a.score + minScoreDelta) reasons.push(`score-delta ${Number((c.score-a.score).toFixed(2))}<${minScoreDelta}`);
    if (c.expectancyUsd < a.expectancyUsd + minExpectancyDelta) reasons.push(`expectancy-delta ${Number((c.expectancyUsd-a.expectancyUsd).toFixed(5))}<${minExpectancyDelta}`);
    if (c.profitFactor + maxPfRegression < a.profitFactor) reasons.push('profit-factor-regression');
  }
  return { promote: reasons.length === 0, reasons, candidate: c, champion: a, policy: { minScoreDelta, minExpectancyDelta, maxPfRegression } };
}
function promoteChampion(projectRoot, id, policy = {}, options = {}) {
  const registry = readRegistry(projectRoot, options.file);
  const candidate = entryById(registry, id);
  if (!candidate) throw new Error(`MODEL_NOT_FOUND:${id}`);
  const current = champion(registry);
  const decision = promotionDecision(current, candidate, policy);
  if (!decision.promote) {
    addEvent(registry, 'promotion-rejected', { modelId: id, reasons: decision.reasons });
    return { registry: writeRegistry(projectRoot, registry, options.file), promoted: false, decision, candidate, champion: current };
  }
  if (current && current.id !== id) {
    current.status = 'retired';
    current.retiredAt = now();
    current.retirementReason = 'superseded-by-new-champion';
    registry.previousChampionId = current.id;
  }
  candidate.status = 'champion';
  candidate.promotedAt = now();
  registry.championId = candidate.id;
  addEvent(registry, 'champion-promoted', { modelId: id, previousChampionId: current?.id || null });
  return { registry: writeRegistry(projectRoot, registry, options.file), promoted: true, decision, candidate, champion: candidate };
}
function retireModel(projectRoot, id, reason = 'manual-retirement', options = {}) {
  const registry = readRegistry(projectRoot, options.file);
  const entry = entryById(registry, id);
  if (!entry) throw new Error(`MODEL_NOT_FOUND:${id}`);
  entry.status = 'retired';
  entry.retiredAt = now();
  entry.retirementReason = reason;
  if (registry.championId === id) registry.championId = null;
  addEvent(registry, 'model-retired', { modelId: id, reason });
  return { registry: writeRegistry(projectRoot, registry, options.file), entry };
}
function rollbackChampion(projectRoot, reason = 'automatic-rollback', options = {}) {
  const registry = readRegistry(projectRoot, options.file);
  const current = champion(registry);
  const previous = entryById(registry, registry.previousChampionId);
  if (previous && (previous.riskIncreaseEligible!==true || previous.retirementReason==='forward-strategy-decay'))return {registry,rolledBack:false,reason:'previous-champion-not-qualified'};
  if (!previous) return { registry, rolledBack: false, reason: 'no-previous-champion' };
  if (current) {
    current.status = 'retired';
    current.retiredAt = now();
    current.retirementReason = reason;
  }
  previous.status = 'champion';
  previous.retiredAt = null;
  previous.retirementReason = null;
  previous.promotedAt = now();
  registry.championId = previous.id;
  registry.previousChampionId = current?.id || null;
  addEvent(registry, 'champion-rollback', { modelId: previous.id, fromModelId: current?.id || null, reason });
  return { registry: writeRegistry(projectRoot, registry, options.file), rolledBack: true, champion: previous };
}
function paperRuntimeSummary(runtime){
  if(!runtime)return null;const {trades,decisions,state,...summary}=runtime;
  return {...summary,closedTradesCount:asArray(trades).length,decisionCount:asArray(decisions).length,recentTrades:asArray(trades).slice(-10),state:state?{lastAt:state.lastAt,position:state.position,pending:state.pending,windowSamples:asArray(state.window).length}:null};
}
function monitorEntry(entry){return entry?{...entry,...(entry.paperRuntime?{paperRuntime:paperRuntimeSummary(entry.paperRuntime)}:{})}:null;}
module.exports.paperRuntimeSummary=paperRuntimeSummary;
function registrySnapshot(projectRoot, options = {}) {
  const registry = readRegistry(projectRoot, options.file);
  const counts = {};
  for (const row of registry.entries) counts[row.status] = (counts[row.status] || 0) + 1;
  return {
    version: registry.version,
    revision:registry.revision,
    championId:registry.championId,
    experimentId:registry.experimentId,
    champion: monitorEntry(champion(registry)),
    previousChampionId: registry.previousChampionId,
    counts,
    entries: registry.entries.map(monitorEntry),
    events: registry.events.slice(0, 50),
    updatedAt: registry.updatedAt,
    policy: registry.policy
  };
}


// New experiments require their exact identity. Legacy sizing evidence stays readable,
// but cannot be inherited by a new revalidation trial with the same artefact.
function forwardRowsForEntry(entry,trades=[],asOf=Date.now()) {
  const {verifiedTrade}=require('./strategyScorecard');
  const boundary=Number(entry.evaluation?.holdoutEndAt || Date.parse(entry.createdAt))+Number(entry.evaluation?.embargoMs ?? 60000);
  const seen=new Set();
  return trades.filter(t=>{
    const opened=Date.parse(t.openedAt || t.submittedAt || t.time),closed=Date.parse(t.closedAt || t.time);
    const net=t.netPnl ?? t.pnl ?? t.realizedPnl;
    if(!verifiedTrade(t) || net==null || net==='' || !Number.isFinite(Number(net)) || t.candidateFingerprint!==entry.artifactFingerprint)return false;
    if(t.synthetic===true || t.historicalReplay===true || /historical|synthetic|bootstrap|counterfactual|monte.carlo/i.test(String(t.evidenceSource || t.source || '')))return false;
    if(String(t.executionMode || t.mode || 'paper').toLowerCase()!==String(entry.provenance?.mode || 'paper').toLowerCase())return false;
    if(entry.strategyVersion && t.strategyVersion!==entry.strategyVersion)return false;
    if(!(opened>boundary && closed>=opened && closed<=asOf+5000))return false;
    if(entry.forwardBindingVersion>=2 && (t.experimentId!==entry.id || t.configFingerprint!==entry.configFingerprint || t.verified!==true))return false;
    return true;
  }).sort((a,b)=>Date.parse(a.closedAt || a.time)-Date.parse(b.closedAt || b.time)).filter(t=>{
    const id=t.id || t.orderId;if(!id || seen.has(id))return false;seen.add(id);return true;
  });
}
function restoreCheckpointOrders(current=[],incoming=[],closedTrades=[]) {
  const closed=new Set(closedTrades.map(t=>String(t.orderId || t.id)));
  const terminal=new Set(['closed','cancelled','canceled','rejected','failed']);
  const rows=new Map(current.filter(o=>o.id).map(o=>[String(o.id),o]));
  for(const order of incoming){
    if(!order?.id || !Number.isFinite(Number(order.quantity ?? order.amount)) || !(Number(order.quantity ?? order.amount)>0))continue;
    const id=String(order.id),old=rows.get(id);
    if(closed.has(id) || terminal.has(String(old?.status).toLowerCase()))continue;
    const oldAt=Date.parse(old?.updatedAt || old?.submittedAt || old?.time || '') || 0;
    const newAt=Date.parse(order.updatedAt || order.submittedAt || order.time || '') || 0;
    if(old && oldAt>=newAt)continue;
    const external=String(order.executionMode || order.mode || 'paper').toLowerCase()!=='paper';
    rows.set(id,{...order,...(external?{reconciliationRequired:true,recoverySubmitAllowed:false}:{}),restoredFromCheckpoint:true});
  }
  return [...rows.values()];
}

function updateForwardEvidence(projectRoot,trades=[]) {
  const {metricSummary,verifiedTrade}=require('./strategyScorecard');
  const registry=readRegistry(projectRoot);let changed=false;
  const byFingerprint=new Map();for(const trade of trades){if(!trade.candidateFingerprint)continue;const list=byFingerprint.get(trade.candidateFingerprint) || [];list.push(trade);byFingerprint.set(trade.candidateFingerprint,list);}
  for(const entry of registry.entries) {
    if(entry.status==='retired')continue;
    const rows=forwardRowsForEntry(entry,[...(byFingerprint.get(entry.artifactFingerprint) || []),...asArray(entry.paperRuntime?.trades)]);
    const evidenceFingerprint=fingerprint(rows.map(t=>({id:t.id || t.orderId,time:t.closedAt || t.time,netPnl:t.netPnl ?? t.pnl ?? t.realizedPnl,venue:t.requestedVenue || t.venue,symbol:t.symbol,regime:t.regime || t.marketRegime,side:t.side,strategy:t.strategyKey || t.strategy || t.agentStrategy || t.strategyFamily,experimentId:t.experimentId,configFingerprint:t.configFingerprint})));
    if(evidenceFingerprint===entry.prospectiveEvidence?.evidenceFingerprint && entry.prospectiveEvidence?.routeMetrics)continue;
    const metrics=metricSummary(rows,30,{nowMs:rows.length?Date.parse(rows.at(-1).closedAt || rows.at(-1).time):0});
    const passed=rows.length>=30 && metrics.expectancyUsd>0 && metrics.profitFactor>=1.15 && metrics.reliability>=0.5;
    const routeGroups={},venueGroups={};
    for(const t of rows){const v=String(t.requestedVenue || t.venue || '').toLowerCase();const k=[v,t.symbol,t.regime || t.marketRegime,t.side,t.strategyKey || t.strategy || t.agentStrategy || t.strategyFamily].map(x=>String(x || 'UNKNOWN').toUpperCase()).join(' | ');(routeGroups[k] ||= []).push(t);(venueGroups[v] ||= []).push(t);}
    const summarizeGroups=groups=>Object.fromEntries(Object.entries(groups).map(([key,value])=>[key,metricSummary(value,30,{nowMs:rows.length?Date.parse(rows.at(-1).closedAt || rows.at(-1).time):0})]));
    entry.prospectiveEvidence={routeMetrics:summarizeGroups(routeGroups),venueMetrics:summarizeGroups(venueGroups),source:'candidate-tagged-forward-paper',rows:rows.length,metrics,passed,artifactFingerprint:entry.artifactFingerprint,evidenceFingerprint};
    entry.riskIncreaseEligible=passed;changed=true;
    if(passed && ['candidate','validated'].includes(entry.status)){
      entry.validationMetrics=normalizeMetrics(metrics);entry.validationDecision=validationDecision(entry,{minTrades:30,minProfitFactor:1.15,minExpectancyUsd:0,minReliability:0.5});
      if(entry.validationDecision.passed && entry.status!=='validated'){entry.status='validated';entry.validatedAt=now();addEvent(registry,'forward-candidate-validated',{modelId:entry.id,rows:rows.length});}
    }
    if((entry.status==='champion' || entry.paperRuntime) && rows.length>=30){const recent=metricSummary(rows.slice(-30),30);if(recent.expectancyUsd<0 && recent.profitFactor<0.9){entry.status='retired';entry.retirementReason='forward-strategy-decay';entry.retiredAt=now();if(registry.championId===entry.id)registry.championId=null;addEvent(registry,'strategy-decay-retired',{modelId:entry.id,metrics:recent});}}
  }
  return changed?writeRegistry(projectRoot,registry):registry;
}
function registryPromotionPolicy(registry={},input={}) {
  const c=registry.champion || (registry.entries || []).find(e=>e.id===registry.championId);
  const venue=String(input.venue || '').toLowerCase(),mode=String(input.mode || 'paper').toLowerCase();
  const key=[venue,input.symbol,input.regime,input.side,input.strategy].map(x=>String(x || 'UNKNOWN').toUpperCase()).join(' | ');
  const route=c?.prospectiveEvidence?.routeMetrics?.[key],venueEvidence=c?.prospectiveEvidence?.venueMetrics?.[venue];
  const qualified=m=>m && m.trades>=30 && m.expectancyUsd>0 && m.profitFactor>=1.15 && m.reliability>=0.5;
  const sameMode=c?.provenance?.mode===mode;
  const eligible=c?.status==='champion' && c?.riskIncreaseEligible===true && c?.prospectiveEvidence?.passed===true && sameMode && qualified(venueEvidence) && (!input.strategy || qualified(route));
  return {version:'common-registry-promotion-policy-1',registryChampionId:c?.id || null,experimentId:registry.experimentId || null,
    riskIncreaseEligible:!!eligible,scope:eligible?'own-venue-route-forward-qualified':'shadow-paper-ranking-only',
    shadowCannotPromoteRisk:true,mode,venue,routeKey:key,routeEvidence:route || null,venueEvidence:venueEvidence || null,
    reason:eligible?'own-forward-net-positive':'missing-own-mode-venue-route-forward-proof'};
}
function openRevalidationTrial(projectRoot,id) {
  const r=readRegistry(projectRoot),parent=entryById(r,id);
  if(!parent || parent.status!=='retired')return {ok:false,reason:'retired-model-required'};
  const existing=r.entries.find(e=>e.revalidationOf===id && ['candidate','validated'].includes(e.status));
  if(existing)return {ok:true,created:false,entry:existing,registry:r};
  const generation=r.entries.filter(e=>e.revalidationOf===id).length+1;
  const openedAt=now(),artifact=JSON.parse(JSON.stringify(parent.artifact));
  for(const weight of Object.values(artifact.routeWeights || {}))weight.riskHint=Math.max(0.55,Math.min(1,num(weight.riskHint,0.82)));
  const trial={id:'trial_'+fingerprint({parent:id,generation,artifact}).slice(0,20),revalidationOf:id,type:parent.type,
    forwardBindingVersion:2,strategyVersion:parent.strategyVersion,datasetFingerprint:parent.datasetFingerprint,trainFingerprint:parent.trainFingerprint || fingerprint(artifact),
    artifact,config:{parent:id,generation,mode:'paper',liveAuthority:false},createdAt:openedAt,
    evaluation:{holdoutEndAt:Date.parse(openedAt),embargoMs:60000,tradingEvidence:false,riskIncreaseEligible:false,source:'fresh-forward-revalidation'},
    provenance:{mode:'paper',source:'retired-model-new-forward-trial',trainingOnly:true,leakageGuard:'post-retirement-new-forward-only'}};
  const registered=registerCandidate(projectRoot,trial);const next=readRegistry(projectRoot);
  addEvent(next,'revalidation-trial-opened',{modelId:registered.entry.id,parentModelId:id,generation,mode:'paper',riskIncreaseEligible:false});
  const saved=writeRegistry(projectRoot,next);
  return {ok:true,created:true,entry:registered.entry,registry:saved,activated:saved.experimentId===registered.entry.id};
}
function exportDurableBundle(projectRoot, config = {}, options={}) {
  const registry=readRegistry(projectRoot,options.file);
  const body={schemaVersion:3,revision:num(registry.revision),registry,config,configFingerprint:fingerprint(config)};
  return {...body,checksum:fingerprint(body)};
}
function verifyBundle(bundle) {
  if(!bundle || bundle.schemaVersion!==3) return false;
  const {checksum,...body}=bundle;
  if(checksum!==fingerprint(body) || bundle.configFingerprint!==fingerprint(bundle.config))return false;
  const r=bundle.registry;
  if(!r || !Array.isArray(r.entries) || !Array.isArray(r.events) || !Array.isArray(r.lifecycle) || !Number.isSafeInteger(r.revision) || r.revision<0 || bundle.revision!==r.revision)return false;
  if(new Set(r.entries.map(e=>e.id)).size!==r.entries.length || r.entries.some(e=>!e.id || !r.lifecycle.includes(e.status)))return false;
  for(const id of [r.championId,r.previousChampionId,r.experimentId].filter(Boolean)) if(!r.entries.some(e=>e.id===id))return false;
  return r.entries.every(e=>e.artifactFingerprint===fingerprint(e.artifact));
}
function restoreDurableBundle(projectRoot,bundle,localBundle=null,options={}) {
  if(!verifyBundle(bundle))return {ok:false,reason:'invalid-bundle-checksum-or-shape'};
  const local=readRegistry(projectRoot,options.file);
  if(localBundle && !verifyBundle(localBundle))return {ok:false,reason:'invalid-local-bundle'};
  const remote=bundle.registry;
  const localRev=num(local.revision),remoteRev=num(remote.revision);
  const localTime=Date.parse(local.updatedAt || '') || 0,remoteTime=Date.parse(remote.updatedAt || '') || 0;
  if(local.entries.length && (localRev>remoteRev || (localRev===remoteRev && localTime>remoteTime)))return {ok:true,restored:false,reason:'newer-local-revision',registry:local};
  if(local.entries.length && localRev===remoteRev && localTime===remoteTime && fingerprint(local)!==fingerprint(remote))return {ok:false,reason:'same-revision-conflict',registry:local};
  if(localBundle && localRev===remoteRev && fingerprint(local)===fingerprint(remote) && localBundle.configFingerprint!==bundle.configFingerprint)return {ok:false,reason:'same-registry-config-conflict',registry:local};
  const file=resolveFile(projectRoot,options.file); ensureParent(file);
  const temp=file+'.restore-'+process.pid;fs.writeFileSync(temp,JSON.stringify(remote));fs.renameSync(temp,file);
  return {ok:true,restored:true,registry:remote,config:bundle.config,checksum:bundle.checksum};
}
module.exports = {
  paperRuntimeSummary,forwardRowsForEntry,restoreCheckpointOrders,registryPromotionPolicy,openRevalidationTrial,exportDurableBundle,verifyBundle,restoreDurableBundle,updateForwardEvidence,
  fingerprint,
  readRegistry,
  writeRegistry,
  registerCandidate,
  validateCandidate,
  promoteChampion,
  retireModel,
  rollbackChampion,
  registrySnapshot,
  validationDecision,
  promotionDecision,
  normalizeMetrics
};

// Entry/exit experiments have independent virtual capital; never counted as main account PnL.
function registerPaperStrategy(projectRoot, report, strategyVersion) {
  if(!report?.ok || report.skipped || report.selectionSource!=='train-only' || !report.winner?.policy)return {ok:false,reason:'replay-winner-required'};
  const scope=report.scope;
  if(!scope?.venue || !scope?.symbol)return {ok:false,reason:'exact-own-scope-required'};
  const artifact={kind:'entry-exit-policy',policy:report.winner.policy,scope,costs:report.costs};
  const config={...artifact,initialCapitalUsd:250,maxDrawdownUsd:10,maxClosedTrades:2000};
  const created=registerCandidate(projectRoot,{type:'entry-exit-policy',strategyVersion,forwardBindingVersion:2,artifact,configFingerprint:fingerprint(config),datasetFingerprint:report.datasetFingerprint,trainFingerprint:report.datasetFingerprint,trainMetrics:report.winner.metrics,validationMetrics:report.validation.metrics,testMetrics:report.test.metrics,evaluation:{holdoutEndAt:report.split.holdoutEndAt,embargoMs:report.split.embargoMs},provenance:{source:'own-public-quote-train-only',mode:'paper',scope}});
  const r=readRegistry(projectRoot),entry=entryById(r,created.entry.id);
  if(!entry.paperRuntime){entry.paperRuntime={config,configHash:entry.configFingerprint,state:{window:[],lastAt:0,position:null,pending:null},trades:[],decisions:[],realizedNetPnl:0,equityUsd:250,peakEquityUsd:250,status:'waiting-forward-quotes'};addEvent(r,'paper-strategy-activated',{modelId:entry.id,scope});writeRegistry(projectRoot,r);}
  return {ok:true,id:entry.id,created:created.created,executionMode:'paper',liveAuthority:false};
}
function paperStrategyTick(projectRoot, quotes=[], options={}) {
  const r=readRegistry(projectRoot),at=Number(options.nowMs || Date.now());let changed=false;
  const {normalizeReplayQuotes,advanceEntryExit}=require('./continuousRetraining');
  const results=[];
  for(const entry of r.entries.filter(e=>e.artifact?.kind==='entry-exit-policy' && e.paperRuntime && e.status!=='retired').slice(0,12)){
    const rt=entry.paperRuntime,scope=entry.artifact.scope;
    if(rt.configHash!==entry.configFingerprint || fingerprint(rt.config)!==entry.configFingerprint || fingerprint(entry.artifact)!==entry.artifactFingerprint)throw new Error('PAPER_CONFIG_INTEGRITY');
    let reason=options.blockedReason || null;
    if(!reason && rt.equityUsd<5 && !rt.state.position)reason='experiment-capital-exhausted';
    if(!reason && rt.trades.length>=rt.config.maxClosedTrades)reason='journal-capacity-reached';
    if(!reason && rt.peakEquityUsd-rt.equityUsd>=rt.config.maxDrawdownUsd && !rt.state.position)reason='experiment-drawdown-cap';
    const boundary=Number(entry.evaluation.holdoutEndAt)+Number(entry.evaluation.embargoMs);
    const own=normalizeReplayQuotes(quotes,scope).filter(q=>q.quoteObserved===true && q.timeMs>Math.max(rt.state.lastAt,boundary) && q.timeMs<=at+1000 && at-q.timeMs<=15000).slice(-4);
    if(!reason && !own.length)reason='no-new-fresh-own-public-quote';
    if(!reason){
      for(const q of own){
        const previous=rt.state.position;
        const step=advanceEntryExit(rt.state,q,entry.artifact.policy,{...entry.artifact.costs,notionalUsd:Math.min(25,Math.max(0,rt.equityUsd)*0.1)});
        rt.state=step.state;reason=step.reason;rt.lastQuoteAt=new Date(q.timeMs).toISOString();
        if(step.decision){rt.decisions=[...rt.decisions,{...step.decision,experimentId:entry.id,configFingerprint:entry.configFingerprint}].slice(-100);rt.lastDecisionAt=new Date(q.timeMs).toISOString();}
        if(!previous && step.state.position)rt.lastEntryAt=new Date(q.timeMs).toISOString();
        if(step.trade){
          const t={...step.trade,id:entry.id+':'+q.timeMs,orderId:entry.id+':'+step.trade.openedAt,mode:'paper',executionMode:'paper',venue:scope.venue,requestedVenue:scope.venue,symbol:scope.symbol,side:'BUY',strategy:entry.artifact.policy.family,strategyVersion:entry.strategyVersion,experimentId:entry.id,configFingerprint:entry.configFingerprint,candidateFingerprint:entry.artifactFingerprint,verified:!step.trade.dataGap,evidenceSource:'runtime-public-paper-forward',accountScope:'isolated-paper-experiment',reconciled:true};
          rt.trades.push(t);rt.realizedNetPnl+=t.netPnl;rt.equityUsd=rt.config.initialCapitalUsd+rt.realizedNetPnl;rt.peakEquityUsd=Math.max(rt.peakEquityUsd,rt.equityUsd);rt.lastCloseAt=t.closedAt;
        }
      }
    }
    if(rt.status!==reason || own.length && !options.blockedReason){rt.status=reason;rt.lastTickAt=new Date(at).toISOString();changed=true;}
    results.push({id:entry.id,scope,status:reason,closedTrades:rt.trades.length,equityUsd:rt.equityUsd,position:rt.state.position,lastQuoteAt:rt.lastQuoteAt || null});
  }
  if(changed){writeRegistry(projectRoot,r);const updated=updateForwardEvidence(projectRoot,options.trades || []);for(const e of updated.entries.filter(x=>x.paperRuntime && x.status==='validated' && x.prospectiveEvidence?.passed)){if(promotionDecision(champion(updated),e).promote)promoteChampion(projectRoot,e.id);}}
  return {ok:true,experiments:results,executionMode:'paper',liveAuthority:false,accountScope:'isolated-paper-experiment'};
}
module.exports.registerPaperStrategy=registerPaperStrategy;
module.exports.paperStrategyTick=paperStrategyTick;

// Optional monitoring cache: never used as execution authority or a source of trades.
class RedisRestHotCache {
  constructor({url='',token='',fetcher=global.fetch,clock=Date.now}={}){this.url=url.replace(/\/$/,'');this.token=token;this.fetcher=fetcher;this.clock=clock;this.status={configured:!!(url&&token),verified:false};if(url && new URL(url).protocol!=='https:')throw new Error('CACHE_HTTPS_REQUIRED');}
  async command(args){if(!this.status.configured)throw new Error('CACHE_NOT_CONFIGURED');const response=await this.fetcher(this.url,{method:'POST',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(3000)});if(!response.ok)throw new Error('CACHE_HTTP_'+response.status);const body=await response.json();if(body.error)throw new Error('CACHE_COMMAND_FAILED');return body.result;}
  async put(key,payload,ttlSeconds=60){const ttl=Math.max(1,Math.min(3600,Math.floor(ttlSeconds)));const value={schemaVersion:1,expiresAt:this.clock()+ttl*1000,payload,checksum:fingerprint(payload)};const result=await this.command(['SET','nexus:monitor:'+key,JSON.stringify(value),'EX',ttl]);if(result!=='OK')throw new Error('CACHE_WRITE_NOT_ACKNOWLEDGED');this.status={...this.status,verified:true,lastWriteAt:this.clock()};return value;}
  async get(key){const raw=await this.command(['GET','nexus:monitor:'+key]);if(raw===null)return null;const value=typeof raw==='string'?JSON.parse(raw):raw;if(value.schemaVersion!==1 || value.checksum!==fingerprint(value.payload))throw new Error('CACHE_CORRUPT_PAYLOAD');if(value.expiresAt<=this.clock())return null;return value.payload;}
}
class SupabaseArtifactArchive {
  constructor({url='',key='',bucket='',fetcher=global.fetch}={}){this.url=url.replace(/\/$/,'');this.key=key;this.bucket=bucket;this.fetcher=fetcher;this.configured=!!(url&&key&&bucket);if(url && new URL(url).protocol!=='https:')throw new Error('ARCHIVE_HTTPS_REQUIRED');if(bucket && !/^[a-zA-Z0-9_-]+$/.test(bucket))throw new Error('INVALID_ARCHIVE_BUCKET');}
  headers(){return {Authorization:'Bearer '+this.key,apikey:this.key,'Content-Type':'application/json','x-upsert':'false'};}
  uri(hash){if(!/^[a-f0-9]{64}$/.test(hash))throw new Error('INVALID_ARCHIVE_HASH');return this.url+'/storage/v1/object/'+this.bucket+'/models/'+hash+'.json';}
  async read(hash){if(!this.configured)throw new Error('ARCHIVE_NOT_CONFIGURED');const response=await this.fetcher(this.url+'/storage/v1/object/authenticated/'+this.bucket+'/models/'+hash+'.json',{headers:this.headers(),signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('ARCHIVE_READ_HTTP_'+response.status);const text=await response.text();if(Buffer.byteLength(text)>5*1024*1024)throw new Error('ARCHIVE_SIZE_LIMIT');const payload=JSON.parse(text);if(fingerprint(payload)!==hash || !verifyBundle(payload))throw new Error('ARCHIVE_HASH_OR_BUNDLE_INVALID');return payload;}
  async save(bundle){if(!this.configured)throw new Error('ARCHIVE_NOT_CONFIGURED');if(!verifyBundle(bundle))throw new Error('INVALID_ARCHIVE_BUNDLE');
    const secretKeys=value=>value && typeof value==='object' && Object.entries(value).some(([k,v])=>/^(password|secret|token|apiKey|serviceRoleKey)$/i.test(k) || secretKeys(v));if(secretKeys(bundle))throw new Error('ARCHIVE_SECRET_FIELD_REJECTED');
    const text=JSON.stringify(bundle);if(Buffer.byteLength(text)>5*1024*1024)throw new Error('ARCHIVE_SIZE_LIMIT');const hash=fingerprint(bundle);const response=await this.fetcher(this.uri(hash),{method:'POST',headers:this.headers(),body:text,signal:AbortSignal.timeout(5000)});if(!response.ok && ![400,409].includes(response.status))throw new Error('ARCHIVE_WRITE_HTTP_'+response.status);await this.read(hash);return {hash,uri:'supabase-private://'+this.bucket+'/models/'+hash+'.json',verified:true,bytes:Buffer.byteLength(text)};
  }
}
module.exports.RedisRestHotCache=RedisRestHotCache;
module.exports.SupabaseArtifactArchive=SupabaseArtifactArchive;
