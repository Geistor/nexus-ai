function autoPilotPlan(ctx) {
  const workflow = ctx.state.workflow || {};
  const promote = !!ctx.state.automationSummary?.promote;
  const reinvest = ctx.state.automationSummary?.reinvest || { mode: 'preserve', reinvestPct: 0 };
  const evolve = ctx.state.brainState?.selfEvolving || { mode: 'stable' };
  let nextAction = 'observe';
  if (workflow.stage === 'paper' && promote) nextAction = 'promote_to_staging';
  else if (workflow.stage === 'staging' && promote && evolve.mode !== 'repair') nextAction = 'prepare_live';
  else if (workflow.stage === 'live' && reinvest.mode === 'compound') nextAction = 'scale_up';
  else if (evolve.mode === 'repair') nextAction = 'reduce_risk_and_retrain';
  return { nextAction, workflowStage: workflow.stage || 'paper', reinvestMode: reinvest.mode, evolveMode: evolve.mode };
}
module.exports = { autoPilotPlan };
