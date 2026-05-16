const { evaluatePromotion, canSetStage } = require('./promotionRules');
function computePaperStats(state) {
  const trades = state.closedTrades || [];
  const total = trades.length;
  const wins = trades.filter(t => Number(t.pnl || 0) > 0).length;
  const netPnl = trades.reduce((s, t) => s + Number(t.pnl || 0), 0);
  const winRate = total ? wins / total : 0;
  return {
    totalTrades: total,
    wins,
    losses: total - wins,
    winRate: Number(winRate.toFixed(4)),
    netPnl: Number(netPnl.toFixed(2))
  };
}

function evaluateReadiness(state) {
  const stats = computePaperStats(state);
  const exchangeCount = Object.keys(state.exchangeConnections || {}).length;
  const hasRemote = !!state.remoteStorage?.enabled;
  const hasModel = !!state.modelLoaded;
  const enoughPaper = stats.totalTrades >= 10;
  const profitable = stats.netPnl > 0;
  const decentWinRate = stats.winRate >= 0.45;

  return {
    exchangeCount,
    hasRemoteStorage: hasRemote,
    hasModel,
    enoughPaperHistory: enoughPaper,
    profitablePaper: profitable,
    decentWinRate,
    canPromoteToLive: exchangeCount > 0 && hasRemote && enoughPaper && profitable && decentWinRate
  };
}

function getWorkflowState(ctx) {
  const mode = ctx.state.workflow?.mode || 'paper_safe';
  const status = ctx.state.workflow?.status || 'idle';
  const stats = computePaperStats(ctx.state);
  const readiness = evaluateReadiness(ctx.state);
  const promotion = evaluatePromotion(ctx.state);
  return {
    mode,
    status,
    stage: ctx.state.workflow?.stage || 'paper',
    stats,
    readiness,
    promotion,
    lastStartAt: ctx.state.workflow?.lastStartAt || null,
    lastStopAt: ctx.state.workflow?.lastStopAt || null,
    liveApprovalAt: ctx.state.workflow?.liveApprovalAt || null
  };
}

function setWorkflowMode(ctx, mode) {
  const allowed = new Set(['paper', 'paper_safe', 'live_armed', 'live']);
  if (!allowed.has(mode)) throw new Error('Érvénytelen workflow mód.');
  ctx.state.workflow = ctx.state.workflow || {};
  ctx.state.workflow.mode = mode;
  return getWorkflowState(ctx);
}

function markStarted(ctx) {
  ctx.state.workflow = ctx.state.workflow || {};
  ctx.state.workflow.status = 'running';
  ctx.state.workflow.lastStartAt = new Date().toISOString();
  return getWorkflowState(ctx);
}

function markStopped(ctx) {
  ctx.state.workflow = ctx.state.workflow || {};
  ctx.state.workflow.status = 'stopped';
  ctx.state.workflow.lastStopAt = new Date().toISOString();
  return getWorkflowState(ctx);
}

function armLive(ctx) {
  const readiness = evaluateReadiness(ctx.state);
  if (!readiness.canPromoteToLive) throw new Error('A rendszer még nem kész élő módra.');
  ctx.state.workflow = ctx.state.workflow || {};
  ctx.state.workflow.mode = 'live_armed';
  ctx.state.workflow.liveApprovalAt = new Date().toISOString();
  return getWorkflowState(ctx);
}




function setWorkflowStage(ctx, stage) {
  const gate = canSetStage(ctx.state, stage);
  if (!gate.ok) throw new Error(gate.reason || 'A stage váltás nem engedélyezett.');
  ctx.state.workflow = ctx.state.workflow || {};
  ctx.state.workflow.stage = stage;
  if (stage === 'paper') ctx.state.workflow.mode = 'paper_safe';
  if (stage === 'staging') ctx.state.workflow.mode = 'paper';
  if (stage === 'live') ctx.state.workflow.mode = 'live';
  ctx.state.workflow.lastStageChangeAt = new Date().toISOString();
  return getWorkflowState(ctx);
}

module.exports = { getWorkflowState, setWorkflowMode, setWorkflowStage, markStarted, markStopped, armLive, evaluateReadiness };
