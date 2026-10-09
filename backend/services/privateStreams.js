const WebSocket = require('ws');
const crypto = require('crypto');
const { applyFillUpdate, isCompletelyFilled } = require('./fillTracker');

function wsUrl(exchangeName, sandbox = false) {
  const map = {
    binance: sandbox
      ? 'wss://ws-api.testnet.binance.vision/ws-api/v3'
      : 'wss://ws-api.binance.com:443/ws-api/v3',
    bybit: sandbox
      ? 'wss://stream-testnet.bybit.com/v5/private'
      : 'wss://stream.bybit.com/v5/private',
    okx: sandbox
      ? 'wss://wspap.okx.com:8443/ws/v5/private'
      : 'wss://ws.okx.com:8443/ws/v5/private',
    kraken: sandbox
      ? 'wss://ws-auth.kraken.com/v2'
      : 'wss://ws-auth.kraken.com/v2'
  };
  return map[exchangeName];
}

function normalizeOrderUpdate(venueName, raw) {
  if (!raw) return null;

  if (venueName === 'binance') {
    const o = raw.o || raw;
    if (!(o.i || o.orderId)) return null;
    return {
      orderId: String(o.i || o.orderId),
      venue: venueName,
      symbol: o.s || raw.symbol || null,
      status: o.X || o.status || null,
      filledQty: o.z ?? o.filledQty ?? null,
      remainingQty: o.q && o.z ? Number(o.q) - Number(o.z) : (o.remainingQty ?? null),
      avgFillPrice: o.ap ?? o.avgFillPrice ?? null,
      lastFill: o.l ? { qty: o.l, price: o.L || o.ap || null, fee: o.n || null, feeCurrency: o.N || null } : null
    };
  }

  if (venueName === 'bybit') {
    const o = Array.isArray(raw.data) ? raw.data[0] : raw.data || raw;
    if (!o.orderId) return null;
    return {
      orderId: String(o.orderId),
      venue: venueName,
      symbol: o.symbol || null,
      status: o.orderStatus || o.status || null,
      filledQty: o.cumExecQty ?? null,
      remainingQty: o.leavesQty ?? null,
      avgFillPrice: o.avgPrice ?? null,
      lastFill: o.execQty ? { qty: o.execQty, price: o.execPrice || o.avgPrice || null, fee: o.execFee || null, feeCurrency: o.feeCurrency || null } : null
    };
  }

  if (venueName === 'okx') {
    const o = Array.isArray(raw.data) ? raw.data[0] : raw.data || raw;
    if (!o.ordId) return null;
    return {
      orderId: String(o.ordId),
      venue: venueName,
      symbol: o.instId || null,
      status: o.state || null,
      filledQty: o.accFillSz ?? null,
      remainingQty: (o.sz && o.accFillSz) ? Number(o.sz) - Number(o.accFillSz) : null,
      avgFillPrice: o.avgPx ?? null,
      lastFill: o.fillSz ? { qty: o.fillSz, price: o.fillPx || o.avgPx || null, fee: o.fee || null, feeCurrency: o.feeCcy || null } : null
    };
  }

  if (venueName === 'kraken') {
    const o = raw.data || raw;
    if (!(o.order_id || o.orderId)) return null;
    return {
      orderId: String(o.order_id || o.orderId),
      venue: venueName,
      symbol: o.symbol || null,
      status: o.order_status || o.status || null,
      filledQty: o.cum_qty ?? o.filledQty ?? null,
      remainingQty: o.leaves_qty ?? o.remainingQty ?? null,
      avgFillPrice: o.avg_price ?? o.avgFillPrice ?? null,
      lastFill: o.last_qty ? { qty: o.last_qty, price: o.last_price || o.avg_price || null, fee: o.fee_usd || null, feeCurrency: o.fee_currency || null } : null
    };
  }

  return null;
}

