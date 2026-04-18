const { RSI, EMA, MACD, ATR } = require('technicalindicators');

async function fetchFeatures(ctx, symbol, timeframe = null, historyLimit = null, includeChartData = false) {
  const tf = timeframe || ctx.CONFIG.timeframe;
  const limit = historyLimit || ctx.CONFIG.historyLimit;
  const candles = await ctx.primaryExchange.fetchOHLCV(symbol, tf, undefined, limit);
  const closes = candles.map(c => c[4]);
  const highs = candles.map(c => c[2]);
  const lows = candles.map(c => c[3]);
  const volumes = candles.map(c => c[5]);

  const price = closes.at(-1);
  const rsiSeries = RSI.calculate({ values: closes, period: 14 });
  const ema20Series = EMA.calculate({ values: closes, period: 20 });
  const ema50Series = EMA.calculate({ values: closes, period: 50 });
  const macdSeries = MACD.calculate({
    values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
    SimpleMAOscillator: false, SimpleMASignal: false
  });
  const atrSeries = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });

  const recentVol = volumes.slice(-20);
  const avgVol = recentVol.reduce((a, b) => a + b, 0) / Math.max(1, recentVol.length);

  const out = {
    symbol,
    price,
    rsi: ctx.helpers.safeNum(rsiSeries.at(-1), 50),
    ema20: ctx.helpers.safeNum(ema20Series.at(-1), price),
    ema50: ctx.helpers.safeNum(ema50Series.at(-1), price),
    macd: macdSeries.at(-1) || { MACD: 0, signal: 0, histogram: 0 },
    atr: ctx.helpers.safeNum(atrSeries.at(-1), price * 0.005),
    volRatio: avgVol ? volumes.at(-1) / avgVol : 1
  };

  if (includeChartData) {
    const candleData = candles.map(c => ({ time: Math.floor(c[0] / 1000), open: c[1], high: c[2], low: c[3], close: c[4] }));
    out.candleData = candleData;
    out.ema20Data = candleData.slice(19).map((c, i) => ({ time: c.time, value: ema20Series[i] }));
    out.ema50Data = candleData.slice(49).map((c, i) => ({ time: c.time, value: ema50Series[i] }));
  }

  return out;
}

module.exports = { fetchFeatures };
