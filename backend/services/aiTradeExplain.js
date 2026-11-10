async function aiTradeExplain(ctx, payload) {
  const tradeId = payload.tradeId;
  if (!tradeId) throw new Error('Hiányzó trade azonosító.');

  const trade = (ctx.state.closedTrades || []).find(t => t.tradeId === tradeId)
    || (ctx.state.openPositions ? Object.values(ctx.state.openPositions).find(t => t.tradeId === tradeId) : null);

  if (!trade) throw new Error('A megadott trade nem található.');

  const nyitott = !trade.closedAt;
  const pnlSzoveg = nyitott
    ? 'Ez a pozíció még nyitott, ezért a végleges eredmény még nem ismert.'
    : `A kötés eredménye ${Number(trade.pnl || 0).toFixed(2)} volt.`;

  const szoveg =
    `A ${trade.symbol} szimbólumhoz tartozó ${trade.side === 'BUY' ? 'vételi' : 'eladási / short'} ügylet elemzése. `
    + `Belépő ár: ${Number(trade.entry || 0).toFixed(2)}. `
    + (trade.exit ? `Kilépő ár: ${Number(trade.exit || 0).toFixed(2)}. ` : '')
    + `Méret: ${Number(trade.size || 0).toFixed(6)}. `
    + `Tőzsde: ${trade.venue || 'ismeretlen'}. `
    + (trade.stopLoss ? `Stop loss: ${Number(trade.stopLoss || 0).toFixed(2)}. ` : '')
    + (trade.takeProfit ? `Take profit: ${Number(trade.takeProfit || 0).toFixed(2)}. ` : '')
    + (trade.allocationMultiplier ? `Tőkeallokációs szorzó: ${Number(trade.allocationMultiplier).toFixed(2)}x. ` : '')
    + (trade.estimatedSlippagePct ? `Becsült slippage: ${(Number(trade.estimatedSlippagePct)*100).toFixed(4)}%. ` : '')
    + pnlSzoveg + ' '
    + (trade.reason ? `A lezárás oka: ${trade.reason}. ` : '')
    + `A rendszer ezt a kötést risk-alapú méretezéssel és automatikus védelemmel kezelte.`;

  return { tradeId, szoveg };
}

module.exports = { aiTradeExplain };
