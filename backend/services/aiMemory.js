const { loadMarketHistoryForSymbol } = require('./dataRetention');
function statAvg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + Number(b || 0), 0) / arr.length;
}

function getHistoricalTradeContext(ctx, symbol) {
  const closed = (ctx.state.closedTrades || []).filter(t => t.symbol === symbol);
  const wins = closed.filter(t => Number(t.pnl || 0) > 0);
  const losses = closed.filter(t => Number(t.pnl || 0) <= 0);

  return {
    total: closed.length,
    wins: wins.length,
    losses: losses.length,
    avgPnl: statAvg(closed.map(t => t.pnl || 0)),
    avgWin: statAvg(wins.map(t => t.pnl || 0)),
    avgLoss: statAvg(losses.map(t => t.pnl || 0)),
    recentReasons: closed.slice(0, 5).map(t => t.reason).filter(Boolean),
    venues: [...new Set(closed.map(t => t.venue).filter(Boolean))]
  };
}

function shouldUseHistoricalAssist(decision, features, history) {
  const lowConfidence = Number(decision?.confidence || 0) < 0.60;
  const weakTrend = Math.abs(Number(features?.ema20 || 0) - Number(features?.ema50 || 0)) / Math.max(1, Number(features?.price || 1)) < 0.0015;
  const enoughHistory = Number(history?.total || 0) >= 5;
  return enoughHistory && (lowConfidence || decision?.action === 'HOLD' || weakTrend);
}

function buildHistoricalAssistText(symbol, history) {
  if (!history || !history.total) {
    return `Ehhez a szimbólumhoz még nincs elég korábbi adat a történeti segítséghez.`;
  }

  return `A ${symbol} szimbólumhoz ${history.total} korábbi lezárt ügylet tartozik. `
    + `Nyertes kötések: ${history.wins}, vesztes kötések: ${history.losses}. `
    + `Átlagos eredmény kötésenként: ${Number(history.avgPnl || 0).toFixed(2)}. `
    + `Átlagos nyereség: ${Number(history.avgWin || 0).toFixed(2)}, átlagos veszteség: ${Number(history.avgLoss || 0).toFixed(2)}. `
    + (history.venues?.length ? `A rendszer korábban ezeken a tőzsdéken kereskedett ezzel a szimbólummal: ${history.venues.join(', ')}. ` : '')
    + (history.recentReasons?.length ? `Legutóbbi lezárási okok: ${history.recentReasons.join(', ')}.` : '');
}

function enrichDecisionWithHistory(ctx, symbol, decision, features) {
  const history = getHistoricalTradeContext(ctx, symbol);
  const marketRows = loadMarketHistoryForSymbol(ctx, symbol, 1000);
  const useAssist = shouldUseHistoricalAssist(decision, features, history);

  return {
    ...decision,
    historicalAssistUsed: useAssist,
    historicalContext: history,
    historicalMarketRows: marketRows.length,
    historicalAssistText: useAssist ? buildHistoricalAssistText(symbol, history) + ` A rendszer ${marketRows.length} piaci előzmény sort is el tud érni ehhez a szimbólumhoz.` : null
  };
}

module.exports = {
  getHistoricalTradeContext,
  shouldUseHistoricalAssist,
  buildHistoricalAssistText,
  enrichDecisionWithHistory
};
