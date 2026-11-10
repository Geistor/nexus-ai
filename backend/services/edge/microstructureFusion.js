const { scoreOrderbook } = require('./orderbookAI');
const { chooseLatencyProfile } = require('./latencyAware');
const { fundingBias } = require('./fundingEdge');
function fuseEdgeContext(input = {}) {
  const orderbook=scoreOrderbook(input.orderbook||{}, { maxAgeMs:input.maxOrderbookAgeMs, previousSequence:input.previousSequence });
  const latency=chooseLatencyProfile(input.latency||{});
  const funding=fundingBias({ ...(input.derivatives||{}), productType:input.productType || input.marketType || input.derivatives?.productType });
  let executionBias='neutral';
  if (orderbook.trusted && orderbook.signal==='buy_pressure') executionBias='prefer-buy-maker';
  if (orderbook.trusted && orderbook.signal==='sell_pressure') executionBias='prefer-sell-maker';
  if (orderbook.signal==='wide_spread_caution' || !orderbook.trusted) executionBias='defensive';
  return { version:'microstructure-fusion-2.0', orderbook, latency, funding, executionBias, trusted:orderbook.trusted, policy:'validated-orderbook-plus-explicit-funding-support-no-entry-authority' };
}
module.exports={fuseEdgeContext};
