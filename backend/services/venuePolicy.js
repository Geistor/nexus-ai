const { canOpenOnVenue } = require('./venueRisk');
const { getVenueFeeModel } = require('./feeModel');

function chooseBestVenueAdvanced({ ctx, symbol, action, balances, prices, latencyStats, venueStats }) {
  const candidates = [];
  for (const [exchangeName, venuePrices] of Object.entries(prices)) {
    const px = venuePrices?.[symbol];
    const bal = balances?.[exchangeName]?.usdtFree ?? 0;
    const latency = latencyStats?.[exchangeName]?.avgMs ?? 9999;
    const fees = getVenueFeeModel(exchangeName, 'future');
    const fillScore = venueStats?.[exchangeName]?.fillQualityScore ?? 0.5;
    const rejectRate = venueStats?.[exchangeName]?.rejectRate ?? 0;
    if (!px || bal <= 10) continue;
    if (!canOpenOnVenue(ctx.state, ctx.CONFIG, exchangeName)) continue;
    let score = 0;
    score += Math.max(0, bal / 1000);
    score += Math.max(0, (500 - latency) / 500);
    score += fillScore;
    score -= rejectRate;
    score -= fees.taker * 100;
    if (action === 'SELL' && !['binance', 'bybit', 'okx'].includes(exchangeName)) continue;
    candidates.push({ exchangeName, symbol, action, score, price: px });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}
module.exports = { chooseBestVenueAdvanced };
