const { scoreOrderbook } = require('./orderbookAI');
const { chooseLatencyProfile } = require('./latencyAware');
const { fundingBias } = require('./fundingEdge');

function fuseEdgeContext(input = {}) {
  const orderbook = scoreOrderbook(input.orderbook || {});
  const latency = chooseLatencyProfile(input.latency || {});
  const funding = fundingBias(input.derivatives || {});
  return { orderbook, latency, funding };
}
module.exports = { fuseEdgeContext };
