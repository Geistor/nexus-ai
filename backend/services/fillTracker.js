function makeTrackedOrder(order, meta = {}) {
  return {
    orderId: order.id,
    clientOrderId: order.clientOrderId || null,
    venue: meta.venue,
    symbol: meta.symbol,
    side: meta.side,
    requestedQty: Number(meta.requestedQty || 0),
    filledQty: Number(order.filled || 0),
    remainingQty: Number(order.remaining ?? meta.requestedQty ?? 0),
    avgFillPrice: Number(order.average || meta.entry || 0),
    status: order.status || 'open',
    fills: [],
    openedAt: new Date().toISOString()
  };
}
function applyFillUpdate(tracked, update) {
  tracked.filledQty = Number(update.filledQty ?? tracked.filledQty);
  tracked.remainingQty = Number(update.remainingQty ?? tracked.remainingQty);
  tracked.avgFillPrice = Number(update.avgFillPrice ?? tracked.avgFillPrice);
  tracked.status = update.status || tracked.status;
  if (update.lastFill) tracked.fills.push(update.lastFill);
  return tracked;
}
function isCompletelyFilled(tracked) {
  return tracked.remainingQty <= 0 || tracked.status === 'filled' || tracked.status === 'closed';
}
module.exports = { makeTrackedOrder, applyFillUpdate, isCompletelyFilled };
