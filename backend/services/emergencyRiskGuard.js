const { upsertSystemState, insertTradeEvent } = require('./supabasePersistence');

const DEFAULT_LIMITS = {
  maxExposureUsd: Number(process.env.RISK_GUARD_MAX_EXPOSURE_USD || 2500),
  maxOpenPositions: Number(process.env.RISK_GUARD_MAX_OPEN_POSITIONS || 6),
  maxDisconnectedVenues: Number(process.env.RISK_GUARD_MAX_DISCONNECTED || 2),
  blockWhenNoConnectedVenue: String(process.env.RISK_GUARD_BLOCK_WITHOUT_VENUE || 'true').toLowerCase() !== 'false'
};

function evaluatePositionSync(positionSync = {}, state = {}) {
  const totals = positionSync?.totals || {};
  const connectedVenues = totals.connected || 0;
  const disconnectedVenues = Object.values(positionSync?.venues || {}).filter((v) => v?.connected && !v?.ok).length;
  const exposure = Number(totals.estimatedExposureUsd || 0);
  const openPositions = Number(totals.openPositions || 0);
  const breaches = [];
  if (DEFAULT_LIMITS.blockWhenNoConnectedVenue && connectedVenues === 0 && state.botRunning) breaches.push('nincs_aktiv_venue');
  if (openPositions > DEFAULT_LIMITS.maxOpenPositions) breaches.push('tul_sok_nyitott_pozicio');
  if (exposure > DEFAULT_LIMITS.maxExposureUsd) breaches.push('tul_nagy_expozicio');
  if (disconnectedVenues > DEFAULT_LIMITS.maxDisconnectedVenues) breaches.push('tul_sok_venue_hiba');
  return {
    checkedAt: new Date().toISOString(),
    ok: breaches.length === 0,
    breaches,
    limits: DEFAULT_LIMITS,
    metrics: { connectedVenues, disconnectedVenues, exposure, openPositions }
  };
}

async function persistRiskGuard(result, tradeId) {
  await upsertSystemState('risk_guard', result);
  await insertTradeEvent({ trade_id: tradeId || `risk_${Date.now()}`, event_type: result.ok ? 'risk_guard_passed' : 'risk_guard_triggered', payload: result });
  return result;
}

module.exports = { DEFAULT_LIMITS, evaluatePositionSync, persistRiskGuard };
