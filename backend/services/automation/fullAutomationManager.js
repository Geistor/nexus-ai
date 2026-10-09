const { shouldPromote } = require('./autoDeployPolicy');
const { suggestTuning } = require('./autoTune');
const { reinvestPlan } = require('./autoScaleReinvest');

function automationSummary(input = {}) {
  return {
    promote: shouldPromote(input.build || {}),
    tuning: suggestTuning(input.metrics || {}),
    reinvest: reinvestPlan(input.performance || {})
  };
}
module.exports = { automationSummary };
