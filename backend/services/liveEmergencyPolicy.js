const { getEmergencyPolicy } = require('./stagePolicies');

function evaluateLiveEmergency(ctx) {
  const stage = ctx.state.workflow?.stage || 'paper';
  const policy = getEmergencyPolicy(stage, ctx.state.stagePolicies);
  const equity = Math.max(1, Number(ctx.state.equity || 0));
  const peak = Math.max(equity, Number(ctx.state.peakEquity || equity));
  const drawdownPct = peak > 0 ? Math.max(0, (peak - equity) / peak) : 0;
  const totalOpen = Object.keys(ctx.state.openPositions || {}).length;

  const liveThreshold = 0.08;
  const stagingThreshold = 0.12;
  const threshold = stage === 'live' ? liveThreshold : (stage === 'staging' ? stagingThreshold : 1);

  const triggered = drawdownPct >= threshold;
  return {
    stage,
    triggered,
    threshold,
    drawdownPct: Number(drawdownPct.toFixed(4)),
    totalOpen,
    policy
  };
}

function applyEmergencyPolicy(ctx, emergency) {
  if (!emergency?.triggered) return { applied: false, reason: 'not_triggered' };

  if (emergency.policy?.freezeTrading) {
    ctx.state.botRunning = false;
    ctx.state.workflow = ctx.state.workflow || {};
    ctx.state.workflow.status = 'emergency_stopped';
  }

  if (emergency.stage === 'live') {
    ctx.state.workflow = ctx.state.workflow || {};
    ctx.state.workflow.stage = 'staging';
    ctx.state.workflow.mode = 'paper';
    ctx.state.workflow.lastStageChangeAt = new Date().toISOString();
    ctx.state.workflow.lastAutoDowngradeAt = new Date().toISOString();
  }

  const closed = [];
  if (emergency.policy?.autoClosePositions) {
    for (const [key, pos] of Object.entries(ctx.state.openPositions || {})) {
      closed.push({ key, symbol: pos.symbol, venue: pos.venue, side: pos.side, size: pos.size });
      delete ctx.state.openPositions[key];
    }
  }

  return {
    applied: true,
    emergency,
    autoClosedPositions: closed
  };
}

module.exports = { evaluateLiveEmergency, applyEmergencyPolicy };
