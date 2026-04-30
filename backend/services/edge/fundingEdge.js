function fundingBias(data = {}) {
  const fundingRate = Number(data.fundingRate || 0);
  const basisPct = Number(data.basisPct || 0);
  let bias = 'neutral';
  if (fundingRate > 0.01 && basisPct > 0.2) bias = 'short_bias';
  else if (fundingRate < -0.01 && basisPct < -0.2) bias = 'long_bias';
  return { bias, fundingRate, basisPct };
}
module.exports = { fundingBias };
