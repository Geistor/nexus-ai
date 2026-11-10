function metaGovernor(ctx, symbol, decision = {}, edge = {}, workflow = {}) {
  const confidence = Number(decision.confidence || 0.5);
  const spreadBps = Number(edge.orderbook?.spreadBps || 10);
  const latencyProfile = String(edge.latency?.profile || 'balanced');
  const mode = String(workflow.mode || 'paper_safe');
  let allow = true;
  const reasons = [];
  if (confidence < 0.45) { allow = false; reasons.push('Alacsony confidence'); }
  if (spreadBps > 20 && confidence < 0.7) { allow = false; reasons.push('Túl széles spread'); }
  if (latencyProfile === 'defensive' && decision.action !== 'HOLD' && mode === 'live') { allow = false; reasons.push('Gyenge latency profil live módban'); }
  let finalAction = decision.action || 'HOLD';
  if (!allow) finalAction = 'HOLD';
  return { allow, finalAction, reasons, confidenceFloorApplied: confidence < 0.55 };
}
module.exports = { metaGovernor };
