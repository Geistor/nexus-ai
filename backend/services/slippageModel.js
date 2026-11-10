function estimateSlippagePct(features, venueStats = null, side = 'BUY') {
  const atr = Number(features?.atr || 0);
  const price = Math.max(1, Number(features?.price || features?.close || 1));
  const volRatio = Number(features?.volRatio || 1);
  const atrPct = atr / price;

  let base = 0.00035 + atrPct * 0.20;
  if (volRatio < 0.9) base += 0.00025;
  if (volRatio > 1.5) base -= 0.00010;

  const fillPenalty = 1 - Number(venueStats?.fillQualityScore ?? 0.55);
  const rejectPenalty = Number(venueStats?.rejectRate ?? 0.01) * 0.5;
  base += fillPenalty * 0.0004 + rejectPenalty * 0.0004;

  if (side === 'SELL') base += 0.00005;
  return Math.max(0.0001, Number(base.toFixed(6)));
}

function adjustEntryForSlippage(entry, slippagePct, side) {
  if (side === 'BUY') return entry * (1 + slippagePct);
  if (side === 'SELL') return entry * (1 - slippagePct);
  return entry;
}

module.exports = { estimateSlippagePct, adjustEntryForSlippage };
