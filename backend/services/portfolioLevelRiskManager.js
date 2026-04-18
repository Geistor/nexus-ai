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