function materializePositionFromTrackedOrder(ctx, tracked) {
  if (tracked.filledQty <= 0) return null;
  const pos = ctx.state.openPositions[tracked.symbol];
  if (pos) {
    pos.size = Number(tracked.filledQty);
    pos.entry = Number(tracked.avgFillPrice || pos.entry);
    pos.partial = Number(tracked.filledQty) < Number(tracked.requestedQty);
    pos.orderStatus = tracked.status;
    pos.lastFillAt = new Date().toISOString();
    return pos;
  }
  return null;
}

function onPrivateOrderEvent(ctx, normalized) {
  if (!normalized?.orderId) return;
  const tracked = ctx.state.pendingOrders?.[normalized.orderId];
  if (!tracked) return;

  applyFillUpdate(tracked, normalized);
  materializePositionFromTrackedOrder(ctx, tracked);

  if (isCompletelyFilled(tracked)) {
    delete ctx.state.pendingOrders[normalized.orderId];
    ctx.helpers.pushLog('INFO', 'Megrendelés teljesen pozícióvá alakult', {
      orderId: normalized.orderId, symbol: tracked.symbol, venue: tracked.venue
    });
  } else {
    ctx.helpers.pushLog('INFO', 'Részleges teljesülés frissítve', {
      orderId: normalized.orderId, filledQty: tracked.filledQty,
      remainingQty: tracked.remainingQty, venue: tracked.venue
    });
  }
}

function storeSocket(ctx, venueName, ws) {
  ctx.state.venueSockets[venueName] = ws;
  ctx.state.venueSocketState[venueName] = {
    connected: true,
    connectedAt: new Date().toISOString()
  };
}

function handleSocketClose(ctx, venueName) {
  ctx.state.venueSocketState[venueName] = {
    ...(ctx.state.venueSocketState[venueName] || {}),
    connected: false,
    closedAt: new Date().toISOString()
  };
}

function startBinancePrivateStream(ctx, creds, sandbox) {
  const url = wsUrl('binance', sandbox);
  if (!url || !creds?.apiKey || !creds?.apiSecret) return;

  const ws = new WebSocket(url);
  ws.on('open', () => {
    // Official docs support signature-based userDataStream.subscribe.signature
    const timestamp = Date.now().toString();
    const query = `apiKey=${creds.apiKey}&timestamp=${timestamp}`;
    const signature = crypto.createHmac('sha256', creds.apiSecret).update(query).digest('hex');
    ws.send(JSON.stringify({
      id: 'binance-user-stream',
      method: 'userDataStream.subscribe.signature',
      params: {
        apiKey: creds.apiKey,
        timestamp: Number(timestamp),
        signature
      }
    }));
    storeSocket(ctx, 'binance', ws);
  });
  ws.on('message', buf => {
    try {
      const msg = JSON.parse(buf.toString());
      const normalized = normalizeOrderUpdate('binance', msg);
      if (normalized) onPrivateOrderEvent(ctx, normalized);
    } catch (_) {}
  });
  ws.on('close', () => handleSocketClose(ctx, 'binance'));
  ws.on('error', err => ctx.helpers.pushLog('WARN', 'Binance privát WS hiba', { message: err.message }));
}

function startBybitPrivateStream(ctx, creds, sandbox) {
  const url = wsUrl('bybit', sandbox);
  if (!url || !creds?.apiKey || !creds?.apiSecret) return;

  const ws = new WebSocket(url);
  ws.on('open', () => {
    const expires = (Date.now() + 10000).toString();
    const signPayload = `GET/realtime${expires}`;
    const signature = crypto.createHmac('sha256', creds.apiSecret).update(signPayload).digest('hex');
    ws.send(JSON.stringify({ op: 'auth', args: [creds.apiKey, expires, signature] }));
    ws.send(JSON.stringify({ op: 'subscribe', args: ['order'] }));
    storeSocket(ctx, 'bybit', ws);
  });
  ws.on('message', buf => {
    try {
      const msg = JSON.parse(buf.toString());
      const normalized = normalizeOrderUpdate('bybit', msg);
      if (normalized) onPrivateOrderEvent(ctx, normalized);
    } catch (_) {}
  });
  ws.on('close', () => handleSocketClose(ctx, 'bybit'));
  ws.on('error', err => ctx.helpers.pushLog('WARN', 'Bybit privát WS hiba', { message: err.message }));
}

