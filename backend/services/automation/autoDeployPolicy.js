function shouldPromote(build = {}) {
  return !!build.testsOk && !!build.paperOk && !!build.riskOk;
}
module.exports = { shouldPromote };
