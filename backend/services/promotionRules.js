function summarizeClosedTrades(closedTrades = []) {
  const total = closedTrades.length;
  const wins = closedTrades.filter(t => Number(t.pnl || 0) > 0).length;
  const netPnl = closedTrades.reduce((s, t) => s + Number(t.pnl || 0), 0);
  const grossWin = closedTrades.filter(t => Number(t.pnl || 0) > 0).reduce((s, t) => s + Number(t.pnl || 0), 0);
  const grossLoss = Math.abs(closedTrades.filter(t => Number(t.pnl || 0) < 0).reduce((s, t) => s + Number(t.pnl || 0), 0));
  const winRate = total ? wins / total : 0;
  const profitFactor = grossLoss ? grossWin / grossLoss : (grossWin > 0 ? 99 : 0);

  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const t of [...closedTrades].reverse()) {
    equity += Number(t.pnl || 0);
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }

  return {
    totalTrades: total,
    wins,
    losses: total - wins,
    netPnl: Number(netPnl.toFixed(2)),
    winRate: Number(winRate.toFixed(4)),
    profitFactor: Number(profitFactor.toFixed(2)),
    maxDrawdownPct: Number(maxDd.toFixed(4))
  };
}

function defaultThresholds() {
  return {
    paperToStaging: {
      minTrades: 20,
      minWinRate: 0.48,
      minNetPnl: 0,
      minProfitFactor: 1.05,
      maxDrawdownPct: 0.18,
      requireRemoteStorage: true,
      requireModel: false
    },
    stagingToLive: {
      minTrades: 40,
      minWinRate: 0.52,
      minNetPnl: 0,
      minProfitFactor: 1.10,
      maxDrawdownPct: 0.12,
      requireRemoteStorage: true,
      requireModel: true,
      minConnectedExchanges: 1
    }
  };
}

function checkGate(metrics, cfg, state) {
  const failures = [];
  if (metrics.totalTrades < cfg.minTrades) failures.push(`Kevés lezárt trade (${metrics.totalTrades}/${cfg.minTrades})`);
  if (metrics.winRate < cfg.minWinRate) failures.push(`Alacsony win rate (${(metrics.winRate*100).toFixed(1)}% / ${(cfg.minWinRate*100).toFixed(1)}%)`);
  if (metrics.netPnl < cfg.minNetPnl) failures.push(`Negatív vagy túl alacsony net PnL (${metrics.netPnl})`);
  if (metrics.profitFactor < cfg.minProfitFactor) failures.push(`Alacsony profit factor (${metrics.profitFactor}/${cfg.minProfitFactor})`);
  if (metrics.maxDrawdownPct > cfg.maxDrawdownPct) failures.push(`Túl magas drawdown (${(metrics.maxDrawdownPct*100).toFixed(2)}% / ${(cfg.maxDrawdownPct*100).toFixed(2)}%)`);
  if (cfg.requireRemoteStorage && !state.remoteStorage?.enabled) failures.push('Távoli storage nincs bekapcsolva');
  if (cfg.requireModel && !state.modelLoaded) failures.push('Nincs betöltött NN modell');
  if (cfg.minConnectedExchanges && Object.keys(state.exchangeConnections || {}).length < cfg.minConnectedExchanges) {
    failures.push(`Kevés csatlakoztatott tőzsde (${Object.keys(state.exchangeConnections || {}).length}/${cfg.minConnectedExchanges})`);
  }
  return { passed: failures.length === 0, failures };
}

function evaluatePromotion(state) {
  const metrics = summarizeClosedTrades(state.closedTrades || []);
  const thresholds = defaultThresholds();
  return {
    metrics,
    thresholds,
    gates: {
      paperToStaging: checkGate(metrics, thresholds.paperToStaging, state),
      stagingToLive: checkGate(metrics, thresholds.stagingToLive, state)
    }
  };
}

function currentWorkflowStage(state) {
  return state.workflow?.stage || 'paper';
}

function canSetStage(state, targetStage) {
  const promo = evaluatePromotion(state);
  const current = currentWorkflowStage(state);

  if (targetStage === 'paper') return { ok: true, reason: null };
  if (targetStage === 'staging') {
    if (promo.gates.paperToStaging.passed) return { ok: true, reason: null };
    return { ok: false, reason: promo.gates.paperToStaging.failures.join(' | ') || 'Paper→Staging feltételek nem teljesülnek' };
  }
  if (targetStage === 'live') {
    if (current !== 'staging') return { ok: false, reason: 'Live mód csak staging után engedélyezett.' };
    if (promo.gates.stagingToLive.passed) return { ok: true, reason: null };
    return { ok: false, reason: promo.gates.stagingToLive.failures.join(' | ') || 'Staging→Live feltételek nem teljesülnek' };
  }
  return { ok: false, reason: 'Ismeretlen stage.' };
}

module.exports = { summarizeClosedTrades, defaultThresholds, evaluatePromotion, currentWorkflowStage, canSetStage };
