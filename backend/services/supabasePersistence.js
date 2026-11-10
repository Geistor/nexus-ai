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
  const { createClient } = require('@supabase/supabase-js');
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
  remoteStatus
};

// In-process transport for the NEXUS database calls in server.js. No HTTP API
// is exposed and no request is sent to Supabase when PostgreSQL is selected.
const PG_ROUTE = 'https://nexus-db.invalid';
const PG_TABLES = new Set(('ai_decisions capital_ledger capital_state event_journal incident_log maintenance_runs market_snapshots model_registry nexus_legacy_archive portfolio_risk_scaling_snapshots profit_withdrawals recovery_boots replay_recovery_log runtime_snapshots signal_quality strategy_evaluations testnet_orders testnet_proofs trade_events trade_journal venue_configs nexus_learning_state').split(' '));
const PG_ROUTINES = Object.freeze({
  get_nexus_database_usage: [[]],
  get_nexus_retention_status: [[]],
  run_nexus_retention_maintenance: [[], [['reason','text']]],
  run_nexus_emergency_cleanup: [[], [['reason','text'],['batches','integer']]],
  nexus_save_learning_state: [[['p_id','text'],['p_expected_revision','bigint'],['p_payload','jsonb']]],
  nexus_execution_authority: [[['p_scope','text'],['p_action','text'],['p_args','jsonb']]]
});

function pgIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) throw new Error('unsupported_database_identifier');
  return '"' + value + '"';
}
function pgColumns(value) {
  return value === '*' ? '*' : value.split(',').map(pgIdentifier).join(', ');
}
function pgInteger(value) {
  if (!/^\d+$/.test(value) || Number(value) > 2147483647) throw new Error('invalid_database_pagination');
  return Number(value);
}
function pgFilterList(value) {
  if (!/^\("(?:[^"\\]|\\.)*"(?:,"(?:[^"\\]|\\.)*")*\)$/.test(value)) throw new Error('unsupported_database_list');
  return [...value.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1].replace(/\\(.)/g, '$1'));
}

