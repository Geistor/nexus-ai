function estimateFeesPct(exchangeName) {
  const map = { binance: 0.001, bybit: 0.001, kraken: 0.0026, okx: 0.001 };
  return map[exchangeName] || 0.0015;
}

async function scanArbitrage(ctx) {
  const found = [];

  for (const symbol of ctx.CONFIG.symbols) {
    const pairs = [];
    for (const exchangeName of ctx.activeExchanges) {
      const price = ctx.state.priceCache[exchangeName]?.[symbol];
      if (price) pairs.push([exchangeName, price]);
    }

    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const [aName, aPrice] = pairs[i];
        const [bName, bPrice] = pairs[j];
        const buyEx = aPrice < bPrice ? aName : bName;
        const sellEx = aPrice < bPrice ? bName : aName;
        const buyPrice = Math.min(aPrice, bPrice);
        const sellPrice = Math.max(aPrice, bPrice);
        const gross = (sellPrice - buyPrice) / buyPrice;
        const fees = estimateFeesPct(buyEx) + estimateFeesPct(sellEx);
        const net = gross - fees - 0.0008;

        if (net >= ctx.CONFIG.arbitrageMinNetEdgePct) {
          found.push({
            symbol, buyExchange: buyEx, sellExchange: sellEx,
            buyPrice, sellPrice, grossEdgePct: gross, netEdgePct: net
          });
        }
      }
    }
  }

  ctx.state.arbitrage = found.sort((a, b) => b.netEdgePct - a.netEdgePct).slice(0, 20);
}

module.exports = { scanArbitrage };
