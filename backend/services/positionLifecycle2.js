'use strict';

function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, num(v, min))); }
function now() { return new Date().toISOString(); }

function ensureLifecycle(order = {}, profile = {}) {
  const qty = Math.max(0, num(order.quantity || order.amount));
  const existing = order.positionLifecycle2 && typeof order.positionLifecycle2 === 'object' ? order.positionLifecycle2 : {};
  const originalQty = Math.max(0, num(existing.originalQty, qty));
  const remainingQty = Math.max(0, Math.min(originalQty || qty, num(existing.remainingQty, originalQty || qty)));
  order.positionLifecycle2 = {
    version: 'position-lifecycle-2.0',
    originalQty,
    remainingQty,
    tp1Done: existing.tp1Done === true,
    tp2Done: existing.tp2Done === true,
    breakevenArmed: existing.breakevenArmed === true,
    realizedPartialGross: num(existing.realizedPartialGross),
    realizedPartialFees: num(existing.realizedPartialFees),
    realizedPartialSlippage: num(existing.realizedPartialSlippage),
    realizedPartialNet: num(existing.realizedPartialNet),
    partialFills: Array.isArray(existing.partialFills) ? existing.partialFills.slice(0, 12) : [],
    lastActionAt: existing.lastActionAt || null,
    profile: {
      tp1Fraction: clamp(profile.tp1Fraction ?? existing.profile?.tp1Fraction ?? 0.30, 0.1, 0.5),
      tp2Fraction: clamp(profile.tp2Fraction ?? existing.profile?.tp2Fraction ?? 0.30, 0.1, 0.5),
      runnerFraction: clamp(profile.runnerFraction ?? existing.profile?.runnerFraction ?? 0.40, 0.1, 0.8)
    }
  };
  return order.positionLifecycle2;
}

function stageThresholds(input = {}) {
  const tp = Math.max(0.01, num(input.takeProfitPct, 0.35));
  const cost = Math.max(0, num(input.estimatedCostPct, 0.15));
  return {
    tp1Pct: Number(Math.max(cost * 1.12, tp * 0.48).toFixed(4)),
    tp2Pct: Number(Math.max(cost * 1.28, tp * 0.78).toFixed(4)),
    breakevenArmPct: Number(Math.max(cost * 1.20, tp * 0.42).toFixed(4)),
    breakevenFloorPct: Number(Math.max(cost * 0.98, 0).toFixed(4))
  };
}

function evaluateLifecycle(order = {}, input = {}) {
  const state = ensureLifecycle(order, input.profile || {});
  const thresholds = stageThresholds(input);
  const move = num(input.marketMovePct);
  const holdingMs = Math.max(0, num(input.holdingMs));
  const minHoldMs = Math.max(0, num(input.minHoldMs));
  const original = Math.max(0, state.originalQty);
  if (move >= thresholds.breakevenArmPct || state.tp1Done) state.breakevenArmed = true;
  if (holdingMs < minHoldMs || !(original > 0) || !(state.remainingQty > 0)) {
    return { action: 'hold', state, thresholds, reason: 'min-hold-or-no-position' };
  }
  if (!state.tp1Done && move >= thresholds.tp1Pct) {
    const qty = Math.min(state.remainingQty, original * state.profile.tp1Fraction);
    return { action: 'partial-take-profit', stage: 'TP1', qty: Number(qty.toFixed(8)), state, thresholds, reason: 'tp1-threshold-hit' };
  }
  if (state.tp1Done && !state.tp2Done && move >= thresholds.tp2Pct) {
    const qty = Math.min(state.remainingQty, original * state.profile.tp2Fraction);
    return { action: 'partial-take-profit', stage: 'TP2', qty: Number(qty.toFixed(8)), state, thresholds, reason: 'tp2-threshold-hit' };
  }
  if (state.breakevenArmed && move <= thresholds.breakevenFloorPct && num(input.estimatedNetPnl) > 0) {
    return { action: 'exit', stage: 'BREAKEVEN', qty: state.remainingQty, state, thresholds, reason: 'lifecycle-breakeven-defense' };
  }
  return { action: 'hold', state, thresholds, reason: 'lifecycle-hold' };
}

function applyPartialFill(order = {}, fill = {}) {
  const state = ensureLifecycle(order);
  const qty = Math.max(0, Math.min(state.remainingQty, num(fill.qty)));
  if (!(qty > 0)) return state;
  state.remainingQty = Number(Math.max(0, state.remainingQty - qty).toFixed(8));
  if (fill.stage === 'TP1') state.tp1Done = true;
  if (fill.stage === 'TP2') state.tp2Done = true;
  state.realizedPartialGross = Number((state.realizedPartialGross + num(fill.gross)).toFixed(8));
  state.realizedPartialFees = Number((state.realizedPartialFees + Math.abs(num(fill.fee))).toFixed(8));
  state.realizedPartialSlippage = Number((state.realizedPartialSlippage + Math.abs(num(fill.slippage))).toFixed(8));
  state.realizedPartialNet = Number((state.realizedPartialNet + num(fill.net)).toFixed(8));
  state.lastActionAt = fill.time || now();
  state.partialFills.unshift({ ...fill, qty, time: fill.time || now() });
  state.partialFills = state.partialFills.slice(0, 12);
  order.positionLifecycle2 = state;
  return state;
}

function finalAccounting(order = {}, final = {}) {
  const state = ensureLifecycle(order);
  return {
    qtyClosedFinal: num(final.qty),
    originalQty: state.originalQty,
    partialQty: Number(state.partialFills.reduce((sum, f) => sum + num(f.qty), 0).toFixed(8)),
    grossPnl: Number((state.realizedPartialGross + num(final.gross)).toFixed(8)),
    fee: Number((state.realizedPartialFees + Math.abs(num(final.fee))).toFixed(8)),
    slippage: Number((state.realizedPartialSlippage + Math.abs(num(final.slippage))).toFixed(8)),
    netPnl: Number((state.realizedPartialNet + num(final.net)).toFixed(8)),
    partialFills: state.partialFills.slice().reverse(),
    lifecycle: state
  };
}

module.exports = { ensureLifecycle, stageThresholds, evaluateLifecycle, applyPartialFill, finalAccounting };
