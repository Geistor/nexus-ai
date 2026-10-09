const { routeOrder } = require('./orderRouter');

async function executeArbHedgeLegs(ctx, opportunity, qty) {
  const buyVenue = { exchangeName: opportunity.buyExchange, symbol: opportunity.symbol, action: 'BUY' };
  const sellVenue = { exchangeName: opportunity.sellExchange, symbol: opportunity.symbol, action: 'SELL' };
  let buyOrder = null, sellOrder = null;
  try {
    buyOrder = await routeOrder(ctx, buyVenue, qty);
    sellOrder = await routeOrder(ctx, sellVenue, qty);
    return { ok: true, buyOrder, sellOrder };
  } catch (err) {
    return { ok: false, error: err.message, buyOrder, sellOrder };
  }
}
async function recoverBrokenArb(ctx, broken) {
  if (broken.buyOrder && !broken.sellOrder) ctx.helpers.pushAlert('warning', 'Arbitrage hedge leg failed after buy leg', broken);
  if (!broken.buyOrder && broken.sellOrder) ctx.helpers.pushAlert('warning', 'Arbitrage hedge leg failed after sell leg', broken);
}
module.exports = { executeArbHedgeLegs, recoverBrokenArb };
