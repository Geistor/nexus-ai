'use strict';

// Re-evaluated at admission: decisions can outlive the state that produced them.
function probeAdmission({ mode, enabled, openCount, maxOpen, cooldownOk, protection,
  currentTrades, recoveryCap, netEdgePct, minNetEdgePct, allowProtectiveProbation = false }) {
  const blockers = [];
  if (!enabled || !['paper', 'staging'].includes(String(mode).toLowerCase())) blockers.push('probe_mode_blocked');
  if (!Number.isFinite(openCount) || openCount >= maxOpen) blockers.push('probe_concurrency_limit');
  if (!cooldownOk) blockers.push('probe_cooldown');
  if (!protection || (protection.severity === 'protective' && !allowProtectiveProbation)) blockers.push('probe_loss_protection');
  const recovery = protection?.previousEngineContext?.protectionBridgeActive === true;
  if (recovery && (!Number.isFinite(currentTrades) || currentTrades >= recoveryCap)) blockers.push('probe_recovery_budget_exhausted');
  if (!Number.isFinite(netEdgePct) || netEdgePct < minNetEdgePct) blockers.push('probe_net_edge_invalid');
  return { ok: blockers.length === 0, blockers, recovery };
}

module.exports = { probeAdmission };
