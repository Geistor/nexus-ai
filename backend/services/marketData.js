const WebSocket = require('ws');

function toWsStreamSymbol(symbol) {
  return symbol.replace('/', '').toLowerCase();
}

function startPriceSockets(ctx) {
  for (const symbol of ctx.CONFIG.symbols) {
    const stream = toWsStreamSymbol(symbol);
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}@trade`);

    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        ctx.state.priceCache.binance = ctx.state.priceCache.binance || {};
        ctx.state.priceCache.binance[symbol] = Number(data.p);
      } catch (_) {}
    });

    ws.on('error', (err) => ctx.helpers.pushLog('WARN', 'Binance WS error', { symbol, message: err.message }));
    ws.on('close', () => ctx.helpers.pushLog('WARN', 'Binance WS closed', { symbol }));
  }
}

async function fetchTickerFast(ctx, exchangeName, symbol) {
  const ex = ctx.exchanges[exchangeName];
  const started = Date.now();
  const ticker = await ex.fetchTicker(symbol);
  const ms = Date.now() - started;

  const prev = ctx.state.latencyStats[exchangeName]?.avgMs || ms;
  ctx.state.latencyStats[exchangeName] = { lastMs: ms, avgMs: Number(((prev * 0.8) + (ms * 0.2)).toFixed(2)) };

  ctx.state.priceCache[exchangeName] = ctx.state.priceCache[exchangeName] || {};
  ctx.state.priceCache[exchangeName][symbol] = ticker.last;
  return ticker.last;
}

async function refreshFastPrices(ctx) {
  const tasks = [];
  for (const exchangeName of ctx.activeExchanges) {
    for (const symbol of ctx.CONFIG.symbols) {
      tasks.push(fetchTickerFast(ctx, exchangeName, symbol).catch(() => null));
    }
  }
  await Promise.all(tasks);
}

module.exports = { startPriceSockets, refreshFastPrices };
