function num(v, d = 0) { return Number.isFinite(Number(v)) ? Number(v) : d; }

function getVenueBalances(state) {
  return state.venueBalances || {};
}

function computeVenueExposure(state) {
  const out = {};
  for (const pos of Object.values(state.openPositions || {})) {
    const venue = pos.venue || 'unknown';
    const usd = Math.abs(num(pos.entry) * num(pos.size));
    out[venue] = (out[venue] || 0) + usd;
  }
  return out;
}

function computeSymbolExposure(state) {
  const out = {};
  for (const pos of Object.values(state.openPositions || {})) {
    const symbol = pos.symbol || 'unknown';
    const usd = Math.abs(num(pos.entry) * num(pos.size));
    out[symbol] = (out[symbol] || 0) + usd;
  }
  return out;
}

function venuePerformanceScore(state, venue) {
  const trades = (state.closedTrades || []).filter(t => (t.venue || 'unknown') === venue).slice(0, 50);
  if (!trades.length) return 0.5;
  const wins = trades.filter(t => num(t.pnl) > 0).length;
  const net = trades.reduce((s, t) => s + num(t.pnl), 0);
  const winRate = wins / trades.length;
  let score = 0.45 + winRate * 0.35 + Math.max(-0.15, Math.min(0.15, net / 1000));
  return Math.max(0.1, Math.min(1.0, Number(score.toFixed(4))));
}

function computeVenueCapitalPlan(ctx) {
  const balances = getVenueBalances(ctx.state);
  const exposure = computeVenueExposure(ctx.state);
  const venues = Array.from(new Set([
    ...Object.keys(balances || {}),
    ...Object.keys(ctx.state.exchangeConnections || {}),
    ...Object.keys(exposure || {})
  ]));

  const rows = venues.map(venue => {
    const balanceUsd = num(balances?.[venue]?.totalUsd || balances?.[venue]?.equityUsd || balances?.[venue]?.usd || 0, 0);
    const exposureUsd = num(exposure[venue], 0);
    const perfScore = venuePerformanceScore(ctx.state, venue);
    const freeUsd = Math.max(0, balanceUsd - exposureUsd);
    const healthScore = num(ctx.state.venueHealth?.[venue]?.score, 50) / 100;
    const score = Math.max(0.05, Math.min(1.0, (perfScore * 0.55) + (healthScore * 0.25) + (Math.min(1, freeUsd / Math.max(1, balanceUsd || 1)) * 0.20)));
    return {
      venue,
      balanceUsd: Number(balanceUsd.toFixed(2)),
      exposureUsd: Number(exposureUsd.toFixed(2)),
      freeUsd: Number(freeUsd.toFixed(2)),
      performanceScore: Number(perfScore.toFixed(4)),
      healthScore: Number(healthScore.toFixed(4)),
      score: Number(score.toFixed(4))
    };
  }).sort((a, b) => b.score - a.score);

  const totalScore = rows.reduce((s, r) => s + r.score, 0) || 1;
  return rows.map(r => ({
    ...r,
    targetCapitalPct: Number((r.score / totalScore).toFixed(4)),
    targetCapitalLabel: `${((r.score / totalScore) * 100).toFixed(2)}%`
  }));
}

function computePortfolioConcentration(state) {
  const venueExposure = computeVenueExposure(state);
  const symbolExposure = computeSymbolExposure(state);
  const gross = Object.values(venueExposure).reduce((a, b) => a + num(b), 0) || 0;
  const maxVenue = Math.max(0, ...Object.values(venueExposure).map(num));
  const maxSymbol = Math.max(0, ...Object.values(symbolExposure).map(num));

  return {
    grossExposureUsd: Number(gross.toFixed(2)),
    maxVenueExposureUsd: Number(maxVenue.toFixed(2)),
    maxSymbolExposureUsd: Number(maxSymbol.toFixed(2)),
    venueConcentrationPct: gross ? Number((maxVenue / gross).toFixed(4)) : 0,
    symbolConcentrationPct: gross ? Number((maxSymbol / gross).toFixed(4)) : 0
  };
}

