'use strict';

// NEXUS v199_179 market guardian worker.
// Independent, public-only, own-venue REST heartbeat. It deliberately avoids global fetch/Undici,
// shared connection pools, API keys and cross-venue price substitution.
const https = require('https');
const { parentPort, workerData } = require('worker_threads');

const venues = ['binance', 'bybit', 'okx', 'kraken'];
const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];
const dispatchMs = Math.max(500, Math.min(2500, Number(workerData?.dispatchMs || 850)));
const requestTimeoutMs = Math.max(900, Math.min(5000, Number(workerData?.requestTimeoutMs || 2200)));
const maxInflight = Math.max(1, Math.min(3, Number(workerData?.maxInflight || 2)));
const heartbeatMs = Math.max(3000, Math.min(15000, Number(workerData?.heartbeatMs || 5000)));
const jobs = [];
for (const venue of venues) for (const symbol of symbols) jobs.push({ venue, symbol });
let jobCursor = 0;
let inflight = 0;
let stopped = false;
let successes = 0;
let failures = 0;
let lastSuccessAt = null;
const endpointCursor = Object.create(null);
const perMarket = Object.create(null);

function compact(symbol) { return String(symbol || '').replace('/', ''); }
function okxSymbol(symbol) { return String(symbol || '').replace('/', '-'); }
function krakenSymbol(symbol) { return symbol === 'BTC/USDT' ? 'XBTUSDT' : compact(symbol); }
function endpointsFor(venue, symbol) {
  const c = compact(symbol);
  if (venue === 'binance') return [
    `https://data-api.binance.vision/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(c)}`,
    `https://api.binance.com/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(c)}`,
    `https://api1.binance.com/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(c)}`,
    `https://api2.binance.com/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(c)}`
  ];
  if (venue === 'bybit') return [
    `https://api.bybit.eu/v5/market/tickers?category=spot&symbol=${encodeURIComponent(c)}`,
    `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${encodeURIComponent(c)}`,
    `https://api.bytick.com/v5/market/tickers?category=spot&symbol=${encodeURIComponent(c)}`
  ];
  if (venue === 'okx') {
    const inst = okxSymbol(symbol);
    return [
      `https://openapi.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(inst)}`,
      `https://eea.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(inst)}`,
      `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(inst)}`,
      `https://app.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(inst)}`
    ];
  }
  if (venue === 'kraken') {
    const pair = krakenSymbol(symbol);
    return [`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`];
  }
  return [];
}
function parseTicker(venue, json) {
  if (venue === 'binance') {
    const bid = Number(json?.bidPrice || 0), ask = Number(json?.askPrice || 0);
    const price = Number(json?.lastPrice || 0) || ((bid + ask) / 2);
    if (!(bid > 0) || !(ask > 0) || !(price > 0)) return null;
    return { bid, ask, price, volume24h: Number(json?.quoteVolume || json?.volume || 0) };
  }
  if (venue === 'bybit') {
    const row = json?.result?.list?.[0] || {};
    const bid = Number(row.bid1Price || 0), ask = Number(row.ask1Price || 0), price = Number(row.lastPrice || 0) || ((bid + ask) / 2);
    if (!(bid > 0) || !(ask > 0) || !(price > 0)) return null;
    return { bid, ask, price, volume24h: Number(row.turnover24h || row.volume24h || 0) };
  }
  if (venue === 'okx') {
    const row = json?.data?.[0] || {};
    const bid = Number(row.bidPx || 0), ask = Number(row.askPx || 0), price = Number(row.last || 0) || ((bid + ask) / 2);
    if (!(bid > 0) || !(ask > 0) || !(price > 0)) return null;
    return { bid, ask, price, volume24h: Number(row.volCcy24h || row.vol24h || 0) };
  }
  if (venue === 'kraken') {
    const row = Object.values(json?.result || {})[0] || {};
    const bid = Number(row.b?.[0] || 0), ask = Number(row.a?.[0] || 0), price = Number(row.c?.[0] || 0) || ((bid + ask) / 2);
    if (!(bid > 0) || !(ask > 0) || !(price > 0)) return null;
    return { bid, ask, price, volume24h: Number(row.v?.[1] || row.v?.[0] || 0) };
  }
  return null;
}
function getJson(url) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (error) { reject(error); return; }
    const req = https.get(parsed, {
      family: 4,
      agent: false,
      timeout: requestTimeoutMs,
      headers: {
        'User-Agent': 'NEXUS-market-guardian/199.179',
        'Accept': 'application/json',
        'Connection': 'close'
      }
    }, res => {
      const chunks = [];
      let bytes = 0;
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes <= 256 * 1024) chunks.push(chunk);
        else req.destroy(new Error('market_guardian_body_too_large'));
      });
      res.on('end', () => {
        const status = Number(res.statusCode || 0);
        if (status < 200 || status >= 300) { reject(new Error(`http_${status}`)); return; }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new Error('invalid_json')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`timeout_${requestTimeoutMs}ms`)));
    req.on('error', reject);
  });
}
async function runJob(job) {
  const key = `${job.venue}:${job.symbol}`;
  const endpoints = endpointsFor(job.venue, job.symbol);
  if (!endpoints.length) return;
  const cursor = Number(endpointCursor[key] || 0) % endpoints.length;
  const url = endpoints[cursor];
  const started = Date.now();
  try {
    const json = await getJson(url);
    const ticker = parseTicker(job.venue, json);
    if (!ticker) throw new Error('invalid_ticker_payload');
    endpointCursor[key] = cursor;
    successes += 1;
    lastSuccessAt = new Date().toISOString();
    perMarket[key] = { ok: true, lastOkAt: lastSuccessAt, lastError: null, endpoint: url, latencyMs: Date.now() - started };
    parentPort?.postMessage({
      type: 'ticker', venue: job.venue, symbol: job.symbol, ...ticker,
      endpoint: url, eventTime: Date.now(), latencyMs: Date.now() - started
    });
  } catch (error) {
    failures += 1;
    endpointCursor[key] = (cursor + 1) % endpoints.length;
    perMarket[key] = { ok: false, lastOkAt: perMarket[key]?.lastOkAt || null, lastError: error?.message || String(error), endpoint: url, latencyMs: Date.now() - started };
  }
}
function dispatch() {
  if (stopped || inflight >= maxInflight || !jobs.length) return;
  const job = jobs[jobCursor++ % jobs.length];
  inflight += 1;
  runJob(job).finally(() => { inflight = Math.max(0, inflight - 1); });
}
const dispatchTimer = setInterval(dispatch, dispatchMs);
const heartbeatTimer = setInterval(() => {
  parentPort?.postMessage({
    type: 'heartbeat', at: new Date().toISOString(), successes, failures, lastSuccessAt,
    inflight, cursor: jobCursor % Math.max(1, jobs.length), perMarket
  });
}, heartbeatMs);
dispatchTimer.unref?.();
heartbeatTimer.unref?.();
for (let i = 0; i < maxInflight; i += 1) setTimeout(dispatch, i * 200).unref?.();
parentPort?.on('message', msg => {
  if (msg?.type === 'stop') {
    stopped = true;
    clearInterval(dispatchTimer);
    clearInterval(heartbeatTimer);
    setTimeout(() => process.exit(0), 50).unref?.();
  } else if (msg?.type === 'reset') {
    for (const key of Object.keys(endpointCursor)) endpointCursor[key] = Number(endpointCursor[key] || 0) + 1;
  }
});
