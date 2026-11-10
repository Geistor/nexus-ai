function chooseLatencyProfile(stats = {}) {
  const pingMs = Number(stats.pingMs || 250);
  const wsLagMs = Number(stats.wsLagMs || 250);
  if (pingMs < 80 && wsLagMs < 120) return { profile: 'aggressive', throttleMs: 0 };
  if (pingMs < 180 && wsLagMs < 250) return { profile: 'balanced', throttleMs: 100 };
  return { profile: 'defensive', throttleMs: 300 };
}
module.exports = { chooseLatencyProfile };
