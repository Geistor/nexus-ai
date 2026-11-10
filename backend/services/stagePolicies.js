function defaultStagePolicies() {
  return {
    paper: {
      venueWhitelist: ['binance', 'okx', 'bybit', 'kraken'],
      symbolWhitelist: ['BTC/USDT', 'ETH/USDT'],
      emergency: { autoClosePositions: false, freezeTrading: true, notify: true }
    },
    staging: {
      venueWhitelist: ['binance', 'okx'],
      symbolWhitelist: ['BTC/USDT', 'ETH/USDT'],
      emergency: { autoClosePositions: false, freezeTrading: true, notify: true }
    },
    live: {
      venueWhitelist: ['binance'],
      symbolWhitelist: ['BTC/USDT'],
      emergency: { autoClosePositions: true, freezeTrading: true, notify: true }
    }
  };
}

function normalizeVenue(venue) {
  return String(venue || '').trim().toLowerCase();
}

function isVenueAllowed(stage, venueName, policies = defaultStagePolicies()) {
  const allowed = policies?.[stage]?.venueWhitelist || [];
  return allowed.map(normalizeVenue).includes(normalizeVenue(venueName));
}

function isSymbolAllowed(stage, symbol, policies = defaultStagePolicies()) {
  const allowed = policies?.[stage]?.symbolWhitelist || [];
  return allowed.includes(symbol);
}

function getEmergencyPolicy(stage, policies = defaultStagePolicies()) {
  return policies?.[stage]?.emergency || { autoClosePositions: false, freezeTrading: true, notify: true };
}

module.exports = { defaultStagePolicies, isVenueAllowed, isSymbolAllowed, getEmergencyPolicy };
