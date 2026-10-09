const { estimateSlippagePct, adjustEntryForSlippage } = require('./slippageModel');

function buildExecutionPlan(ctx, symbol, venue, decision, features) {
  const venueStats = ctx.state.venueStats?.[venue.exchangeName] || {};
  const slippagePct = estimateSlippagePct(features, venueStats, decision.action);
  const adjustedEntry = adjustEntryForSlippage(Number(features.price || 0), slippagePct, decision.action);

  let orderType = 'market';
  if (slippagePct > 0.0012 && Number(features.volRatio || 1) < 1.0) {
    orderType = 'market'; // can be changed later to limit-maker logic
  }

  return {
    orderType,
    slippagePct,
    adjustedEntry,
    shouldSplit: Number(features.volRatio || 1) < 0.8 && Number(decision.confidence || 0) > 0.7,
    splitParts: Number(features.volRatio || 1) < 0.8 ? 2 : 1
  };
}

module.exports = { buildExecutionPlan };
