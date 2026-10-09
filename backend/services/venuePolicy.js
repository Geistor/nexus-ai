'use strict';

const { canOpenOnVenue } = require('./venueRisk');
const { getVenueFeeModel } = require('./feeModel');

const VENUE_CAPABILITIES = Object.freeze({
  binance: {
    publicMarket: true, privateRead: true, spot: true, perpetuals: true, passphraseRequired: false,
    testnet: true, realTestnetSubmitAdapter: true, orderTypes: ['MARKET', 'LIMIT'],
    symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']
  },
  bybit: {
    publicMarket: true, privateRead: true, spot: true, perpetuals: true, passphraseRequired: false,
    testnet: true, realTestnetSubmitAdapter: true, orderTypes: ['MARKET', 'LIMIT'],
    symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']
  },
  okx: {
    publicMarket: true, privateRead: true, spot: true, perpetuals: true, passphraseRequired: true,
    testnet: true, realTestnetSubmitAdapter: false, orderTypes: ['MARKET', 'LIMIT'],
    symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']
  },
  kraken: {
    publicMarket: true, privateRead: true, spot: true, perpetuals: false, passphraseRequired: false,
    testnet: false, realTestnetSubmitAdapter: false, orderTypes: ['MARKET', 'LIMIT'],
    symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']
  }
});

function normalizeVenue(value) { return String(value || '').trim().toLowerCase(); }
function bool(v) { return v === true; }
function capabilityFor(venue) {
  const v = normalizeVenue(venue);
  return VENUE_CAPABILITIES[v] ? { venue: v, ...VENUE_CAPABILITIES[v] } : null;
}

function buildExchangeCapabilityRegistry(input = {}) {
  const exchanges = input.exchanges || {};
  const venueStatus = input.venueStatus || {};
  const testnetProofs = Array.isArray(input.testnetProofs) ? input.testnetProofs : [];
  const learningVenues = new Set((input.learningVenues || []).map(normalizeVenue));
  const liveAllowed = input.liveAllowed === true;
  const rows = {};
  for (const [venue, staticCaps] of Object.entries(VENUE_CAPABILITIES)) {
    const exchange = exchanges[venue] || {};
    const status = venueStatus[venue] || {};
    const latestProof = testnetProofs.find(row => normalizeVenue(row?.venue) === venue) || null;
    const privateReadConnected = bool(exchange.connected) || bool(exchange.privateAuthUsable) || bool(status.privateAuthUsable) || bool(status.balanceRead);
    const publicLearningReady = staticCaps.publicMarket && (learningVenues.has(venue) || bool(status.publicMarket) || bool(exchange.publicMarket));
    const testnetProofReady = bool(latestProof?.hardened_ready) || bool(latestProof?.testnet_ready) || bool(status.hardenedReady) || bool(status.testnetReady);
    const realTestnetExecutionReady = staticCaps.realTestnetSubmitAdapter && testnetProofReady && privateReadConnected;
    rows[venue] = {
      venue,
      static: { ...staticCaps },
      runtime: {
        publicLearningReady,
        privateReadConnected,
        testnetProofReady,
        realTestnetExecutionReady,
        liveExecutionReady: liveAllowed && privateReadConnected && false,
        credentialSaved: bool(exchange.configured) || bool(exchange.hasCredentials) || bool(exchange.saved),
        lastStatusAt: status.ts || exchange.lastCheckedAt || latestProof?.time || null
      },
      truth: privateReadConnected ? 'private-read-connected' : publicLearningReady ? 'public-learning-only' : 'not-ready',
      blockers: [
        ...(!publicLearningReady ? ['public-market-not-ready'] : []),
        ...(!privateReadConnected ? ['private-read-not-proved'] : []),
        ...(staticCaps.testnet && !staticCaps.realTestnetSubmitAdapter ? ['real-testnet-adapter-not-implemented'] : []),
        ...(!staticCaps.testnet ? ['venue-testnet-not-supported-by-current-core'] : []),
        ...(!liveAllowed ? ['live-globally-locked'] : [])
      ]
    };
  }
  return {
    version: 'exchange-capability-registry-1.0',
    generatedAt: new Date().toISOString(),
    venues: rows,
    policy: 'static-capability-plus-runtime-proof-no-public-private-conflation'
  };
}

function buildMultiExchangeOnboarding(registry = {}) {
  const rows = {};
  for (const [venue, row] of Object.entries(registry.venues || {})) {
    const r = row.runtime || {};
    const stages = [
      { key: 'public-market', ok: r.publicLearningReady === true, required: true },
      { key: 'private-read', ok: r.privateReadConnected === true, required: true },
      { key: 'testnet-proof', ok: r.testnetProofReady === true, required: row.static?.testnet === true },
      { key: 'real-testnet-submit', ok: r.realTestnetExecutionReady === true, required: row.static?.testnet === true },
      { key: 'live', ok: r.liveExecutionReady === true, required: false }
    ];
    let state = 'not-started';
    if (r.publicLearningReady) state = 'public-learning-ready';
    if (r.privateReadConnected) state = 'private-read-ready';
    if (r.testnetProofReady) state = 'testnet-proof-ready';
    if (r.realTestnetExecutionReady) state = 'testnet-execution-ready';
    if (r.liveExecutionReady) state = 'live-ready';
    rows[venue] = {
      venue, state, stages,
      nextRequired: stages.find(x => x.required && !x.ok)?.key || null,
      learningAllowed: r.publicLearningReady === true,
      privateReadAllowed: r.privateReadConnected === true,
      executionAllowed: r.realTestnetExecutionReady === true || r.liveExecutionReady === true,
      note: r.publicLearningReady && !r.privateReadConnected
        ? 'Saját public adatokból tanulhat, de private/live kapcsolatként nem jelenhet meg.'
        : null
    };
  }
  return { version: 'multi-exchange-onboarding-1.0', generatedAt: new Date().toISOString(), venues: rows, policy: 'public-to-private-read-to-testnet-proof-to-execution' };
}

function chooseBestVenueAdvanced({ ctx, symbol, action, balances, prices, latencyStats, venueStats }) {
  const candidates = [];
  for (const [exchangeName, venuePrices] of Object.entries(prices)) {
    const px = venuePrices?.[symbol];
    const bal = balances?.[exchangeName]?.usdtFree ?? 0;
    const latency = latencyStats?.[exchangeName]?.avgMs ?? 9999;
    const fees = getVenueFeeModel(exchangeName, 'future');
    const fillScore = venueStats?.[exchangeName]?.fillQualityScore ?? 0.5;
    const rejectRate = venueStats?.[exchangeName]?.rejectRate ?? 0;
    if (!px || bal <= 10) continue;
    if (!canOpenOnVenue(ctx.state, ctx.CONFIG, exchangeName)) continue;
    let score = 0;
    score += Math.max(0, bal / 1000);
    score += Math.max(0, (500 - latency) / 500);
    score += fillScore;
    score -= rejectRate;
    score -= fees.taker * 100;
    if (action === 'SELL' && !['binance', 'bybit', 'okx'].includes(exchangeName)) continue;
    candidates.push({ exchangeName, symbol, action, score, price: px });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}
module.exports = { VENUE_CAPABILITIES, capabilityFor, buildExchangeCapabilityRegistry, buildMultiExchangeOnboarding, chooseBestVenueAdvanced };
