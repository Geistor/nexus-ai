const { executeBinanceFutures } = require('./execution/binanceFutures');
const { executeBybitPerps } = require('./execution/bybitPerps');
const { executeOkxPerps } = require('./execution/okxPerps');

function venueDefaults(ctx, exchangeName) {
  const cfg = ctx.state.exchangeConnections?.[exchangeName] || {};
  return {
    marketType: cfg.marketType || 'future',
    marginMode: cfg.marginMode || 'cross',
    leverage: Number(cfg.leverage || 3)
  };
}

async function routeOrder(ctx, venue, amount) {
  const ex = ctx.exchanges[venue.exchangeName];
  if (!ex) throw new Error(`Hiányzó tőzsde: ${venue.exchangeName}`);
  const defaults = venueDefaults(ctx, venue.exchangeName);

  if (venue.exchangeName === 'binance') {
    return executeBinanceFutures(ex, { symbol: venue.symbol, side: venue.action, amount, leverage: defaults.leverage, marginMode: defaults.marginMode, stpMode: 'EXPIRE_TAKER' });
  }
  if (venue.exchangeName === 'bybit') {
    return executeBybitPerps(ex, { symbol: venue.symbol, side: venue.action, amount, marginMode: defaults.marginMode, positionIdx: venue.action === 'BUY' ? 1 : 2 });
  }
  if (venue.exchangeName === 'okx') {
    return executeOkxPerps(ex, { symbol: venue.symbol, side: venue.action, amount, marginMode: defaults.marginMode, posSide: venue.action === 'BUY' ? 'long' : 'short' });
  }
  throw new Error(`Tőzsde nincs implementálva: ${venue.exchangeName}`);
}
module.exports = { routeOrder };
