const { insertTradeEvent, upsertSystemState, listTradeEvents } = require('./supabasePersistence');

function nowIso() { return new Date().toISOString(); }
function compact(obj = {}) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

async function appendAuditEntry(entry = {}) {
  const payload = compact({
    time: entry.time || nowIso(),
    actor: entry.actor || 'operator',
    action: entry.action || 'unknown',
    severity: entry.severity || 'info',
    venue: entry.venue || null,
    result: entry.result || 'ok',
    details: entry.details || null
  });
  const tradeId = entry.tradeId || `audit_${Date.now()}`;
  await insertTradeEvent({ trade_id: tradeId, event_type: 'audit_log', payload });
  await upsertSystemState('last_audit_entry', payload);
  return { tradeId, payload };
}

async function listAuditEntries(limit = 40) {
  const rows = await listTradeEvents(limit * 3);
  return rows.filter((row) => row.event_type === 'audit_log').slice(0, limit);
}

module.exports = { appendAuditEntry, listAuditEntries };