function createPostgresTransport(inTransaction) {
  return async function postgresRequest(input, options = {}) {
    try {
      const url = new URL(input);
      if (url.origin !== PG_ROUTE) throw new Error('unexpected_database_origin');
      const method = options.method || 'GET';
      const fields = url.pathname.split('/').slice(1).map(decodeURIComponent);
      if (fields[0] !== 'rest' || fields[1] !== 'v1') throw new Error('unsupported_database_route');
      const prefer = new Headers(options.headers).get('prefer') || '';
      const data = options.body === undefined ? {} : JSON.parse(options.body);
      const result = await inTransaction(async query => {
        if (fields[2] === 'rpc') {
          const name = fields[3];
          if (method !== 'POST' || fields.length !== 4 || !Object.hasOwn(PG_ROUTINES, name)) throw new Error('unsupported_database_routine');
          const keys = Object.keys(data);
          const sig = PG_ROUTINES[name].find(candidate => candidate.length === keys.length && candidate.every(([key]) => Object.hasOwn(data, key)));
          if (!sig) throw new Error('unsupported_database_routine_arguments');
          const args = sig.map(([key, type], i) => pgIdentifier(key) + ' => $' + (i + 1) + '::' + type);
          const values = sig.map(([key, type]) => type === 'jsonb' ? JSON.stringify(data[key]) : data[key]);
          const r = await query('SELECT public.' + pgIdentifier(name) + '(' + args.join(', ') + ') AS data', values);
          return { body: r.rows[0]?.data ?? null };
        }

        if (fields.length !== 3 || !PG_TABLES.has(fields[2])) throw new Error('unsupported_database_table');
        const table = 'public.' + pgIdentifier(fields[2]);
        const params = url.searchParams;
        const projection = pgColumns(params.get('select') || '*');
        const values = [];
        const bind = value => { values.push(value); return '$' + values.length; };
        const conditions = [];
        for (const [key, value] of params) {
          if (['select','order','limit','offset','on_conflict'].includes(key)) continue;
          const col = pgIdentifier(key);
          if (value.startsWith('eq.')) conditions.push(col + ' = ' + bind(value.slice(3)));
          else if (value.startsWith('lt.')) conditions.push(col + ' < ' + bind(value.slice(3)));
          else if (value.startsWith('in.')) conditions.push(col + ' IN (' + pgFilterList(value.slice(3)).map(bind).join(', ') + ')');
          else throw new Error('unsupported_database_filter');
        }
        const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
        const order = params.get('order');
        let suffix = '';
        if (order) {
          const m = /^([a-z_][a-z0-9_]*)\.(asc|desc)$/.exec(order);
          if (!m) throw new Error('unsupported_database_order');
          suffix += ' ORDER BY ' + pgIdentifier(m[1]) + ' ' + m[2].toUpperCase();
          if (fields[2] === 'trade_journal' && m[1] !== 'id') suffix += ', "id" ' + m[2].toUpperCase();
        }

        if (method === 'GET') {
          let count = null;
          if (/\bcount=(exact|estimated)\b/.test(prefer)) {
            const r = await query('SELECT count(*)::text AS total FROM ' + table + where, values.slice());
            count = r.rows[0].total;
          }
          const offset = params.has('offset') ? pgInteger(params.get('offset')) : 0;
          if (params.has('limit')) suffix += ' LIMIT ' + bind(pgInteger(params.get('limit')));
          if (offset) suffix += ' OFFSET ' + bind(offset);
          const r = await query('SELECT to_jsonb(item) AS data FROM (SELECT ' + projection + ' FROM ' + table + where + suffix + ') AS item', values);
          const range = count === null ? undefined : (r.rows.length ? offset + '-' + (offset + r.rows.length - 1) : '*') + '/' + count;
          return { body: r.rows.map(row => row.data), range };
        }

        if (method === 'POST') {
          if (conditions.length || !data || Array.isArray(data) || typeof data !== 'object' || !Object.keys(data).length) throw new Error('unsupported_database_upsert');
          const columns = Object.keys(data).map(pgIdentifier);
          const conflicts = (params.get('on_conflict') || 'id').split(',').map(pgIdentifier);
          const updates = columns.filter(col => !conflicts.includes(col)).map(col => col + ' = EXCLUDED.' + col);
          const action = updates.length ? 'DO UPDATE SET ' + updates.join(', ') : 'DO NOTHING';
          const list = columns.join(', ');
          await query('INSERT INTO ' + table + ' (' + list + ') SELECT ' + list
            + ' FROM jsonb_populate_record(NULL::' + table + ', $1::jsonb) ON CONFLICT ('
            + conflicts.join(', ') + ') ' + action, [JSON.stringify(data)]);
          return { status: 201 };
        }

        if (method === 'DELETE') {
          if (!where || params.has('offset')) throw new Error('unsafe_database_delete');
          let predicate = where;
          if (params.has('limit')) {
            const limit = bind(pgInteger(params.get('limit')));
            predicate = ' WHERE (tableoid, ctid) IN (SELECT tableoid, ctid FROM ' + table + where + suffix + ' LIMIT ' + limit + ' FOR UPDATE)';
          }
          const r = await query('WITH deleted AS (DELETE FROM ' + table + predicate + ' RETURNING ' + projection + ') SELECT to_jsonb(deleted) AS data FROM deleted', values);
          return { body: r.rows.map(row => row.data) };
        }
        throw new Error('unsupported_database_method');
      }, options.signal);
      return new Response(result.body === undefined ? null : JSON.stringify(result.body), {
        status: result.status || 200,
        headers: { 'content-type': 'application/json', ...(result.range ? { 'content-range': result.range } : {}) }
      });
    } catch (error) {
      // PostgreSQL error details may contain data or credentials. Preserve only
      // safe identifiers/errors used by the existing schema compatibility logic.
      const code = /^[0-9A-Z]{5}$/.test(error.code || '') ? error.code : '';
      const safeColumnError = code === '42703' && /^column "[a-z_][a-z0-9_]*" (?:of relation "[a-z_][a-z0-9_]*" )?does not exist$/.test(error.message);
      const safeMessage = safeColumnError || /^(?:unsupported_database_|invalid_database_pagination|unsafe_database_delete|unexpected_database_origin)/.test(error.message);
      const connectionCode = /^(?:ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ERR_TLS_CERT_ALTNAME_INVALID|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_GET_ISSUER_CERT_LOCALLY)$/.test(error.code || '') ? error.code : '';
      const status = ({ '42P01':404, '42883':404, '42703':400, '42501':403, '23505':409, '57014':504, '28P01':401 })[code] || (safeMessage ? 400 : 503);
      const message = safeMessage ? error.message : (error.name === 'AbortError' ? 'database request aborted' : 'PostgreSQL request failed');
      return Response.json({ code: code || connectionCode, message }, { status });
    }
  };
}

