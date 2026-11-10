async function executeOkxPerps(ex, { symbol, side, amount, marginMode = 'cross', posSide = null }) {
  await ex.loadMarkets();
  const params = { tdMode: String(marginMode).toLowerCase() === 'isolated' ? 'isolated' : 'cross' };
  if (posSide) params.posSide = posSide;
  return ex.createOrder(symbol, 'market', side === 'BUY' ? 'buy' : 'sell', amount, undefined, params);
}
module.exports = { executeOkxPerps };
