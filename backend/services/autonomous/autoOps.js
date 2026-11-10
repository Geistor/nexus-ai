const { autoPilotPlan } = require('./autoPilot');
const { retrainDecision } = require('./autoRetrainLoop');
function autonomousSummary(ctx) {
  return { pilot: autoPilotPlan(ctx), retrain: retrainDecision(ctx), canRunWithoutOperator: !!ctx.state.remoteStorage?.enabled };
}
module.exports = { autonomousSummary };
