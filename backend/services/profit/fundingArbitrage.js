function fundingArbScanner(ctx) {
  const out = [];
  const funding = ctx.state.fundingSnapshots || {};
  const venues = Object.keys(funding);
  for (let i = 0; i < venues.length; i++) {
    for (let j = i + 1; j < venues.length; j++) {
      const a = venues[i], b = venues[j];
      const sa = funding[a] || {}, sb = funding[b] || {};
      for (const symbol of Object.keys(sa)) {
        if (!(symbol in sb)) continue;
        const diff = Math.abs(Number(sa[symbol] || 0) - Number(sb[symbol] || 0));
        if (diff >= 0.01) out.push({ symbol, venueA: a, venueB: b, fundingDiff: Number(diff.toFixed(4)) });
      }
    }
  }
  return out.sort((x, y) => y.fundingDiff - x.fundingDiff).slice(0, 12);
}
module.exports = { fundingArbScanner };
