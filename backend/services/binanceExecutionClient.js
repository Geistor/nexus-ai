
const crypto = require('crypto');
const { enforceRateLimit } = require('./rateLimiter');
const { fetchWithRetry } = require('./httpClient');
const { store } = require('../state/store');

function buildHeaders() {
  return { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY || '' };
}

function signParams(params) {
  const query = new URLSearchParams(params).toString();
  const signature = crypto.createHmac('sha256', process.env.BINANCE_API_SECRET || '').update(query).digest('hex');
  return `${query}&signature=${signature}`;
}

async function submitOrder(payload = {}) {
  const liveAllowed = String(process.env.ALLOW_LIVE_TRADING || 'false') === 'true';
  const mode = process.env.TRADING_MODE || 'paper';
  const baseUrl = process.env.BINANCE_BASE_URL || 'https://fapi.binance.com';

  const params = {
    symbol: payload.symbol || 'BTCUSDT',
    side: payload.side || 'BUY',
    type: payload.type || 'MARKET',
    quantity: payload.quantity || '0.001',
    timestamp: Date.now()
  };

  if (!liveAllowed || mode !== 'live') {
    const simulated = { ok: true, simulated: true, venue: 'binance', mode, params };
    store.http.binance.lastRequestAt = new Date().toISOString();
    store.http.binance.requests += 1;
    store.http.binance.lastStatus = 'simulated';
    store.executions.unshift(simulated);
    return simulated;
  }

  await enforceRateLimit('binance');
  const query = signParams(params);
  const result = await fetchWithRetry(`${baseUrl}/fapi/v1/order?${query}`, {
    method: 'POST',
    headers: buildHeaders()
  });

  store.http.binance.lastRequestAt = new Date().toISOString();
  store.http.binance.requests += 1;
  store.http.binance.lastStatus = result.ok ? result.status : result.error;
  store.executions.unshift({ venue: 'binance', mode, result });
  return result;
}

module.exports = { submitOrder };
