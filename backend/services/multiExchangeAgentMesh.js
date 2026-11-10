'use strict';

function arr(v){ return Array.isArray(v) ? v : []; }
function obj(v){ return v && typeof v === 'object' ? v : {}; }
function norm(v){ return String(v || '').trim().toLowerCase(); }

function buildAgentMesh(input = {}) {
  const venues = arr(input.venues).map(norm).filter(Boolean);
  const exchanges = obj(input.exchanges);
  const capital = obj(input.venueCapital?.venues || input.venueCapital);
  const agents = obj(input.venueAgents?.agents || input.venueAgents);
  const freshness = obj(input.freshMarkets);
  const scorecard = input.scorecard || {};
  const rows = {};
  for (const venue of venues) {
    const ex = obj(exchanges[venue]);
    const cap = obj(capital[venue]);
    const agent = obj(agents[venue]);
    const market = obj(freshness[venue] || cap.market);
    const publicMarketConnected = Number(market.freshMarketCount ?? market.fresh ?? 0) > 0;
    const privateReadConnected = ex.privateAuthVerified === true || ex.privateAuth === true || /VERIFIED|OK/i.test(String(ex.privateAuthStatus || ''));
    const executionEligible = privateReadConnected && cap.tradeAllowed !== false && input.liveExecutionEnabled === true;
    const routeRows = arr(scorecard.routes).filter(r => norm(r?.dimensions?.venue) === venue);
    rows[venue] = {
      venue,
      agentId: agent.agentId || `venue-agent-${venue}`,
      status: publicMarketConnected ? (agent.status || 'learning-active') : 'market-offline',
      publicMarketConnected,
      privateReadConnected,
      privateExecutionEnabled: executionEligible,
      learningEligible: publicMarketConnected,
      executionEligibility: executionEligible ? 'enabled-by-explicit-live-authority' : privateReadConnected ? 'read-only-or-live-locked' : 'no-private-auth',
      market: { fresh: Number(market.freshMarketCount ?? market.fresh ?? 0), expected: Number(market.expectedMarketCount ?? market.expected ?? 0) },
      capital: {
        equityUsd: Number(cap.equityUsd || 0),
        availableCapitalUsd: Number(cap.availableCapitalUsd || 0),
        riskBudgetUsd: Number(cap.riskBudgetUsd || 0),
        targetRiskSharePct: Number(cap.targetRiskSharePct || 0)
      },
      performance: agent.performance || cap.performance || null,
      routeEvidence: { routes: routeRows.length, qualifiedRoutes: routeRows.filter(r => r.sampleStatus === 'qualified').length },
      learningSourcePolicy: 'own-venue-public-market-plus-own-venue-verified-trades-only',
      capitalIsolation: 'strict-no-cross-venue-borrowing',
      transferAuthority: 'none',
      lastUpdatedAt: new Date().toISOString()
    };
  }
  return {
    version: 'multi-exchange-agent-mesh-2.0',
    enabled: true,
    venues: rows,
    learningVenues: Object.values(rows).filter(r => r.learningEligible).map(r => r.venue),
    privateReadVenues: Object.values(rows).filter(r => r.privateReadConnected).map(r => r.venue),
    executionVenues: Object.values(rows).filter(r => r.privateExecutionEnabled).map(r => r.venue),
    policy: 'independent-venue-agents-own-data-own-capital-no-fake-cross-venue-learning',
    generatedAt: new Date().toISOString()
  };
}

module.exports = { buildAgentMesh };

function buildGlobalLearningCoordinator(input = {}) {
  const mesh = obj(input.mesh);
  const scorecard = obj(input.scorecard);
  const routes = arr(scorecard.routes);
  const byPattern = new Map();
  for (const row of routes) {
    const d = obj(row.dimensions);
    const venue = norm(d.venue);
    if (!venue || !mesh.venues?.[venue]?.learningEligible) continue;
    const patternKey = [String(d.regime || 'UNKNOWN').toUpperCase(), String(d.side || 'UNKNOWN').toUpperCase(), String(d.strategy || 'UNKNOWN').toUpperCase()].join(' | ');
    if (!byPattern.has(patternKey)) byPattern.set(patternKey, []);
    byPattern.get(patternKey).push({
      venue,
      symbol: String(d.symbol || 'UNKNOWN').toUpperCase(),
      trades: Number(row.trades || 0),
      reliability: Number(row.reliability || 0),
      expectancyUsd: Number(row.expectancyUsd || 0),
      profitFactor: Number(row.profitFactor || 0),
      sampleStatus: row.sampleStatus || 'warming-up',
      sourceMode: row.mode || row.executionMode || null
    });
  }
  const patterns = [];
  for (const [key, rows] of byPattern.entries()) {
    const qualified = rows.filter(r => r.sampleStatus === 'qualified' && r.reliability >= 0.5);
    const positive = qualified.filter(r => r.expectancyUsd > 0 && r.profitFactor >= 1.05);
    const venueCount = new Set(qualified.map(r => r.venue)).size;
    const transferable = positive.length >= 2 && new Set(positive.map(r => r.venue)).size >= 2;
    patterns.push({
      key,
      transferable,
      generalizationState: transferable ? 'cross-venue-pattern-candidate' : venueCount >= 2 ? 'mixed-cross-venue-evidence' : 'local-only',
      supportingVenues: [...new Set(positive.map(r => r.venue))],
      observedVenues: [...new Set(rows.map(r => r.venue))],
      samples: rows.reduce((s,r)=>s+r.trades,0),
      provenance: rows,
      riskAuthority: 'none-until-target-venue-local-validation',
      executionExperienceTransfer: false,
      capitalTransfer: false
    });
  }
  patterns.sort((a,b) => Number(b.transferable)-Number(a.transferable) || b.samples-a.samples);
  const venueValidation = {};
  for (const venue of Object.keys(mesh.venues || {})) {
    venueValidation[venue] = {
      venue,
      localValidationRequired: true,
      importedPatternCount: patterns.filter(p => p.transferable && !p.supportingVenues.includes(venue)).length,
      policy: 'imported-patterns-may-inform-shadow-ranking-only-until-local-proof'
    };
  }
  return {
    version:'global-learning-coordinator-1.0',
    generatedAt:new Date().toISOString(),
    enabled:true,
    patterns:patterns.slice(0,80),
    transferablePatterns:patterns.filter(p=>p.transferable).length,
    venueValidation,
    provenancePolicy:'origin-venue-mode-fee-liquidity-funding-and-execution-remain-separated',
    learningAuthority:'shadow-ranking-only-for-imported-patterns',
    executionAuthority:'none',
    capitalAuthority:'none'
  };
}

module.exports.buildGlobalLearningCoordinator = buildGlobalLearningCoordinator;
