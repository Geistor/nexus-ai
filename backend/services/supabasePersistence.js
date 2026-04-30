const { createClient } = require('@supabase/supabase-js');

let cached = null;

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const PERSISTENCE_ENABLED = ['true', '1', 'yes', 'on'].includes(
  String(process.env.SUPABASE_PERSISTENCE_ENABLED || (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? 'true' : 'false')).toLowerCase()
);

function isEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && PERSISTENCE_ENABLED);
}

function getClient() {
  if (!isEnabled()) return null;
  if (cached) return cached;
  cached = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return cached;
}

function getBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET || 'nexus-artifacts';
}

async function upsertSystemState(key, payload) {
  const supabase = getClient();
  if (!supabase) return { ok: false, disabled: true };
  const { error } = await supabase.from('system_state').upsert({ key, payload, updated_at: new Date().toISOString() });
  if (error) throw error;
  return { ok: true };
}

async function fetchSystemState(key) {
  const supabase = getClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from('system_state').select('*').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.payload || null;
}

async function upsertModelRegistryEntry(meta) {
  const supabase = getClient();
  if (!supabase) return { ok: false, disabled: true };
  const row = {
    version: meta.version,
    status: meta.status || null,
    path: meta.path || null,
    remote_path: meta.remotePath || null,
    payload: meta,
    created_at: meta.createdAt || new Date().toISOString()
  };
  const { error } = await supabase.from('model_registry').upsert(row);
  if (error) throw error;
  return { ok: true };
}

async function listModelRegistry() {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('model_registry').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
}

async function insertTradeEvent(event) {
  const supabase = getClient();
  if (!supabase) return { ok: false, disabled: true };
  const row = {
    trade_id: event.tradeId || null,
    event_type: event.event || null,
    payload: event,
    created_at: event.time || new Date().toISOString()
  };
  const { error } = await supabase.from('trade_events').insert(row);
  if (error) throw error;
  return { ok: true };
}

async function listTradeEvents(limit = 50) {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('trade_events').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

async function upsertVenueConfigRow(row) {
  const supabase = getClient();
  if (!supabase) return { ok: false, disabled: true };
  const payload = {
    user_id: row.user_id || row.userId || "default",
    venue: row.venue,
    api_key: row.api_key || row.apiKey || null,
    api_secret: row.api_secret || row.apiSecret || row.secret || null,
    passphrase: row.passphrase || null,
    market_type: row.market_type || row.marketType || null,
    margin_mode: row.margin_mode || row.marginMode || null,
    leverage: row.leverage ?? null,
    testnet: !!row.testnet,
    connected: !!row.connected,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from("venue_configs").upsert(payload, { onConflict: "user_id,venue" });
  if (error) throw error;
  return { ok: true };
}

async function remoteStatus() {
  return {
    enabled: isEnabled(),
    bucket: getBucket(),
    env: {
      url: Boolean(SUPABASE_URL),
      serviceRole: Boolean(SUPABASE_SERVICE_ROLE_KEY),
      anon: Boolean(SUPABASE_ANON_KEY)
    }
  };
}

module.exports = {
  isEnabled,
  getBucket,
  upsertSystemState,
  fetchSystemState,
  upsertModelRegistryEntry,
  listModelRegistry,
  insertTradeEvent,
  listTradeEvents,
  upsertVenueConfigRow,
  remoteStatus
};