function startOkxPrivateStream(ctx, creds, sandbox) {
  const url = wsUrl('okx', sandbox);
  if (!url || !creds?.apiKey || !creds?.apiSecret || !creds?.passphrase) return;

  const ws = new WebSocket(url);
  ws.on('open', () => {
    const ts = (Date.now() / 1000).toFixed(0);
    const prehash = `${ts}GET/users/self/verify`;
    const sign = crypto.createHmac('sha256', creds.apiSecret).update(prehash).digest('base64');
    ws.send(JSON.stringify({
      op: 'login',
      args: [{
        apiKey: creds.apiKey,
        passphrase: creds.passphrase,
        timestamp: ts,
        sign
      }]
    }));
    ws.send(JSON.stringify({
      op: 'subscribe',
      args: [{ channel: 'orders', instType: 'ANY' }]
    }));
    storeSocket(ctx, 'okx', ws);
  });
  ws.on('message', buf => {
    try {
      const msg = JSON.parse(buf.toString());
      const normalized = normalizeOrderUpdate('okx', msg);
      if (normalized) onPrivateOrderEvent(ctx, normalized);
    } catch (_) {}
  });
  ws.on('close', () => handleSocketClose(ctx, 'okx'));
  ws.on('error', err => ctx.helpers.pushLog('WARN', 'OKX privát WS hiba', { message: err.message }));
}

async function fetchKrakenWsToken(ctx) {
  const ex = ctx.exchanges.kraken;
  if (!ex || !ctx.state.exchangeSecrets?.kraken) return null;
  // CCXT raw private helper naming can vary by version; use direct request fallback path if available.
  try {
    const resp = await ex.privatePostGetWebSocketsToken();
    return resp?.result?.token || resp?.token || null;
  } catch (_) {
    return null;
  }
}

function startKrakenPrivateStream(ctx, creds, sandbox) {
  const url = wsUrl('kraken', sandbox);
  if (!url || !creds?.apiKey || !creds?.apiSecret) return;

  const ws = new WebSocket(url);
  ws.on('open', async () => {
    const token = await fetchKrakenWsToken(ctx);
    if (!token) {
      ctx.helpers.pushLog('WARN', 'Kraken WS token fetch failed', {});
      return;
    }
    ws.send(JSON.stringify({
      method: 'subscribe',
      params: { channel: 'executions', token, snap_orders: true, snap_trades: true }
    }));
    storeSocket(ctx, 'kraken', ws);
  });
  ws.on('message', buf => {
    try {
      const msg = JSON.parse(buf.toString());
      const normalized = normalizeOrderUpdate('kraken', msg);
      if (normalized) onPrivateOrderEvent(ctx, normalized);
    } catch (_) {}
  });
  ws.on('close', () => handleSocketClose(ctx, 'kraken'));
  ws.on('error', err => ctx.helpers.pushLog('WARN', 'Kraken privát WS hiba', { message: err.message }));
}

function startPrivateStreams(ctx) {
  const names = ctx.activeExchanges || [];
  for (const venueName of names) {
    const creds = ctx.state.exchangeSecrets?.[venueName];
    const sandbox = !!ctx.state.exchangeConnections?.[venueName]?.useSandbox || !!ctx.CONFIG.useSandbox;
    if (venueName === 'binance') startBinancePrivateStream(ctx, creds, sandbox);
    if (venueName === 'bybit') startBybitPrivateStream(ctx, creds, sandbox);
    if (venueName === 'okx') startOkxPrivateStream(ctx, creds, sandbox);
    if (venueName === 'kraken') startKrakenPrivateStream(ctx, creds, sandbox);
  }
  ctx.helpers.pushLog('INFO', 'Privát adatfolyamok elindítva', { venues: names });
}

module.exports = { startPrivateStreams, normalizeOrderUpdate, onPrivateOrderEvent };
