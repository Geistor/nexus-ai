'use strict';
function arr(v){ return Array.isArray(v) ? v : []; }
function clamp(v,min,max){ const n=Number(v); return Math.max(min,Math.min(max,Number.isFinite(n)?n:min)); }
function buildMetaSupervisor2(input = {}) {
  const mesh = input.mesh || { venues:{} };
  const rows = Object.values(mesh.venues || {});
  const scored = rows.map(row => {
    const perf = row.performance || {};
    const pf = Number(perf.profitFactor || 0);
    const wr = Number(perf.weightedWinRate ?? perf.winRate ?? 0);
    const samples = Number(perf.effectiveSamples ?? perf.trades ?? 0);
    const qualified = Number(row.routeEvidence?.qualifiedRoutes || 0);
    let score = 45;
    if (row.learningEligible) score += 10; else score -= 35;
    score += clamp((pf - 1) * 14, -14, 18);
    score += clamp((wr - 50) * 0.22, -10, 10);
    score += clamp(samples / 3, 0, 10);
    score += clamp(qualified * 2, 0, 8);
    score = clamp(score, 0, 100);
    return { venue:row.venue, score:Number(score.toFixed(2)), learningEligible:row.learningEligible, privateReadConnected:row.privateReadConnected, executionEligible:row.privateExecutionEnabled, currentRiskBudgetUsd:Number(row.capital?.riskBudgetUsd || 0), currentTargetRiskSharePct:Number(row.capital?.targetRiskSharePct || 0) };
  });
  const eligible = scored.filter(r => r.learningEligible);
  const denom = eligible.reduce((s,r) => s + Math.max(1,r.score),0) || 1;
  for (const row of scored) {
    row.recommendedRiskSharePct = row.learningEligible ? Number((Math.max(1,row.score)/denom*100).toFixed(2)) : 0;
    row.allocationReason = !row.learningEligible ? 'own-venue-market-unavailable' : row.score >= 65 ? 'stronger-verified-evidence' : row.score >= 45 ? 'normal-learning-budget' : 'de-rated-learning-budget';
  }
  scored.sort((a,b)=>b.score-a.score);
  return {
    version:'meta-supervisor-2.0',
    authority:'risk-budget-recommendation-only',
    ranking:scored,
    selectedLearningVenue:scored.find(r=>r.learningEligible)?.venue || null,
    selectedExecutionVenue:scored.find(r=>r.executionEligible)?.venue || null,
    transferAuthority:'none',
    policy:'allocate-risk-budget-not-funds; explicit-transfer-remains-separate',
    generatedAt:new Date().toISOString()
  };
}
module.exports={ buildMetaSupervisor2 };
function allocationAudit(previous=[],current=[],reason='runtime',at=new Date().toISOString()) {
  const old=new Map(previous.map(r=>[r.venue,r]));return current.flatMap(row=>{
    const before=old.get(row.venue);if(!before)return [];
    const changes=[];for(const field of ['currentRiskBudgetUsd','recommendedRiskSharePct']){
      const from=Number(before[field]),to=Number(row[field]);if(Number.isFinite(from)&&Number.isFinite(to)&&Math.abs(from-to)>0.0001)changes.push({venue:row.venue,field,from,to,delta:to-from,at,reason,allocationReason:row.allocationReason,score:row.score,executionEligible:!!row.executionEligible,authority:field==='currentRiskBudgetUsd'?'observed-risk-budget-change':'recommendation-only',transferAuthority:'none'});
    }return changes;
  });
}
module.exports.allocationAudit=allocationAudit;
