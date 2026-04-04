const { allocationMultiplier } = require('./capitalAllocator');
const { buildExecutionPlan } = require('./executionOptimizer');
const { journalTradeOpen, journalTradeClose } = require('./journal');
async function ensureBinanceHedgeMode(ctx) {
  try {
    await ctx.exchanges.binance.fapiPrivatePostPositionSideDual({ dualSidePosition: 'true', timestamp: Date.now() });
  } catch (_) {}
}

async function setBinanceLeverage(ctx, symbol, leverage = 3) {
  try {
    const market = ctx.exchanges.binance.market(symbol);
    await ctx.exchanges.binance.fapiPrivatePostLeverage({ symbol: market.id, leverage, timestamp: Date.now() });
  } catch (_) {}
}

function evaluateKillSwitch(ctx) {
  if (ctx.helpers.drawdownPct() >= ctx.CONFIG.maxDrawdownPct) {
    ctx.state.killSwitch = true;
    ctx.state.botEnabled = false;
    ctx.helpers.pushAlert('critical', 'Kill switch activated: max drawdown reached', { drawdown: ctx.helpers.drawdownPct() });
    return false;
  }
  if (ctx.helpers.dailyLossPct() >= ctx.CONFIG.maxDailyLossPct) {
    ctx.state.killSwitch = true;
    ctx.state.botEnabled = false;
    ctx.helpers.pushAlert('critical', 'Kill switch activated: max daily loss reached', { dailyLoss: ctx.helpers.dailyLossPct() });
    return false;
  }
  return true;
}

function closePosition(ctx, symbol, exitPrice, reason) {
  const p = ctx.state.openPositions[symbol];
  if (!p) return;

  const pnl = p.side === 'BUY' ? (exitPrice - p.entry) * p.size : (p.entry - exitPrice) * p.size;

  ctx.state.equity += pnl;
  ctx.state.peakEquity = Math.max(ctx.state.peakEquity, ctx.state.equity);
  ctx.state.equitySeries.push(ctx.state.equity);
  ctx.state.equitySeries = ctx.state.equitySeries.slice(-400);

  const tradeId = p.tradeId || ('trade_' + Date.now() + '_' + symbol.replace('/','_'));
  ctx.state.closedTrades.unshift({ ...p, tradeId, exit: exitPrice, pnl, reason, closedAt: new Date().toISOString() });
  ctx.state.closedTrades = ctx.state.closedTrades.slice(0, 250);

  ctx.state.stats.totalTrades += 1;
  ctx.state.stats.pnl += pnl;
  if (pnl >= 0) ctx.state.stats.wins += 1; else ctx.state.stats.losses += 1;
  ctx.helpers.updateWinRate();

  journalTradeClose(ctx, p, exitPrice, pnl, reason);
  delete ctx.state.openPositions[symbol];
  ctx.helpers.pushAlert(pnl >= 0 ? 'success' : 'warning', `Position closed: ${symbol} ${reason}`, { pnl, exitPrice });
}

function manageOpenPosition(ctx, symbol, currentPrice) {
  const p = ctx.state.openPositions[symbol];
  if (!p) return;

  if (p.side === 'BUY' && currentPrice > p.entry) {
    const candidate = currentPrice - p.atr * 1.2;
    p.stopLoss = Math.max(p.stopLoss, candidate);
  }

  const hitStop = p.side === 'BUY' ? currentPrice <= p.stopLoss : currentPrice >= p.stopLoss;
  const hitTake = p.side === 'BUY' ? currentPrice >= p.takeProfit : currentPrice <= p.takeProfit;

  if (hitStop) closePosition(ctx, symbol, currentPrice, 'STOP_LOSS');
  else if (hitTake) closePosition(ctx, symbol, currentPrice, 'TAKE_PROFIT');
}

async function executeDecision(ctx, symbol, decision, features) {
  if (!ctx.state.botEnabled || ctx.state.killSwitch || ctx.state.openPositions[symbol] || decision.action === 'HOLD') return;

  const entry = features.price;
  const atr = features.atr;
  const allocMult = allocationMultiplier(ctx, symbol, decision, features);
  const rawStopLoss = decision.action === 'BUY' ? entry - atr * ctx.CONFIG.atrStopMultiplier : entry + atr * ctx.CONFIG.atrStopMultiplier;
  const rawTakeProfit = decision.action === 'BUY' ? entry + atr * ctx.CONFIG.atrTakeMultiplier : entry - atr * ctx.CONFIG.atrTakeMultiplier;
  let size = ctx.helpers.calculatePositionSize(entry, rawStopLoss);
  size = Number((size * allocMult).toFixed(6));
  if (!size) return;

  if (ctx.CONFIG.dryRun) {
    ctx.state.openPositions[symbol] = { symbol, side: decision.action, entry, stopLoss, takeProfit, size, atr, confidence: decision.confidence, openedAt: new Date().toISOString(), dryRun: true };
    ctx.helpers.pushAlert('info', `Dry-run position opened: ${symbol}`, ctx.state.openPositions[symbol]);
    return;
  }

  try {
    await ensureBinanceHedgeMode(ctx);
    await setBinanceLeverage(ctx, symbol, 3);

    if (decision.action === 'BUY') {
      await ctx.primaryExchange.createOrder(symbol, 'market', 'buy', size, undefined, { positionSide: 'LONG', reduceOnly: false });
      ctx.state.openPositions[symbol] = { symbol, side: 'BUY', entry, stopLoss, takeProfit, size, atr, confidence: decision.confidence, openedAt: new Date().toISOString(), dryRun: false };
      ctx.helpers.pushAlert('info', `Live BUY order executed: ${symbol}`, ctx.state.openPositions[symbol]);
    } else if (decision.action === 'SELL') {
      await ctx.primaryExchange.createOrder(symbol, 'market', 'sell', size, undefined, { positionSide: 'SHORT', reduceOnly: false });
      ctx.state.openPositions[symbol] = { symbol, side: 'SELL', entry, stopLoss, takeProfit, size, atr, confidence: decision.confidence, openedAt: new Date().toISOString(), dryRun: false };
      ctx.helpers.pushAlert('info', `Live SHORT order executed: ${symbol}`, ctx.state.openPositions[symbol]);
    }
  } catch (err) {
    ctx.helpers.pushAlert('critical', 'Execution error -> kill switch', { symbol, message: err.message });
    ctx.state.killSwitch = true;
    ctx.state.botEnabled = false;
  }
}

module.exports = { evaluateKillSwitch, manageOpenPosition, executeDecision };