function evaluatePortfolioRiskLimits(ctx) {
  const eq = Math.max(1, num(ctx.state.equity, 1000));
  const concentration = computePortfolioConcentration(ctx.state);
  const venueExposure = computeVenueExposure(ctx.state);
  const symbolExposure = computeSymbolExposure(ctx.state);
  const failures = [];

  const maxVenuePct = 0.55;
  const maxSymbolPct = 0.35;
  if (concentration.venueConcentrationPct > maxVenuePct) failures.push(`Túl magas venue koncentráció (${(concentration.venueConcentrationPct*100).toFixed(2)}%/${(maxVenuePct*100).toFixed(2)}%)`);
  if (concentration.symbolConcentrationPct > maxSymbolPct) failures.push(`Túl magas symbol koncentráció (${(concentration.symbolConcentrationPct*100).toFixed(2)}%/${(maxSymbolPct*100).toFixed(2)}%)`);

  for (const [venue, usd] of Object.entries(venueExposure)) {
    const pct = usd / eq;
    if (pct > 0.65) failures.push(`Venue limit sérül ${venue} (${(pct*100).toFixed(2)}%)`);
  }
  for (const [symbol, usd] of Object.entries(symbolExposure)) {
    const pct = usd / eq;
    if (pct > 0.40) failures.push(`Symbol limit sérül ${symbol} (${(pct*100).toFixed(2)}%)`);
  }

  return {
    passed: failures.length === 0,
    failures,
    concentration,
    venueExposure,
    symbolExposure
  };
}

function venueAllocationMultiplier(plan, venue) {
  const row = (plan || []).find(x => x.venue === venue);
  if (!row) return 1;
  const pct = num(row.targetCapitalPct, 0.25);
  return Number(Math.max(0.5, Math.min(1.8, 0.5 + pct * 3)).toFixed(2));
}

module.exports = {
  computeVenueCapitalPlan,
  computePortfolioConcentration,
  evaluatePortfolioRiskLimits,
  venueAllocationMultiplier
};

