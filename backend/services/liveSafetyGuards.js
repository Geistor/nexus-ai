const { isVenueAllowed, isSymbolAllowed } = require('./stagePolicies');
function num(v, d = 0) { return Number.isFinite(Number(v)) ? Number(v) : d; }

function getGuardConfig(stage = 'paper') {
  if (stage === 'staging') {
    return {
      maxConcurrentPositions: 2,
      maxPositionUsd: 250,
      maxDailyLossPct: 0.015,
      maxSymbolExposurePct: 0.20,
      requireSandbox: true,
      allowLiveOrderSend: false,
      maxLeverage: 3
    };
  }
  if (stage === 'live') {
    return {
      maxConcurrentPositions: 4,
      maxPositionUsd: 1000,
      maxDailyLossPct: 0.03,
      maxSymbolExposurePct: 0.35,
      requireSandbox: false,
      allowLiveOrderSend: true,
      maxLeverage: 5
    };
  }
  return {
    maxConcurrentPositions: 6,
    maxPositionUsd: 999999,
    maxDailyLossPct: 0.10,
    maxSymbolExposurePct: 0.80,
    requireSandbox: false,
    allowLiveOrderSend: false,
    maxLeverage: 10
  };
}

function computeTodayPnl(state) {
  const today = new Date().toISOString().slice(0, 10);
  return (state.closedTrades || [])
    .filter(t => String(t.closedAt || t.time || '').slice(0, 10) === today)
    .reduce((s, t) => s + num(t.pnl), 0);
}

function computeSymbolExposureUsd(state, symbol) {
  return Object.values(state.openPositions || {})
    .filter(p => p.symbol === symbol)
    .reduce((s, p) => s + Math.abs(num(p.entry) * num(p.size)), 0);
}

function evaluateExecutionGuards(ctx, symbol, venue, decision, features, proposedSize) {
  const stage = ctx.state.workflow?.stage || 'paper';
  const cfg = getGuardConfig(stage);
  const openPositions = Object.values(ctx.state.openPositions || {});
  const equity = Math.max(1, num(ctx.state.equity, 1000));
  const proposedUsd = Math.abs(num(features?.price) * num(proposedSize));
  const symbolExposureUsd = computeSymbolExposureUsd(ctx.state, symbol);
  const symbolExposurePct = (symbolExposureUsd + proposedUsd) / equity;
  const todayPnl = computeTodayPnl(ctx.state);
  const dailyLossPct = todayPnl < 0 ? Math.abs(todayPnl) / equity : 0;
  const leverage = num(venue?.leverage || venue?.settings?.leverage || 1, 1);

  const failures = [];
  if (openPositions.length >= cfg.maxConcurrentPositions) failures.push(`Túl sok nyitott pozíció (${openPositions.length}/${cfg.maxConcurrentPositions})`);
  if (proposedUsd > cfg.maxPositionUsd) failures.push(`Túl nagy pozícióméret USD-ben (${proposedUsd.toFixed(2)}/${cfg.maxPositionUsd})`);
  if (symbolExposurePct > cfg.maxSymbolExposurePct) failures.push(`Túl nagy szimbólum kitettség (${(symbolExposurePct*100).toFixed(2)}%/${(cfg.maxSymbolExposurePct*100).toFixed(2)}%)`);
  if (dailyLossPct > cfg.maxDailyLossPct) failures.push(`Napi veszteség limit sérül (${(dailyLossPct*100).toFixed(2)}%/${(cfg.maxDailyLossPct*100).toFixed(2)}%)`);
  if (!isVenueAllowed(stage, venue?.exchangeName, ctx.state.stagePolicies)) failures.push(`A venue nincs whitelistelve ebben a stage-ben (${venue?.exchangeName || 'unknown'})`);
  if (!isSymbolAllowed(stage, symbol, ctx.state.stagePolicies)) failures.push(`A symbol nincs whitelistelve ebben a stage-ben (${symbol})`);
  if (cfg.requireSandbox && !venue?.sandbox) failures.push('Staging módban csak tesztkörnyezet engedélyezett');
  if (leverage > cfg.maxLeverage) failures.push(`Tőkeáttét túl magas (${leverage}/${cfg.maxLeverage})`);
  if (stage !== 'live' && decision?.action && decision.action !== 'HOLD' && ctx.CONFIG.dryRun !== true && cfg.allowLiveOrderSend === false) {
    failures.push('Ebben a stage-ben az élő order küldés tiltva van');
  }

  return {
    stage,
    config: cfg,
    passed: failures.length === 0,
    failures,
    diagnostics: {
      openPositions: openPositions.length,
      proposedUsd: Number(proposedUsd.toFixed(2)),
      symbolExposurePct: Number(symbolExposurePct.toFixed(4)),
      dailyLossPct: Number(dailyLossPct.toFixed(4)),
      leverage
    }
  };
}

module.exports = { getGuardConfig, evaluateExecutionGuards, computeTodayPnl };
