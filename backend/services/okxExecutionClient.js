
const crypto = require('crypto');
const { enforceRateLimit } = require('./rateLimiter');
const { fetchWithRetry } = require('./httpClient');
const { store } = require('../state/store');

function sign(timestamp, method, path, body) {
  const prehash = `${timestamp}${method}${path}${body}`;
  return crypto.createHmac('sha256', process.env.OKX_API_SECRET || '').update(prehash).digest('base64');
}

function buildHeaders(timestamp, method, path, body) {
  return {
    'OK-ACCESS-KEY': process.env.OKX_API_KEY || '',
    'OK-ACCESS-SIGN': sign(timestamp, method, path, body),
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE || '',
    'Content-Type': 'application/json'
  };
}

async function submitOrder(payload = {}) {
  const liveAllowed = String(process.env.ALLOW_LIVE_TRADING || 'false') === 'true';
  const mode = process.env.TRADING_MODE || 'paper';
  const baseUrl = process.env.OKX_BASE_URL || 'https://www.okx.com';

  const bodyObj = {
    instId: payload.instId || 'BTC-USDT-SWAP',
    tdMode: payload.tdMode || 'cross',
    side: payload.side || 'buy',
    ordType: payload.ordType || 'market',
    sz: payload.sz || '1'
  };

  if (!liveAllowed || mode !== 'live') {
    const simulated = { ok: true, simulated: true, venue: 'okx', mode, body: bodyObj };
    store.http.okx.lastRequestAt = new Date().toISOString();
    store.http.okx.requests += 1;
    store.http.okx.lastStatus = 'simulated';
    store.executions.unshift(simulated);
    return simulated;
  }

  await enforceRateLimit('okx');
  const method = 'POST';
  const path = '/api/v5/trade/order';
  const timestamp = new Date().toISOString();
  const body = JSON.stringify(bodyObj);

  const result = await fetchWithRetry(`${baseUrl}${path}`, {
    method,
    headers: buildHeaders(timestamp, method, path, body),
    body
  });

  store.http.okx.lastRequestAt = new Date().toISOString();
  store.http.okx.requests += 1;
  store.http.okx.lastStatus = result.ok ? result.status : result.error;
  store.executions.unshift({ venue: 'okx', mode, result });
  return result;
}

module.exports = { submitOrder };