// v3: prospective notional limits relative to each venue's own equity, never shares of current exposure.
function equityCurvePolicy(trades=[],equity=2500,champion=null,policy={}) {
  const {verifiedTrade}=require('./strategyScorecard');
  const seen=new Set();
  const rows=trades.filter(t=>verifiedTrade(t) && Number.isFinite(Number(t.netPnl)) &&
    (!champion?.artifactFingerprint || t.candidateFingerprint===champion.artifactFingerprint) &&
    (!champion?.provenance?.mode || String(t.executionMode || t.mode || 'paper').toLowerCase()===champion.provenance.mode) && Number.isFinite(Date.parse(t.closedAt || t.time)))
    .filter(t=>{const key=t.id || t.orderId || JSON.stringify([t.closedAt || t.time,t.venue,t.symbol,t.netPnl]);if(seen.has(key))return false;seen.add(key);return true;})
    .sort((a,b)=>Date.parse(a.closedAt || a.time)-Date.parse(b.closedAt || b.time)).slice(-200);
  const totalNet=rows.reduce((sum,t)=>sum+Number(t.netPnl),0);
  // equity is CURRENT equity; reconstruct start instead of counting realized PnL twice.
  let running=equity-totalNet,peak=running,maxDd=0,net=0,gain=0,loss=0;
  for(const r of rows){const p=Number(r.netPnl);net+=p;gain+=Math.max(0,p);loss+=Math.max(0,-p);running+=p;peak=Math.max(peak,running);maxDd=Math.max(maxDd,(peak-running)/Math.max(1,peak)*100);}
  const pf=loss>0?gain/loss:gain>0?99:0;
  const qualified=rows.length>=Math.max(50,num(policy.minTrades,50)) && net>0 && pf>=1.2 && maxDd<=Math.min(5,num(policy.maxDrawdownPct,5)) && equity>0 && champion?.riskIncreaseEligible===true;
  const multiplier=qualified?Math.min(1.08,1+net/Math.max(1,equity)):net<0 || maxDd>5?0.7:1;
  return {version:'equity-curve-evidence-compounding-2',trades:rows.length,netPnl:net,profitFactor:pf,maxDrawdownPct:maxDd,
    qualified,riskMultiplier:multiplier,capitalTransferAuthority:'none',shadowLearningAllowed:true,reason:qualified?'qualified-net-positive-forward-equity':'no-risk-increase-proof'};
}
function evaluatePortfolioRisk2(input={}) {
  const positions=[...(input.positions || []),...(input.proposed?[input.proposed]:[])];
  const limits={venuePct:35,symbolPct:20,strategyPct:30,correlationPct:40,maxLeverage:3,...input.limits};
  const byVenue={},bySymbol={},byStrategy={},failures=[];
  let correlatedRiskUsd=0;
  for(const p of positions){
    const venue=String(p.requestedVenue || p.venue || '').toLowerCase(),symbol=String(p.symbol || '').toUpperCase(),strategy=String(p.agentStrategy || p.strategy || 'UNKNOWN').toUpperCase();
    const notional=Math.abs(num(p.notionalUsd, num(p.entryPrice)*num(p.quantity ?? p.qty ?? p.amount)));
    const equity=num(input.venueEquity?.[venue]);
    if(!(notional>0) || !Number.isFinite(Number(p.notionalUsd ?? (Number(p.entryPrice)*Number(p.quantity ?? p.qty ?? p.amount))))){failures.push('invalid-position-notional:'+venue);continue;}
    if(!(equity>0)){failures.push('unknown-venue-equity:'+venue);continue;}
    byVenue[venue]=(byVenue[venue] || 0)+notional;
    const sk=venue+'|'+symbol,tk=venue+'|'+strategy;
    bySymbol[sk]=(bySymbol[sk] || 0)+notional;byStrategy[tk]=(byStrategy[tk] || 0)+notional;
    if(p.leverage!=null && (!Number.isFinite(Number(p.leverage)) || Number(p.leverage)<1))failures.push('invalid-leverage:'+venue);
    if(num(p.leverage,1)>limits.maxLeverage)failures.push('leverage:'+venue);
  }
  for(const [venue,usd] of Object.entries(byVenue))if(usd/input.venueEquity[venue]*100>limits.venuePct)failures.push('venue-notional-budget:'+venue);
  for(const [key,usd] of Object.entries(bySymbol))if(usd/input.venueEquity[key.split('|')[0]]*100>limits.symbolPct)failures.push('symbol-notional-budget:'+key);
  for(const [key,usd] of Object.entries(byStrategy))if(usd/input.venueEquity[key.split('|')[0]]*100>limits.strategyPct)failures.push('strategy-notional-budget:'+key);
  // Conservative absolute correlations; missing estimates = perfectly correlated, never fabricated diversification.
  for(const [venue,usd] of Object.entries(byVenue)){
    const own=positions.filter(p=>String(p.requestedVenue || p.venue).toLowerCase()===venue);
    let variance=0;
    for(const a of own)for(const b of own){const n=p=>Math.abs(num(p.notionalUsd,num(p.entryPrice)*num(p.quantity ?? p.qty ?? p.amount)));
      const key=[a.symbol,b.symbol].sort().join('|');const ownKey=[String(a.venue || a.requestedVenue).toLowerCase()+':'+a.symbol,String(b.venue || b.requestedVenue).toLowerCase()+':'+b.symbol].sort().join('|');const estimate=input.correlations?.[ownKey] ?? input.correlations?.[key];const raw=estimate && typeof estimate==='object'?(estimate.samples>=20 && Number.isFinite(Number(estimate.asOf)) && estimate.asOf<=Date.now()+5000 && Date.now()-estimate.asOf<=60000?estimate.correlation:null):estimate;const corr=raw==null?1:Math.min(1,Math.max(0,Math.abs(num(raw,1))));variance+=n(a)*n(b)*corr;}
    const risk=Math.sqrt(variance);correlatedRiskUsd+=risk;
    if(risk/input.venueEquity[venue]*100>limits.correlationPct)failures.push('correlated-budget:'+venue);
  }
  const totalEquity=Object.values(input.venueEquity || {}).reduce((sum,x)=>sum+Math.max(0,num(x)),0);
  let globalVariance=0;
  for(const a of positions)for(const b of positions){const value=p=>Math.abs(num(p.notionalUsd,num(p.entryPrice)*num(p.quantity ?? p.qty ?? p.amount)));const key=[String(a.requestedVenue || a.venue).toLowerCase()+':'+a.symbol,String(b.requestedVenue || b.venue).toLowerCase()+':'+b.symbol].sort().join('|');const estimate=input.correlations?.[key];const valid=estimate && estimate.samples>=20 && Number.isFinite(Number(estimate.asOf)) && estimate.asOf<=Date.now()+5000 && Date.now()-estimate.asOf<=60000;const correlation=key.split('|')[0]===key.split('|')[1]?1:valid?Math.min(1,Math.abs(num(estimate.correlation,1))):1;globalVariance+=value(a)*value(b)*correlation;}
  const globalCorrelatedRiskUsd=Math.sqrt(globalVariance);
  if(totalEquity>0 && globalCorrelatedRiskUsd/totalEquity*100>limits.correlationPct)failures.push('global-correlated-budget');
  return {version:'portfolio-risk-manager-2',passed:!failures.length,failures,byVenue,bySymbol,byStrategy,correlatedRiskUsd,
    globalCorrelatedRiskUsd,totalEquity,correlationEstimates:input.correlations || {},limits,missingCorrelationPolicy:'worst-case-one',capitalIsolation:true,shadowLearningAllowed:true};
}
module.exports.evaluatePortfolioRisk2=evaluatePortfolioRisk2;
module.exports.equityCurvePolicy=equityCurvePolicy;
