async function ensureBinanceHedgeMode(ex) {
  await ex.fapiPrivatePostPositionSideDual({ dualSidePosition: 'true', timestamp: Date.now() });
}
async function setBinanceMarginMode(ex, symbol, marginMode = 'ISOLATED') {
  const market = ex.market(symbol);
  try {
    await ex.fapiPrivatePostMarginType({ symbol: market.id, marginType: String(marginMode).toUpperCase(), timestamp: Date.now() });
  } catch (_) {}
}
async function setBinanceLeverage(ex, symbol, leverage = 3) {
  const market = ex.market(symbol);
  await ex.fapiPrivatePostLeverage({ symbol: market.id, leverage, timestamp: Date.now() });
}
async function executeBinanceFutures(ex, { symbol, side, amount, leverage = 3, marginMode = 'ISOLATED', stpMode = 'EXPIRE_TAKER' }) {
  await ex.loadMarkets();
  try { await ensureBinanceHedgeMode(ex); } catch (_) {}
  try { await setBinanceMarginMode(ex, symbol, marginMode); } catch (_) {}
  try { await setBinanceLeverage(ex, symbol, leverage); } catch (_) {}
  const params = { positionSide: side === 'BUY' ? 'LONG' : 'SHORT', reduceOnly: false, selfTradePreventionMode: stpMode };
  if (side === 'BUY') return ex.createOrder(symbol, 'market', 'buy', amount, undefined, params);
  if (side === 'SELL') return ex.createOrder(symbol, 'market', 'sell', amount, undefined, params);
  throw new Error('Unsupported side');
}
module.exports = { executeBinanceFutures };