function postgresSettings(env = process.env) {
  const selected = String(env.NEXUS_DB_PROVIDER || 'supabase').trim().toLowerCase();
  if (!['postgres','supabase'].includes(selected)) throw new Error('NEXUS_DB_PROVIDER must be postgres or supabase');
  if (selected !== 'postgres') return null;
  let url;
  try { url = new URL(env.NEXUS_POSTGRES_URL || ''); } catch { throw new Error('NEXUS_POSTGRES_URL is missing or invalid'); }
  if (!/^postgres(?:ql)?:$/.test(url.protocol) || !url.hostname || require('node:net').isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.username || !url.password || url.pathname.length < 2 || url.search || url.hash)
    throw new Error('Use a PostgreSQL URL with DNS hostname, credentials and database name, without query parameters');
  const ca = String(env.NEXUS_POSTGRES_CA || '').replace(/\\n/g, '\n').trim();
  if (!ca || !ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error('NEXUS_POSTGRES_CA must contain the DigitalOcean CA certificate (PEM)');
  // Passing TLS as a separate object prevents URL parameters replacing the CA.
  return { connectionString: url.href, ssl: { ca, rejectUnauthorized: true }, host: url.host };
}

function openPostgresTransport(settings) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: settings.connectionString, ssl: settings.ssl, max: 5,
    idleTimeoutMillis: 15000, connectionTimeoutMillis: 5000, allowExitOnIdle: true,
    application_name: 'nexus-ai', options: '-c timezone=UTC -c statement_timeout=90000 -c idle_in_transaction_session_timeout=10000' });
  pool.on('error', error => console.error('[NEXUS] Idle PostgreSQL connection lost:', /^[0-9A-Z]{5}$/.test(error.code || '') ? error.code : 'connection-error'));
  const fetch = createPostgresTransport(async (work, signal) => {
    signal?.throwIfAborted();
    const client = await pool.connect();
    let destroy = false;
    try {
      signal?.throwIfAborted();
      await client.query('BEGIN');
      const timeout = Math.min(90000, Math.max(1, (signal?.nexusDeadline || Date.now()+8000) - Date.now()));
      await client.query("SELECT set_config('statement_timeout', $1, true)", [String(timeout)]);
      const result = await work((sql, args) => { signal?.throwIfAborted(); return client.query(sql, args); });
      signal?.throwIfAborted();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { destroy = true; }
      throw error;
    } finally { client.release(destroy); }
  });
  async function inspect() {
    const signatures = Object.entries(PG_ROUTINES).flatMap(([name, variants]) =>
      variants.map(args => 'public.' + name + '(' + args.map(([, type]) => type).join(',') + ')'));
    const db = await pool.query("SELECT current_database() AS database, current_user AS role, EXISTS (SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl) AS tls");
    const routines = await pool.query(
      "SELECT signature, COALESCE(has_function_privilege(to_regprocedure(signature), 'EXECUTE'), false) AS available FROM unnest($1::text[]) AS x(signature)", [signatures]);
    return { ...db.rows[0], missingRoutines: routines.rows.filter(r => !r.available).map(r => r.signature) };
  }
  return { fetch, inspect, close: () => pool.end() };
}

Object.assign(module.exports, { PG_ROUTE, postgresSettings, openPostgresTransport, createPostgresTransport });

function postgresMigrationSql() {
  const sql = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'infra', 'supabase_tools.sql'), 'utf8');
  const block = sql.split('-- BEGIN NEXUS DIGITALOCEAN POSTGRES MIGRATION\n')[1]?.split('-- END NEXUS DIGITALOCEAN POSTGRES MIGRATION')[0];
  if (!block) throw new Error('PostgreSQL migration section is missing');
  return block.trim() + '\n';
}
Object.assign(module.exports, { postgresMigrationSql });

if (require.main === module) {
  (async () => {
    if (process.argv[2] === '--postgres-sql') return process.stdout.write(postgresMigrationSql());
    if (process.argv[2] !== '--postgres-check') throw new Error('Use --postgres-sql or --postgres-check');
    const settings = postgresSettings();
    if (!settings) throw new Error('Set NEXUS_DB_PROVIDER=postgres before checking the connection');
    const transport = openPostgresTransport(settings);
    try {
      const inspection = await transport.inspect();
      if (!inspection.tls) throw new Error('The database connection must use TLS');
      if (inspection.missingRoutines.length) throw new Error('Missing database routines or EXECUTE grants: ' + inspection.missingRoutines.join(', '));
      for (const table of PG_TABLES) {
        const response = await transport.fetch(PG_ROUTE + '/rest/v1/' + table + '?select=*&limit=1');
        if (!response.ok) throw new Error(table + ': ' + await response.text());
      }
      const response = await transport.fetch(PG_ROUTE + '/rest/v1/trade_journal?select=id&limit=1', {headers: {Prefer: 'count=exact'}});
      if (!response.ok) throw new Error('trade_journal: ' + await response.text());
      const rowCount = response.headers.get('content-range')?.split('/')[1];
      console.log(JSON.stringify({ ok: true, provider: 'postgres', host: settings.host, database: inspection.database, role: inspection.role, tls: inspection.tls, tables: PG_TABLES.size, tradeJournalRows: Number(rowCount) }));
    } finally { await transport.close(); }
  })().catch(error => { console.error('[NEXUS PostgreSQL]', error.message); process.exitCode = 1; });
}
