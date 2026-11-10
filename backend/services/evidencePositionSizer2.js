'use strict';

function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, num(v, min))); }

function sizePosition(input = {}) {
  const baseNotionalUsd = Math.max(0, num(input.baseNotionalUsd));
  const availableCapitalUsd = Math.max(0, num(input.availableCapitalUsd, baseNotionalUsd));
  const venueRiskBudgetUsd = Math.max(0, num(input.venueRiskBudgetUsd, availableCapitalUsd));
  const maxPositionSizePct = clamp(input.maxPositionSizePct ?? 5, 0.01, 100);
  const evidence = input.routeEvidence || null;
  const quality = input.qualityAutopilot || {};
  const drawdownPct = Math.max(0, num(input.drawdownPct));
  const activeLearningProbe = input.activeLearningProbe === true;
  const maxByCapital = availableCapitalUsd * maxPositionSizePct / 100;
  const hardCap = Math.max(0, Math.min(venueRiskBudgetUsd || Infinity, maxByCapital || Infinity));
  let evidenceFactor = 1;
  let state = 'neutral';
  const reasons = [];

  if (activeLearningProbe) {
    evidenceFactor = 1;
    state = 'probe-authority-unchanged';
    reasons.push('probe-sizing-remains-authoritative-and-bounded-elsewhere');
  } else if (!evidence || evidence.sampleStatus !== 'qualified' || num(evidence.reliability) < 0.30) {
    evidenceFactor = 0.78;
    state = 'warmup';
    reasons.push('insufficient-qualified-route-evidence');
  } else if (num(evidence.expectancyUsd) <= 0 || num(evidence.profitFactor) < 0.95) {
    evidenceFactor = clamp(0.72 - num(evidence.reliability) * 0.22, 0.45, 0.72);
    state = 'de-rated';
    reasons.push('negative-after-cost-evidence');
  } else if (num(evidence.expectancyUsd) > 0 && num(evidence.profitFactor) >= 1.15 && num(evidence.reliability) >= 0.55) {
    evidenceFactor = clamp(1 + num(evidence.reliability) * 0.12, 1.03, 1.12);
    state = 'qualified-positive';
    reasons.push('positive-qualified-after-cost-evidence');
  }

  if(!activeLearningProbe && quality.riskIncreaseEligible!==true){evidenceFactor=Math.min(1,evidenceFactor);reasons.push('no-forward-qualified-champion-no-evidence-boost');}
  const qualityFactor = activeLearningProbe ? 1 : clamp(quality.riskMultiplier ?? 1, 0.55, 1.08);
  const drawdownFactor = activeLearningProbe ? 1 : drawdownPct >= 6 ? 0.45 : drawdownPct >= 3 ? 0.70 : drawdownPct >= 1.5 ? 0.88 : 1;
  if (drawdownFactor < 1) reasons.push('drawdown-de-rating');
  const combinedFactor = clamp(evidenceFactor * qualityFactor * drawdownFactor, activeLearningProbe ? 1 : 0.35, activeLearningProbe ? 1 : 1.18);
  const proposed = baseNotionalUsd * combinedFactor;
  const finalNotionalUsd = hardCap > 0 ? Math.min(proposed, hardCap) : 0;
  return {
    version: 'evidence-position-sizer-2.0',
    authority: activeLearningProbe ? 'probe-authority-preserved' : 'bounded-notional-multiplier',
    state,
    baseNotionalUsd: Number(baseNotionalUsd.toFixed(4)),
    evidenceFactor: Number(evidenceFactor.toFixed(4)),
    qualityFactor: Number(qualityFactor.toFixed(4)),
    drawdownFactor: Number(drawdownFactor.toFixed(4)),
    combinedFactor: Number(combinedFactor.toFixed(4)),
    hardCapUsd: Number((Number.isFinite(hardCap) ? hardCap : 0).toFixed(4)),
    finalNotionalUsd: Number(finalNotionalUsd.toFixed(4)),
    reasons,
    evidence: evidence ? {
      trades: num(evidence.trades), reliability: num(evidence.reliability), expectancyUsd: num(evidence.expectancyUsd), profitFactor: num(evidence.profitFactor), score: num(evidence.score)
    } : null,
    policy: 'no-boost-without-qualified-positive-after-cost-evidence; max-boost-1.18; drawdown-and-venue-budget-hard-caps'
  };
}

module.exports = { sizePosition };
