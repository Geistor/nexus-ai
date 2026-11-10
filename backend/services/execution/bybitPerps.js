async function executeBybitPerps(ex, { symbol, side, amount, marginMode = 'cross', positionIdx = null }) {
  await ex.loadMarkets();
  const params = { category: 'linear' };
  if (positionIdx !== null) params.positionIdx = positionIdx;
  if (marginMode) params.tradeMode = String(marginMode).toLowerCase() === 'isolated' ? 1 : 0;
  return ex.createOrder(symbol, 'market', side === 'BUY' ? 'buy' : 'sell', amount, undefined, params);
}
module.exports = { executeBybitPerps };
