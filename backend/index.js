require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createContext } = require('./services/state');
const { startPriceSockets, refreshFastPrices } = require('./services/marketData');
const { loadActiveModel, neuralDecision } = require('./services/ai');
const { fetchFeatures } = require('./services/features');
const { scanArbitrage } = require('./services/arbitrage');
const { evaluateKillSwitch, manageOpenPosition, executeDecision } = require('./services/execution');

const app = express();
app.use(cors());
app.use(express.json());

const ctx = createContext();
ensureStructure(ctx);
ctx.state.persistence = restorePersistenceSummary(ctx);

app.get('/api/dashboard', (req, res) => {
  res.json({
    config: ctx.CONFIG,
    state: {
      equity: ctx.state.equity,
      peakEquity: ctx.state.peakEquity,
      dailyStartEquity: ctx.state.dailyStartEquity,
      drawdownPct: ctx.helpers.drawdownPct(),
      dailyLossPct: ctx.helpers.dailyLossPct(),
      botEnabled: ctx.state.botEnabled,
      killSwitch: ctx.state.killSwitch,
      openPositions: ctx.state.openPositions,
      aiDecision: ctx.state.aiDecision,
      features: ctx.state.featureCache,
      stats: ctx.state.stats,
      modelLoaded: ctx.state.modelLoaded,
      modelInfo: ctx.state.modelInfo,
      latencyStats: ctx.state.latencyStats,
      priceCache: ctx.state.priceCache
    },
    alerts: ctx.state.alerts,
    logs: ctx.state.logs,
    closedTrades: ctx.state.closedTrades,
    equitySeries: ctx.state.equitySeries,
    arbitrage: ctx.state.arbitrage
  });
});

app.get('/api/chart', async (req, res) => {
  try {
    const symbol = req.query.symbol || ctx.CONFIG.symbols[0];
    const timeframe = req.query.timeframe || ctx.CONFIG.timeframe;
    const out = await fetchFeatures(ctx, symbol, timeframe, 300, true);
    const markers = ctx.state.closedTrades
      .filter(t => t.symbol === symbol)
      .slice(0, 50)
      .map(t => ({
        time: Math.floor(new Date(t.closedAt).getTime() / 1000),
        position: t.side === 'BUY' ? 'belowBar' : 'aboveBar',
        color: t.pnl >= 0 ? '#22dd88' : '#ff687f',
        shape: t.side === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: `${t.side} ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}`
      }));

    const openPos = ctx.state.openPositions[symbol];
    if (openPos) {
      markers.unshift({
        time: Math.floor(new Date(openPos.openedAt).getTime() / 1000),
        position: openPos.side === 'BUY' ? 'belowBar' : 'aboveBar',
        color: openPos.side === 'BUY' ? '#22dd88' : '#ff687f',
        shape: openPos.side === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: `${openPos.side} OPEN`
      });
    }

    res.json({
      symbol,
      timeframe,
      candles: out.candleData,
      ema20: out.ema20Data,
      ema50: out.ema50Data,
      markers,
      openPosition: openPos || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bot/start', (req, res) => {
  if (ctx.state.killSwitch) return res.status(400).json({ ok: false, message: 'Kill switch active. Reset required.' });
  ctx.state.botEnabled = true;
  ctx.helpers.pushLog('INFO', 'Bot started');
  res.json({ ok: true });
});

app.post('/api/bot/stop', (req, res) => {
  ctx.state.botEnabled = false;
  ctx.helpers.pushLog('INFO', 'Bot stopped');
  res.json({ ok: true });
});

app.post('/api/bot/reset-kill-switch', (req, res) => {
  ctx.state.killSwitch = false;
  ctx.helpers.pushLog('INFO', 'Kill switch reset');
  res.json({ ok: true });
});


app.post('/api/ai/explain', async (req, res) => {
  try {
    const out = await aiExplain(ctx, req.body || {});
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});



app.get('/api/trades', (req, res) => {
  const symbol = req.query.symbol || '';
  const venue = req.query.venue || '';
  const side = req.query.side || '';
  let trades = [...(ctx.state.closedTrades || [])];

  if (symbol) trades = trades.filter(t => String(t.symbol || '').toLowerCase().includes(String(symbol).toLowerCase()));
  if (venue) trades = trades.filter(t => String(t.venue || '').toLowerCase().includes(String(venue).toLowerCase()));
  if (side) trades = trades.filter(t => String(t.side || '').toLowerCase() === String(side).toLowerCase());

  res.json({ trades });
});

app.post('/api/maintenance/retention-run', (req, res) => {
  try {
    const result = runRetentionCycle(ctx);
    ctx.state.maintenance.retention.lastRunAt = new Date().toISOString();
    ctx.state.maintenance.retention.lastResult = result;
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/ai/trade-explain', async (req, res) => {
  try {
    const out = await aiTradeExplain(ctx, req.body || {});
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


app.post('/api/persistence/snapshot', (req, res) => {
  try {
    const result = createPersistenceSnapshot(ctx, req.body?.label || 'manual');
    ctx.state.persistence = restorePersistenceSummary(ctx);
    res.json({ ok: true, result, persistence: ctx.state.persistence });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/persistence/merge', (req, res) => {
  try {
    const result = mergePersistenceFolder(ctx, req.body?.importRoot || '');
    ctx.state.persistence = restorePersistenceSummary(ctx);
    res.json({ ok: true, result, persistence: ctx.state.persistence });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.use('/', express.static(path.join(__dirname, '..', 'frontend')));

async function tradingLoop() {
  if (ctx.state.killSwitch) return;

  try {
    await refreshFastPrices(ctx);
    await scanArbitrage(ctx);

    const bundle = await Promise.all(
      ctx.CONFIG.symbols.map(async (symbol) => {
        const features = await fetchFeatures(ctx, symbol);
        ctx.state.featureCache[symbol] = features;
        manageOpenPosition(ctx, symbol, features.price);
        const decision = await neuralDecision(ctx, features);
        ctx.state.aiDecision[symbol] = decision;
        return { symbol, features, decision };
      })
    );

    if (!evaluateKillSwitch(ctx)) return;
    await Promise.all(bundle.map(({ symbol, features, decision }) => executeDecision(ctx, symbol, decision, features)));
  } catch (err) {
    ctx.helpers.pushAlert('critical', 'Main loop failure -> kill switch', { message: err.message });
    ctx.state.killSwitch = true;
    ctx.state.botEnabled = false;
  }
}

(async () => {
  startPriceSockets(ctx);
  await loadActiveModel(ctx);
  setInterval(tradingLoop, ctx.CONFIG.pollMs);
  app.listen(ctx.CONFIG.port, () => {
    ctx.helpers.pushLog('INFO', 'NEXUS v17 started', { port: ctx.CONFIG.port, dryRun: ctx.CONFIG.dryRun, symbols: ctx.CONFIG.symbols });
  });
})();
