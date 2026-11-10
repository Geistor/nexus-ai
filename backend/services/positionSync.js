const { upsertSystemState, insertTradeEvent } = require('./supabasePersistence');

function nowIso() { return new Date().toISOString(); }

async function syncVenuePositions({ venues = {}, exchangeManager, tradeId, reason = 'manual_sync' }) {
  const snapshot = {
    reason,
    syncedAt: nowIso(),
    venues: {},
    totals: { connected: 0, synced: 0, openPositions: 0, estimatedExposureUsd: 0 }
  };

  const entries = Object.entries(venues || {});
  for (const [venueKey, venue] of entries) {
    const venueState = {
      connected: !!venue?.connected,
      ok: false,
      positions: [],
      balances: null,
      error: null,
      testnet: !!venue?.testnet
    };
    if (venueState.connected) snapshot.totals.connected += 1;

    try {
      if (!venueState.connected) {
        snapshot.venues[venueKey] = venueState;
        continue;
      }
      const client = await exchangeManager.getLiveClient(venueKey, venue);
      if (!client) throw new Error('Nincs aktív venue kliens');

      let positions = [];
      if (typeof client.fetchPositions === 'function') {
        try {
          positions = await client.fetchPositions();
        } catch (_) {}
      }
      let balance = null;
      if (typeof client.fetchBalance === 'function') {
        try {
          balance = await client.fetchBalance();
        } catch (_) {}
      }

      const normalizedPositions = (positions || [])
        .filter((p) => {
          const contracts = Number(p?.contracts ?? p?.contractsSize ?? p?.info?.positionAmt ?? 0);
          return Number.isFinite(contracts) ? Math.abs(contracts) > 0 : true;
        })
        .slice(0, 20)
        .map((p) => {
          const contracts = Number(p?.contracts ?? p?.contractsSize ?? p?.info?.positionAmt ?? 0);
          const notional = Number(p?.notional ?? p?.info?.notional ?? p?.contracts * p?.entryPrice ?? 0);
          return {
            symbol: p?.symbol || p?.info?.symbol || 'unknown',
            side: p?.side || p?.info?.side || (contracts >= 0 ? 'long' : 'short'),
            contracts: Number.isFinite(contracts) ? contracts : null,
            entryPrice: Number(p?.entryPrice ?? p?.info?.entryPrice ?? 0) || null,
            markPrice: Number(p?.markPrice ?? p?.info?.markPrice ?? 0) || null,
            notionalUsd: Number.isFinite(notional) ? Math.abs(notional) : 0,
            unrealizedPnl: Number(p?.unrealizedPnl ?? p?.info?.unrealizedPnl ?? 0) || 0
          };
        });

      venueState.ok = true;
      venueState.positions = normalizedPositions;
      venueState.balances = balance?.total || balance?.free || null;
      snapshot.totals.synced += 1;
      snapshot.totals.openPositions += normalizedPositions.length;
      snapshot.totals.estimatedExposureUsd += normalizedPositions.reduce((sum, p) => sum + Math.abs(Number(p.notionalUsd || 0)), 0);
    } catch (error) {
      venueState.error = error?.message || String(error);
    }

    snapshot.venues[venueKey] = venueState;
  }

  snapshot.totals.estimatedExposureUsd = Number(snapshot.totals.estimatedExposureUsd.toFixed(2));
  await upsertSystemState('position_sync', snapshot);
  await insertTradeEvent({ trade_id: tradeId || `sync_${Date.now()}`, event_type: 'position_sync', payload: snapshot });
  return snapshot;
}

module.exports = { syncVenuePositions };
