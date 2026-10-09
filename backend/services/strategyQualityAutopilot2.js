'use strict';
const {registryPromotionPolicy}=require('./modelRegistry');

function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, num(v, min))); }
function routeKey(input = {}) {
  return [input.venue, input.symbol, input.regime, input.side, input.strategy]
    .map(v => String(v || 'UNKNOWN').trim().toUpperCase()).join(' | ');
}
function rowMap(scorecard = {}) {
  return new Map((Array.isArray(scorecard.routes) ? scorecard.routes : []).map(row => [row.key, row]));
}
function recommendation(scorecard = {}, registry = {}, input = {}, policy = {}) {
  const key = routeKey(input);
  const route = rowMap(scorecard).get(key) || null;
  const promotion=registryPromotionPolicy(registry,input);
  const champion = promotion.riskIncreaseEligible ? registry.champion : null;
  const experimental=(registry.entries || []).find(e=>e.id===registry.experimentId && ['candidate','validated'].includes(e.status) && e.artifact?.routeWeights?.[key] && e.provenance?.mode===String(input.mode || 'paper').toLowerCase());
  const championRoute = champion?.artifact?.routeWeights?.[key] || null;
  const minTrades = Math.max(3, num(policy.minTrades, scorecard.minSamples || 8));
  const minReliability = clamp(policy.minReliability ?? 0.30, 0, 1);
  let riskMultiplier = 1;
  let confidenceLiftPct = 0;
  let state = 'neutral';
  const reasons = [];
  if (!route || route.trades < minTrades || num(route.reliability) < minReliability) {
    state = 'warmup';
    riskMultiplier = 0.82;
    reasons.push('insufficient-qualified-route-evidence');
  } else if (route.expectancyUsd < 0 || route.profitFactor < 0.90) {
    state = 'de-rated';
    riskMultiplier = clamp(0.78 - num(route.reliability) * 0.18, 0.55, 0.78);
    confidenceLiftPct = 4;
    reasons.push('negative-cost-adjusted-route-evidence');
  } else if (route.expectancyUsd > 0 && route.profitFactor >= 1.15 && num(route.reliability) >= 0.55) {
    state = 'qualified-positive';
    riskMultiplier = clamp(1 + num(route.reliability) * 0.08, 1.02, 1.08);
    reasons.push('positive-qualified-route-evidence');
  }
  if (championRoute) {
    riskMultiplier = clamp((riskMultiplier + num(championRoute.riskHint, 1)) / 2, 0.55, 1.08);
    reasons.push('champion-route-policy-blend');
  }
  if(!champion)riskMultiplier=Math.min(1,riskMultiplier);
  if(experimental){riskMultiplier=Math.min(riskMultiplier,1,num(experimental.artifact.routeWeights[key].riskHint,0.82));reasons.push('experimental-paper-policy-reduction-only');}
  const drift = registry?.drift || null;
  if (drift?.drift) {
    riskMultiplier = Math.min(riskMultiplier, 0.70);
    confidenceLiftPct = Math.max(confidenceLiftPct, 5);
    state = 'drift-protective';
    reasons.push('model-drift-protection');
  }
  return {
    version: 'strategy-quality-autopilot-2.0',
    authority: 'bounded-risk-only-no-entry-generation',
    key,
    state,
    riskMultiplier: Number(riskMultiplier.toFixed(3)),
    confidenceLiftPct: Number(confidenceLiftPct.toFixed(1)),
    routeEvidence: route,
    promotionPolicy:promotion,
    championRoute: championRoute || null,
    experimentId:experimental?.id || champion?.id || null,
    configFingerprint:experimental?.configFingerprint || champion?.configFingerprint || null,
    candidateFingerprint:experimental?.artifactFingerprint || (championRoute?champion?.artifactFingerprint:null) || null,
    frozenRiskHint:experimental?.artifact?.routeWeights?.[key]?.riskHint ?? championRoute?.riskHint ?? null,
    riskIncreaseEligible:champion?.riskIncreaseEligible===true,
    reasons,
    policy: { minTrades, minReliability, maxBoost: 1.08, minRisk: 0.55 }
  };
}
function summarize(scorecard = {}, registry = {}) {
  const routes = Array.isArray(scorecard.routes) ? scorecard.routes : [];
  const qualified = routes.filter(r => r.sampleStatus === 'qualified' && num(r.reliability) >= 0.3);
  const positive = qualified.filter(r => r.expectancyUsd > 0 && r.profitFactor >= 1.05);
  const weak = qualified.filter(r => r.expectancyUsd <= 0 || r.profitFactor < 0.95);
  return {
    version: 'strategy-quality-autopilot-2.0',
    status: registry?.drift?.drift ? 'drift-protective' : weak.length > positive.length ? 'cautious' : positive.length ? 'active' : 'warmup',
    qualifiedRoutes: qualified.length,
    positiveRoutes: positive.length,
    weakRoutes: weak.length,
    championId: registry?.champion?.id || null,
    authority: 'bounded-risk-only-no-entry-generation',
    note: 'A v2 autopilot csak bizonyított route-minőség alapján, szűk tartományban módosíthat risk/confidence paramétert; belépést nem generál.'
  };
}

module.exports = { recommendation, summarize, routeKey };
