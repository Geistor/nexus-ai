function getVenueExposure(state, venueName) {
  return Object.values(state.openPositions || {})
    .filter(p => p.venue === venueName)
    .reduce((sum, p) => sum + Math.abs((p.entry || 0) * (p.size || 0)), 0);
}
function venueExposureLimit(config, venueName, equity) {
  const venueLimits = { binance: 0.35, bybit: 0.25, okx: 0.25, kraken: 0.15 };
  const pct = venueLimits[venueName] ?? 0.20;
  return equity * pct;
}
function canOpenOnVenue(state, config, venueName) {
  return getVenueExposure(state, venueName) < venueExposureLimit(config, venueName, state.equity);
}
module.exports = { getVenueExposure, venueExposureLimit, canOpenOnVenue };
