-- NEXUS v199_187_10 – összevont Supabase kézi eszköztár
-- FONTOS: ez négy korábbi különálló kézi SQL script teljes tartalmát őrzi meg.
-- NE futtasd automatikusan a teljes fájlt. A Supabase SQL Editorban válaszd ki és futtasd
-- csak azt a BEGIN/END ORIGINAL FILE szekciót, amelyikre szükséged van.


-- ============================================================================
-- BEGIN ORIGINAL FILE: supabase_emergency_compact_v199_158.sql
-- ============================================================================
-- NEXUS v199_158 — EMERGENCY DATABASE FOOTPRINT RELEASE
-- Cél: 100% feletti Supabase kvótából gyorsan visszanyerni helyet úgy,
-- hogy EGYETLEN trade_journal rekord se vesszen el.
--
-- Futtasd egyszer: Supabase Dashboard > SQL Editor.
-- A trade_journal és a profit_withdrawals táblához ez a script NEM nyúl törléssel.
-- Az AI döntés/event/capital ledger telemetria nem a tanulás autoritatív igazságforrása;
-- ezekből csak egy kis, kompakt friss ablakot tartunk meg.

set statement_timeout = '120s';

-- 1) AI döntések: megtartjuk a legfrissebb 400 döntés kis összefoglalóját,
-- majd TRUNCATE + reinsert segítségével ténylegesen felszabadítjuk a relation helyét.
create temporary table nexus_keep_ai_decisions on commit drop as
select
  id,
  symbol,
  side,
  confidence,
  jsonb_strip_nulls(jsonb_build_object(
    'id', coalesce(payload->'id', to_jsonb(id)),
    'time', coalesce(payload->'time', to_jsonb(created_at)),
    'venue', payload->'venue',
    'symbol', coalesce(payload->'symbol', to_jsonb(symbol)),
    'side', coalesce(payload->'side', to_jsonb(side)),
    'confidence', coalesce(payload->'confidence', to_jsonb(confidence)),
    'reason', payload->'reason',
    'regime', payload->'regime',
    'volatility', payload->'volatility',
    'spreadPct', payload->'spreadPct',
    'strategyVersion', payload->'strategyVersion',
    'compact', true,
    'compactVersion', 'v199_158'
  )) as payload,
  created_at
from public.ai_decisions
order by created_at desc
limit 400;

truncate table public.ai_decisions;
insert into public.ai_decisions (id, symbol, side, confidence, payload, created_at)
select id, symbol, side, confidence, payload, created_at
from nexus_keep_ai_decisions;

-- 2) Capital ledger: az aktuális tőke igazságforrása a trade_journal + capital_state +
-- profit_withdrawals. A legfrissebb 200 ledger-bejegyzést kompaktan megtartjuk,
-- a több száz MB-os beágyazott trade másolatokat eldobjuk.
create temporary table nexus_keep_capital_ledger on commit drop as
select
  id,
  type,
  amount,
  jsonb_strip_nulls(jsonb_build_object(
    'id', coalesce(payload->'id', to_jsonb(id)),
    'time', coalesce(payload->'time', to_jsonb(created_at)),
    'type', coalesce(payload->'type', to_jsonb(type)),
    'amount', coalesce(payload->'amount', to_jsonb(amount)),
    'mode', payload->'mode',
    'activeTradingCapital', payload->'activeTradingCapital',
    'currentEquity', payload->'currentEquity',
    'withdrawableProfit', payload->'withdrawableProfit',
    'tradeId', coalesce(payload->'tradeId', payload#>'{payload,tradeId}', payload#>'{payload,trade,id}'),
    'orderId', coalesce(payload->'orderId', payload#>'{payload,orderId}', payload#>'{payload,trade,orderId}'),
    'beforeActiveTradingCapital', coalesce(payload->'beforeActiveTradingCapital', payload#>'{payload,beforeActiveTradingCapital}'),
    'afterActiveTradingCapital', coalesce(payload->'afterActiveTradingCapital', payload#>'{payload,afterActiveTradingCapital}'),
    'reason', coalesce(payload->'reason', payload#>'{payload,reason}'),
    'compact', true,
    'compactVersion', 'v199_158'
  )) as payload,
  created_at
from public.capital_ledger
order by created_at desc
limit 200;

truncate table public.capital_ledger;
insert into public.capital_ledger (id, type, amount, payload, created_at)
select id, type, amount, payload, created_at
from nexus_keep_capital_ledger;

-- 3) Event journal: a legfrissebb 2000 sort megtartjuk. Ez elegendő a friss proof/
-- incident előzményekhez, miközben a régi ismétlődő telemetria fizikailag eltűnik.
create temporary table nexus_keep_events on commit drop as
select * from public.event_journal
order by created_at desc
limit 2000;

truncate table public.event_journal;
insert into public.event_journal
select * from nexus_keep_events;

-- 4) Újragenerálható cache/telemetria rövidítése.
-- Ezek DELETE-ek; a felszabadult blokkok későbbi írásokhoz újrahasznosíthatók.
delete from public.runtime_snapshots where created_at < now() - interval '12 hours';
delete from public.market_snapshots where created_at < now() - interval '1 day';
delete from public.strategy_evaluations where created_at < now() - interval '7 days';
delete from public.signal_quality where created_at < now() - interval '7 days';
delete from public.incident_log where created_at < now() - interval '14 days';
delete from public.replay_recovery_log where created_at < now() - interval '14 days';
delete from public.maintenance_runs where created_at < now() - interval '14 days';

-- FONTOS: trade_journal rekordot NEM törlünk.
analyze public.trade_journal;
analyze public.ai_decisions;
analyze public.capital_ledger;
analyze public.event_journal;

select
  pg_size_pretty(pg_database_size(current_database())) as database_size_after_emergency_release,
  pg_size_pretty(pg_total_relation_size('public.trade_journal')) as trade_journal_size_untouched,
  pg_size_pretty(pg_total_relation_size('public.ai_decisions')) as ai_decisions_size_after,
  pg_size_pretty(pg_total_relation_size('public.capital_ledger')) as capital_ledger_size_after,
  pg_size_pretty(pg_total_relation_size('public.event_journal')) as event_journal_size_after,
  (select count(*) from public.trade_journal) as trade_journal_rows_preserved,
  (select count(*) from public.ai_decisions) as ai_decision_rows_after,
  (select count(*) from public.capital_ledger) as capital_ledger_rows_after,
  (select count(*) from public.event_journal) as event_rows_after;

-- ============================================================================
-- END ORIGINAL FILE: supabase_emergency_compact_v199_158.sql
-- ============================================================================

-- ============================================================================
-- BEGIN ORIGINAL FILE: supabase_one_click_recovery_v199_161.sql
-- ============================================================================
-- NEXUS v199_161 ONE-CLICK SUPABASE RECOVERY
-- Cél: 500 MB körüli / read-only közeli Free projekt gyors helyreállítása úgy,
-- hogy a verified trade_journal EGYETLEN sora se törlődjön.
-- Futtatás: Supabase Dashboard -> SQL Editor -> New query -> teljes fájl -> Run.

set session characteristics as transaction read write;

-- A következő táblák újragenerálható telemetriák. TRUNCATE azonnal visszaadja a relation
-- adatoldalait, ezért kvótahelyzetben megbízhatóbb, mint sok millió DELETE + VACUUM.
do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_decisions',
    'market_snapshots',
    'runtime_snapshots',
    'event_journal',
    'strategy_evaluations',
    'signal_quality',
    'incident_log',
    'replay_recovery_log',
    'recovery_boots',
    'testnet_orders',
    'testnet_proofs',
    'portfolio_risk_scaling_snapshots'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('truncate table public.%I', t);
    end if;
  end loop;
end;
$$;

-- FONTOS: public.trade_journal, public.capital_ledger, public.capital_state,
-- public.profit_withdrawals és public.venue_configs NINCS törölve/truncate-olva.

-- NEXUS v199_146 BIZTONSÁGOS SUPABASE SÉMA + RETENTION TELEPÍTŐ
-- FONTOS: ez a változat MEGŐRZI a teljes trade_journal táblát, beleértve a régi/legacy trade-eket is.
-- A v199_146 súlyozott történeti tanulása miatt a régi részletes trade-eket nem szabad automatikusan törölni.
-- Idempotens: ugyanazon a projekten újra futtatható.

set session characteristics as transaction read write;

-- NEXUS Supabase egységes javító séma
-- Verziófüggetlen, összevont SQL repair fájl.
-- Ezt futtasd a Supabase Dashboard > SQL Editor alatt, ha a NEXUS panel ezt írja:
-- "Supabase SQL séma javítás kell" vagy hiányzik/hibás: runtime_snapshots, trade_journal, venue_configs, maintenance_runs.
-- A séma-javítás nem töröl verified adatot. A fájl végén a régi/legacy és időkorláton túli rekordokból korlátozott takarítás fut.

create table if not exists public.event_journal (
  id text primary key,
  event_type text not null,
  source text,
  venue text,
  symbol text,
  mode text,
  severity text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.runtime_snapshots (
  id text primary key,
  mode text,
  phase text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.trade_journal (
  id text primary key,
  order_id text,
  venue text,
  symbol text,
  side text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.venue_configs (
  venue text primary key,
  config jsonb not null default '{}'::jsonb,
  status jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_runs (
  id text primary key,
  status text not null default 'ok',
  reason text,
  deleted_runtime_snapshots integer not null default 0,
  deleted_event_journal integer not null default 0,
  deleted_strategy_evaluations integer not null default 0,
  deleted_market_snapshots integer not null default 0,
  deleted_ai_decisions integer not null default 0,
  deleted_signal_quality integer not null default 0,
  deleted_incident_log integer not null default 0,
  deleted_recovery_log integer not null default 0,
  deleted_testnet_orders integer not null default 0,
  deleted_testnet_proofs integer not null default 0,
  deleted_capital_ledger integer not null default 0,
  deleted_profit_withdrawals integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.trade_events (
  id text primary key,
  event_type text not null,
  trade_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.model_registry (
  id text primary key,
  version text not null,
  status text not null default 'saved',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.incident_log (
  id text primary key,
  level text,
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_decisions (
  id text primary key,
  symbol text,
  side text,
  confidence numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.market_snapshots (
  id text primary key,
  venue text,
  symbol text,
  source text,
  price numeric,
  bid numeric,
  ask numeric,
  spread_pct numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.replay_recovery_log (
  id text primary key,
  event_type text,
  source text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.testnet_orders (
  id text primary key,
  venue text,
  symbol text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.testnet_proofs (
  id text primary key,
  venue text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.strategy_evaluations (
  id text primary key,
  status text,
  reason text,
  overall_score numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.signal_quality (
  id text primary key,
  trade_id text,
  decision_id text,
  symbol text,
  strategy_key text,
  quality_score numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.recovery_boots (
  id text primary key,
  boot_id text,
  instance_id text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.capital_ledger (
  id text primary key,
  type text,
  amount numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.profit_withdrawals (
  id text primary key,
  status text,
  amount numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.capital_state (
  id text primary key,
  mode text,
  active_trading_capital numeric,
  current_equity numeric,
  withdrawable_profit numeric,
  reserved_for_withdrawal numeric,
  total_withdrawn numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.portfolio_risk_scaling_snapshots (
  id text primary key,
  mode text,
  status text,
  target_position_size_pct numeric,
  next_order_notional_usd numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);


-- v199_123: ha a tábla már létezett régebbi, hiányos oszlopokkal, a create table if not exists nem módosította.
-- Ezek az ALTER parancsok meglévő adat törlése nélkül pótolják a szükséges oszlopokat.
alter table if exists public.runtime_snapshots add column if not exists mode text;
alter table if exists public.runtime_snapshots add column if not exists phase text;
alter table if exists public.runtime_snapshots add column if not exists payload jsonb not null default '{}'::jsonb;
alter table if exists public.runtime_snapshots add column if not exists created_at timestamptz not null default now();

alter table if exists public.trade_journal add column if not exists order_id text;
alter table if exists public.trade_journal add column if not exists venue text;
alter table if exists public.trade_journal add column if not exists symbol text;
alter table if exists public.trade_journal add column if not exists side text;
alter table if exists public.trade_journal add column if not exists payload jsonb not null default '{}'::jsonb;
alter table if exists public.trade_journal add column if not exists created_at timestamptz not null default now();

alter table if exists public.event_journal add column if not exists event_type text;
alter table if exists public.event_journal add column if not exists source text;
alter table if exists public.event_journal add column if not exists venue text;
alter table if exists public.event_journal add column if not exists symbol text;
alter table if exists public.event_journal add column if not exists mode text;
alter table if exists public.event_journal add column if not exists severity text;
alter table if exists public.event_journal add column if not exists payload jsonb not null default '{}'::jsonb;
alter table if exists public.event_journal add column if not exists created_at timestamptz not null default now();

alter table if exists public.venue_configs add column if not exists config jsonb not null default '{}'::jsonb;
alter table if exists public.venue_configs add column if not exists status jsonb not null default '{}'::jsonb;
alter table if exists public.venue_configs add column if not exists updated_at timestamptz not null default now();

alter table if exists public.maintenance_runs add column if not exists status text not null default 'ok';
alter table if exists public.maintenance_runs add column if not exists reason text;
alter table if exists public.maintenance_runs add column if not exists payload jsonb not null default '{}'::jsonb;
alter table if exists public.maintenance_runs add column if not exists created_at timestamptz not null default now();

create index if not exists idx_event_journal_created_at on public.event_journal (created_at desc);
create index if not exists idx_runtime_snapshots_created_at on public.runtime_snapshots (created_at desc);
create index if not exists idx_trade_journal_created_at on public.trade_journal (created_at desc);
create index if not exists idx_trade_journal_symbol_created_at on public.trade_journal (symbol, created_at desc);
create index if not exists idx_testnet_proofs_venue_created_at on public.testnet_proofs (venue, created_at desc);
create index if not exists idx_testnet_orders_venue_created_at on public.testnet_orders (venue, created_at desc);
create index if not exists idx_testnet_orders_status on public.testnet_orders (status);
create index if not exists idx_strategy_evaluations_created_at on public.strategy_evaluations (created_at desc);
create index if not exists idx_signal_quality_symbol_created_at on public.signal_quality (symbol, created_at desc);
create index if not exists idx_signal_quality_strategy_key on public.signal_quality (strategy_key);
create index if not exists idx_recovery_boots_created_at on public.recovery_boots (created_at desc);
create index if not exists idx_replay_recovery_log_created_at on public.replay_recovery_log (created_at desc);
create index if not exists idx_maintenance_runs_created_at on public.maintenance_runs (created_at desc);
create index if not exists idx_maintenance_runs_status on public.maintenance_runs (status);
create index if not exists idx_capital_ledger_created_at on public.capital_ledger (created_at desc);
create index if not exists idx_profit_withdrawals_created_at on public.profit_withdrawals (created_at desc);
create index if not exists idx_portfolio_risk_scaling_created_at on public.portfolio_risk_scaling_snapshots (created_at desc);


-- ---------------------------------------------------------------------------
-- v199_135 REAL RETENTION CORE
-- A korábbi RPC csak maintenance_runs sort írt, tényleges törlést nem végzett.
-- Ez a blokk valódi, korlátozott batch törlést, legacy trade tömörítést,
-- adatbázisméret-riportot és Supabase pg_cron ütemezést telepít.
-- ---------------------------------------------------------------------------

create table if not exists public.nexus_legacy_archive (
  id text primary key,
  legacy_trade_count bigint not null default 0,
  legacy_net_pnl numeric not null default 0,
  first_cleanup_at timestamptz not null default now(),
  last_cleanup_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create or replace function public.nexus_is_verified_trade(p_payload jsonb)
returns boolean
language sql
immutable
as $$
  select
    lower(coalesce(p_payload->>'marketDataTrusted', 'false')) = 'true'
    and lower(coalesce(p_payload->>'priceSource', p_payload->>'marketSource', '')) in ('live_public', 'live-public')
    and lower(coalesce(p_payload->>'marketTransport', '')) in ('websocket', 'rest')
    and coalesce(nullif(substring(coalesce(p_payload->>'journalIntegrityVersion', p_payload->>'marketIntegrityVersion', '') from 'v199[_-]([0-9]+)'), '')::integer, 0) >= 131;
$$;

create or replace function public.nexus_delete_old_rows(
  p_table text,
  p_cutoff timestamptz,
  p_limit integer default 2000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
  v_sql text;
begin
  if to_regclass('public.' || p_table) is null then
    return 0;
  end if;

  v_sql := format(
    'with doomed as (
       select ctid from public.%I
       where created_at < $1
       order by created_at asc
       limit $2
     )
     delete from public.%I t
     using doomed d
     where t.ctid = d.ctid',
    p_table, p_table
  );
  execute v_sql using p_cutoff, greatest(1, least(coalesce(p_limit, 2000), 10000));
  get diagnostics v_deleted = row_count;
  return coalesce(v_deleted, 0);
exception when undefined_column then
  return 0;
end;
$$;

create or replace function public.nexus_capture_delete_legacy_trade_batch(p_limit integer default 2000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  -- v199_146 SAFE: kompatibilitási no-op. A történeti trade_journal részletes rekordjai
  -- automatikusan nem törölhetők, mert csökkentett súllyal részt vesznek a tanulásban.
  return 0;
end;
$$;

create or replace function public.nexus_retention_batch(p_limit integer default 2000)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d_runtime integer := 0;
  d_event integer := 0;
  d_strategy integer := 0;
  d_market integer := 0;
  d_ai integer := 0;
  d_signal integer := 0;
  d_incident integer := 0;
  d_recovery integer := 0;
  d_test_orders integer := 0;
  d_test_proofs integer := 0;
  d_capital integer := 0;
  d_withdrawals integer := 0;
  d_maintenance integer := 0;
  d_trade_events integer := 0;
  d_recovery_boots integer := 0;
  d_risk_snapshots integer := 0;
  d_legacy_trade integer := 0;
  d_models integer := 0;
  d_total bigint := 0;
begin
  d_runtime := public.nexus_delete_old_rows('runtime_snapshots', now() - interval '12 hours', p_limit);
  d_event := public.nexus_delete_old_rows('event_journal', now() - interval '1 day', p_limit);
  d_strategy := public.nexus_delete_old_rows('strategy_evaluations', now() - interval '14 days', p_limit);
  d_market := public.nexus_delete_old_rows('market_snapshots', now() - interval '1 day', p_limit);
  d_ai := public.nexus_delete_old_rows('ai_decisions', now() - interval '1 day', p_limit);
  d_signal := public.nexus_delete_old_rows('signal_quality', now() - interval '7 days', p_limit);
  d_incident := public.nexus_delete_old_rows('incident_log', now() - interval '14 days', p_limit);
  d_recovery := public.nexus_delete_old_rows('replay_recovery_log', now() - interval '14 days', p_limit);
  d_test_orders := public.nexus_delete_old_rows('testnet_orders', now() - interval '30 days', p_limit);
  d_test_proofs := public.nexus_delete_old_rows('testnet_proofs', now() - interval '30 days', p_limit);
  d_capital := public.nexus_delete_old_rows('capital_ledger', now() - interval '30 days', p_limit);
  d_withdrawals := public.nexus_delete_old_rows('profit_withdrawals', now() - interval '365 days', p_limit);
  d_maintenance := public.nexus_delete_old_rows('maintenance_runs', now() - interval '30 days', p_limit);
  d_trade_events := public.nexus_delete_old_rows('trade_events', now() - interval '7 days', p_limit);
  d_recovery_boots := public.nexus_delete_old_rows('recovery_boots', now() - interval '30 days', p_limit);
  d_risk_snapshots := public.nexus_delete_old_rows('portfolio_risk_scaling_snapshots', now() - interval '30 days', p_limit);

  -- v199_146 SAFE POLICY: a teljes trade_journal megmarad, mert a minősített régi trade-ek
  -- csökkentett súllyal részt vesznek a történeti tanulásban. Automatikus journal-törlés nincs.
  d_legacy_trade := 0;

  if to_regclass('public.model_registry') is not null then
    with doomed as (
      select ctid
      from public.model_registry
      order by created_at desc
      offset 10
      limit greatest(1, least(coalesce(p_limit, 2000), 10000))
    )
    delete from public.model_registry m using doomed d where m.ctid = d.ctid;
    get diagnostics d_models = row_count;
  end if;

  d_total := d_runtime + d_event + d_strategy + d_market + d_ai + d_signal + d_incident +
             d_recovery + d_test_orders + d_test_proofs + d_capital + d_withdrawals +
             d_maintenance + d_trade_events + d_recovery_boots + d_risk_snapshots +
             d_legacy_trade + d_models;

  return jsonb_build_object(
    'ok', true,
    'realCleanup', true,
    'retentionPolicyVersion', 'v199_158-footprint-safe-retention',
    'deletedTotal', d_total,
    'deleted_runtime_snapshots', d_runtime,
    'deleted_event_journal', d_event,
    'deleted_strategy_evaluations', d_strategy,
    'deleted_market_snapshots', d_market,
    'deleted_ai_decisions', d_ai,
    'deleted_signal_quality', d_signal,
    'deleted_incident_log', d_incident,
    'deleted_recovery_log', d_recovery,
    'deleted_testnet_orders', d_test_orders,
    'deleted_testnet_proofs', d_test_proofs,
    'deleted_capital_ledger', d_capital,
    'deleted_profit_withdrawals', d_withdrawals,
    'deleted_maintenance_runs', d_maintenance,
    'deleted_trade_events', d_trade_events,
    'deleted_recovery_boots', d_recovery_boots,
    'deleted_portfolio_risk_snapshots', d_risk_snapshots,
    'deleted_legacy_trade_journal', d_legacy_trade,
    'deleted_old_model_registry', d_models,
    'verifiedTradeJournalProtected', true,
    'legacyDetailedTradeJournalProtected', true,
    'venueConfigsProtected', true,
    'finishedAt', now()
  );
end;
$$;

drop function if exists public.run_nexus_retention_maintenance();
drop function if exists public.run_nexus_retention_maintenance(text);

create or replace function public.run_nexus_retention_maintenance(reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := 'maint_' || extract(epoch from now())::bigint || '_' || floor(random() * 100000)::text;
  v_result jsonb;
begin
  v_result := public.nexus_retention_batch(2000);

  begin
    insert into public.maintenance_runs (id, status, reason, payload)
    values (
      v_id,
      'ok',
      reason,
      v_result || jsonb_build_object(
        'maintenanceRunId', v_id,
        'reason', reason,
        'realCleanup', true,
        'retentionPolicyVersion', 'v199_158-footprint-safe-retention'
      )
    );
  exception when others then
    -- A takarítás eredményét ne görgesse vissza egy opcionális audit-log írási hiba.
    null;
  end;

  return v_result || jsonb_build_object(
    'maintenanceRunId', v_id,
    'reason', reason,
    'realCleanup', true,
    'retentionPolicyVersion', 'v199_158-footprint-safe-retention'
  );
end;
$$;

create or replace function public.run_nexus_retention_maintenance()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.run_nexus_retention_maintenance('manual');
$$;

drop function if exists public.run_nexus_emergency_cleanup();
drop function if exists public.run_nexus_emergency_cleanup(text);
drop function if exists public.run_nexus_emergency_cleanup(text, integer);

create or replace function public.run_nexus_emergency_cleanup(
  reason text,
  batches integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := 'maint_emergency_' || extract(epoch from now())::bigint || '_' || floor(random() * 100000)::text;
  v_i integer;
  v_result jsonb;
  v_deleted bigint;
  v_total bigint := 0;
  v_runs integer := 0;
begin
  perform set_config('statement_timeout', '0', true);

  for v_i in 1..greatest(1, least(coalesce(batches, 6), 20)) loop
    v_result := public.nexus_retention_batch(10000);
    v_deleted := coalesce((v_result->>'deletedTotal')::bigint, 0);
    v_total := v_total + v_deleted;
    v_runs := v_runs + 1;
    exit when v_deleted = 0;
  end loop;

  v_result := jsonb_build_object(
    'ok', true,
    'realCleanup', true,
    'retentionPolicyVersion', 'v199_158-footprint-safe-retention',
    'emergency', true,
    'batchesRun', v_runs,
    'deletedTotal', v_total,
    'verifiedTradeJournalProtected', true,
    'legacyDetailedTradeJournalProtected', true,
    'venueConfigsProtected', true,
    'finishedAt', now()
  );

  begin
    insert into public.maintenance_runs (id, status, reason, payload)
    values (v_id, 'ok', reason, v_result || jsonb_build_object('maintenanceRunId', v_id));
  exception when others then
    null;
  end;

  return v_result || jsonb_build_object('maintenanceRunId', v_id, 'reason', reason);
end;
$$;

create or replace function public.run_nexus_emergency_cleanup(reason text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.run_nexus_emergency_cleanup(reason, 8);
$$;

create or replace function public.run_nexus_emergency_cleanup()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.run_nexus_emergency_cleanup('manual-emergency', 8);
$$;

create or replace function public.get_nexus_database_usage()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bytes bigint := pg_database_size(current_database());
  v_tables jsonb;
begin
  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into v_tables
  from (
    select jsonb_build_object(
      'table', schemaname || '.' || relname,
      'totalBytes', pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass),
      'totalPretty', pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass)),
      'estimatedRows', n_live_tup
    ) as row_data
    from pg_stat_user_tables
    order by pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass) desc
    limit 10
  ) q;

  return jsonb_build_object(
    'ok', true,
    'databaseBytes', v_bytes,
    'databasePretty', pg_size_pretty(v_bytes),
    'topTables', v_tables,
    'measuredAt', now()
  );
end;
$$;

create or replace function public.get_nexus_retention_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest jsonb;
  v_usage jsonb;
  v_archive jsonb;
begin
  select to_jsonb(m) into v_latest from public.maintenance_runs m order by created_at desc limit 1;
  select to_jsonb(a) into v_archive from public.nexus_legacy_archive a where id = 'legacy_pre_v199_131';
  v_usage := public.get_nexus_database_usage();
  return jsonb_build_object(
    'ok', true,
    'realCleanup', true,
    'retentionPolicyVersion', 'v199_158-footprint-safe-retention',
    'latestMaintenanceRun', v_latest,
    'legacyArchive', v_archive,
    'databaseUsage', v_usage,
    'verifiedTradeJournalProtected', true,
    'legacyDetailedTradeJournalProtected', true,
    'venueConfigsProtected', true
  );
end;
$$;

revoke all on function public.nexus_delete_old_rows(text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.nexus_capture_delete_legacy_trade_batch(integer) from public, anon, authenticated;
revoke all on function public.nexus_retention_batch(integer) from public, anon, authenticated;
grant execute on function public.run_nexus_retention_maintenance() to service_role;
grant execute on function public.run_nexus_retention_maintenance(text) to service_role;
grant execute on function public.run_nexus_emergency_cleanup() to service_role;
grant execute on function public.run_nexus_emergency_cleanup(text) to service_role;
grant execute on function public.run_nexus_emergency_cleanup(text, integer) to service_role;
grant execute on function public.get_nexus_database_usage() to service_role;
grant execute on function public.get_nexus_retention_status() to service_role;

-- Supabase-oldali ütemezés: Render alvás/restart esetén is folytatja a retentiont.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron extension nem telepíthető automatikusan: %', sqlerrm;
  end;

  begin
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'nexus-retention-maintenance';
  exception when others then
    null;
  end;

  begin
    perform cron.schedule(
      'nexus-retention-maintenance',
      '*/15 * * * *',
      $cron$select public.run_nexus_retention_maintenance('pg_cron');$cron$
    );
  exception when others then
    raise notice 'NEXUS pg_cron ütemezés nem sikerült: %', sqlerrm;
  end;
end;
$$;

notify pgrst, 'reload schema';

-- A telepítő szándékosan nem indít automatikus takarítást.
-- A külön biztonságos cleanup fájlt csak a séma ellenőrzése után futtasd.

-- Ha a Database Reports méret a törlés után sem csökken eléggé, ezeket külön-külön
-- futtasd a SQL Editorban egy nyugodtabb időszakban (a VACUUM FULL ideiglenesen zárol):
-- vacuum (analyze) public.runtime_snapshots;
-- vacuum (analyze) public.event_journal;
-- vacuum (analyze) public.market_snapshots;
-- vacuum (analyze) public.ai_decisions;
-- vacuum (analyze) public.trade_journal;
-- Szükség esetén a legnagyobb táblán: vacuum full public.<tabla_neve>;


-- Telepítés utáni rövid összefoglaló. A result táblában mindhárom értéknek igaznak kell lennie.
select
  to_regclass('public.runtime_snapshots') is not null as runtime_snapshots_ok,
  to_regclass('public.trade_journal') is not null as trade_journal_ok,
  to_regclass('public.venue_configs') is not null as venue_configs_ok,
  to_regprocedure('public.run_nexus_retention_maintenance()') is not null as retention_rpc_ok,
  to_regprocedure('public.get_nexus_retention_status()') is not null as retention_status_rpc_ok;


-- v199_161 compatibility alias: older UI/runtime deployments may still call run_nexus_maintenance.
create or replace function public.run_nexus_maintenance(reason text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.run_nexus_retention_maintenance(reason);
$$;

create or replace function public.run_nexus_maintenance()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.run_nexus_retention_maintenance('manual-v199_161');
$$;

grant execute on function public.run_nexus_maintenance() to service_role;
grant execute on function public.run_nexus_maintenance(text) to service_role;
notify pgrst, 'reload schema';

-- ============================================================================
-- END ORIGINAL FILE: supabase_one_click_recovery_v199_161.sql
-- ============================================================================

-- ============================================================================
-- BEGIN ORIGINAL FILE: supabase_repair.sql
-- ============================================================================
-- NEXUS v199_146 BIZTONSÁGOS SUPABASE SÉMA + RETENTION TELEPÍTŐ
-- FONTOS: ez a változat MEGŐRZI a teljes trade_journal táblát, beleértve a régi/legacy trade-eket is.
-- A v199_146 súlyozott történeti tanulása miatt a régi részletes trade-eket nem szabad automatikusan törölni.
-- Idempotens: ugyanazon a projekten újra futtatható.

set session characteristics as transaction read write;

-- NEXUS Supabase egységes javító séma
-- Verziófüggetlen, összevont SQL repair fájl.
-- Ezt futtasd a Supabase Dashboard > SQL Editor alatt, ha a NEXUS panel ezt írja:
-- "Supabase SQL séma javítás kell" vagy hiányzik/hibás: runtime_snapshots, trade_journal, venue_configs, maintenance_runs.
-- A séma-javítás nem töröl verified adatot. A fájl végén a régi/legacy és időkorláton túli rekordokból korlátozott takarítás fut.

create table if not exists public.event_journal (
  id text primary key,
  event_type text not null,
  source text,
  venue text,
  symbol text,
  mode text,
  severity text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.runtime_snapshots (
  id text primary key,
  mode text,
  phase text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.trade_journal (
  id text primary key,
  order_id text,
  venue text,
  symbol text,
  side text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.venue_configs (
  venue text primary key,
  config jsonb not null default '{}'::jsonb,
  status jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_runs (
  id text primary key,
  status text not null default 'ok',
  reason text,
  deleted_runtime_snapshots integer not null default 0,
  deleted_event_journal integer not null default 0,
  deleted_strategy_evaluations integer not null default 0,
  deleted_market_snapshots integer not null default 0,
  deleted_ai_decisions integer not null default 0,
  deleted_signal_quality integer not null default 0,
  deleted_incident_log integer not null default 0,
  deleted_recovery_log integer not null default 0,
  deleted_testnet_orders integer not null default 0,
  deleted_testnet_proofs integer not null default 0,
  deleted_capital_ledger integer not null default 0,
  deleted_profit_withdrawals integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.trade_events (
  id text primary key,
  event_type text not null,
  trade_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.model_registry (
  id text primary key,
  version text not null,
  status text not null default 'saved',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.incident_log (
  id text primary key,
  level text,
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_decisions (
  id text primary key,
  symbol text,
  side text,
  confidence numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.market_snapshots (
  id text primary key,
  venue text,
  symbol text,
  source text,
  price numeric,
  bid numeric,
  ask numeric,
  spread_pct numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.replay_recovery_log (
  id text primary key,
  event_type text,
  source text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.testnet_orders (
  id text primary key,
  venue text,
  symbol text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.testnet_proofs (
  id text primary key,
  venue text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.strategy_evaluations (
  id text primary key,
  status text,
  reason text,
  overall_score numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.signal_quality (
  id text primary key,
  trade_id text,
  decision_id text,
  symbol text,
  strategy_key text,
  quality_score numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.recovery_boots (
  id text primary key,
  boot_id text,
  instance_id text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.capital_ledger (
  id text primary key,
  type text,
  amount numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.profit_withdrawals (
  id text primary key,
  status text,
  amount numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.capital_state (
  id text primary key,
  mode text,
  active_trading_capital numeric,
  current_equity numeric,
  withdrawable_profit numeric,
  reserved_for_withdrawal numeric,
  total_withdrawn numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.portfolio_risk_scaling_snapshots (
  id text primary key,
  mode text,
  status text,
  target_position_size_pct numeric,
  next_order_notional_usd numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);


-- v199_123: ha a tábla már létezett régebbi, hiányos oszlopokkal, a create table if not exists nem módosította.
-- Ezek az ALTER parancsok meglévő adat törlése nélkül pótolják a szükséges oszlopokat.
alter table if exists public.runtime_snapshots add column if not exists mode text;
alter table if exists public.runtime_snapshots add column if not exists phase text;
alter table if exists public.runtime_snapshots add column if not exists payload jsonb not null default '{}'::jsonb;
alter table if exists public.runtime_snapshots add column if not exists created_at timestamptz not null default now();

alter table if exists public.trade_journal add column if not exists order_id text;
alter table if exists public.trade_journal add column if not exists venue text;
alter table if exists public.trade_journal add column if not exists symbol text;
alter table if exists public.trade_journal add column if not exists side text;
alter table if exists public.trade_journal add column if not exists payload jsonb not null default '{}'::jsonb;
alter table if exists public.trade_journal add column if not exists created_at timestamptz not null default now();

alter table if exists public.event_journal add column if not exists event_type text;
alter table if exists public.event_journal add column if not exists source text;
alter table if exists public.event_journal add column if not exists venue text;
alter table if exists public.event_journal add column if not exists symbol text;
alter table if exists public.event_journal add column if not exists mode text;
alter table if exists public.event_journal add column if not exists severity text;
alter table if exists public.event_journal add column if not exists payload jsonb not null default '{}'::jsonb;
alter table if exists public.event_journal add column if not exists created_at timestamptz not null default now();

alter table if exists public.venue_configs add column if not exists config jsonb not null default '{}'::jsonb;
alter table if exists public.venue_configs add column if not exists status jsonb not null default '{}'::jsonb;
alter table if exists public.venue_configs add column if not exists updated_at timestamptz not null default now();

alter table if exists public.maintenance_runs add column if not exists status text not null default 'ok';
alter table if exists public.maintenance_runs add column if not exists reason text;
alter table if exists public.maintenance_runs add column if not exists payload jsonb not null default '{}'::jsonb;
alter table if exists public.maintenance_runs add column if not exists created_at timestamptz not null default now();

create index if not exists idx_event_journal_created_at on public.event_journal (created_at desc);
create index if not exists idx_runtime_snapshots_created_at on public.runtime_snapshots (created_at desc);
create index if not exists idx_trade_journal_created_at on public.trade_journal (created_at desc);
create index if not exists idx_trade_journal_symbol_created_at on public.trade_journal (symbol, created_at desc);
create index if not exists idx_testnet_proofs_venue_created_at on public.testnet_proofs (venue, created_at desc);
create index if not exists idx_testnet_orders_venue_created_at on public.testnet_orders (venue, created_at desc);
create index if not exists idx_testnet_orders_status on public.testnet_orders (status);
create index if not exists idx_strategy_evaluations_created_at on public.strategy_evaluations (created_at desc);
create index if not exists idx_signal_quality_symbol_created_at on public.signal_quality (symbol, created_at desc);
create index if not exists idx_signal_quality_strategy_key on public.signal_quality (strategy_key);
create index if not exists idx_recovery_boots_created_at on public.recovery_boots (created_at desc);
create index if not exists idx_replay_recovery_log_created_at on public.replay_recovery_log (created_at desc);
create index if not exists idx_maintenance_runs_created_at on public.maintenance_runs (created_at desc);
create index if not exists idx_maintenance_runs_status on public.maintenance_runs (status);
create index if not exists idx_capital_ledger_created_at on public.capital_ledger (created_at desc);
create index if not exists idx_profit_withdrawals_created_at on public.profit_withdrawals (created_at desc);
create index if not exists idx_portfolio_risk_scaling_created_at on public.portfolio_risk_scaling_snapshots (created_at desc);


-- ---------------------------------------------------------------------------
-- v199_135 REAL RETENTION CORE
-- A korábbi RPC csak maintenance_runs sort írt, tényleges törlést nem végzett.
-- Ez a blokk valódi, korlátozott batch törlést, legacy trade tömörítést,
-- adatbázisméret-riportot és Supabase pg_cron ütemezést telepít.
-- ---------------------------------------------------------------------------

create table if not exists public.nexus_legacy_archive (
  id text primary key,
  legacy_trade_count bigint not null default 0,
  legacy_net_pnl numeric not null default 0,
  first_cleanup_at timestamptz not null default now(),
  last_cleanup_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create or replace function public.nexus_is_verified_trade(p_payload jsonb)
returns boolean
language sql
immutable
as $$
  select
    lower(coalesce(p_payload->>'marketDataTrusted', 'false')) = 'true'
    and lower(coalesce(p_payload->>'priceSource', p_payload->>'marketSource', '')) in ('live_public', 'live-public')
    and lower(coalesce(p_payload->>'marketTransport', '')) in ('websocket', 'rest')
    and coalesce(nullif(substring(coalesce(p_payload->>'journalIntegrityVersion', p_payload->>'marketIntegrityVersion', '') from 'v199[_-]([0-9]+)'), '')::integer, 0) >= 131;
$$;

create or replace function public.nexus_delete_old_rows(
  p_table text,
  p_cutoff timestamptz,
  p_limit integer default 2000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
  v_sql text;
begin
  if to_regclass('public.' || p_table) is null then
    return 0;
  end if;

  v_sql := format(
    'with doomed as (
       select ctid from public.%I
       where created_at < $1
       order by created_at asc
       limit $2
     )
     delete from public.%I t
     using doomed d
     where t.ctid = d.ctid',
    p_table, p_table
  );
  execute v_sql using p_cutoff, greatest(1, least(coalesce(p_limit, 2000), 10000));
  get diagnostics v_deleted = row_count;
  return coalesce(v_deleted, 0);
exception when undefined_column then
  return 0;
end;
$$;

create or replace function public.nexus_capture_delete_legacy_trade_batch(p_limit integer default 2000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  -- v199_146 SAFE: kompatibilitási no-op. A történeti trade_journal részletes rekordjai
  -- automatikusan nem törölhetők, mert csökkentett súllyal részt vesznek a tanulásban.
  return 0;
end;
$$;

create or replace function public.nexus_retention_batch(p_limit integer default 2000)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d_runtime integer := 0;
  d_event integer := 0;
  d_strategy integer := 0;
  d_market integer := 0;
  d_ai integer := 0;
  d_signal integer := 0;
  d_incident integer := 0;
  d_recovery integer := 0;
  d_test_orders integer := 0;
  d_test_proofs integer := 0;
  d_capital integer := 0;
  d_withdrawals integer := 0;
  d_maintenance integer := 0;
  d_trade_events integer := 0;
  d_recovery_boots integer := 0;
  d_risk_snapshots integer := 0;
  d_legacy_trade integer := 0;
  d_models integer := 0;
  d_total bigint := 0;
begin
  d_runtime := public.nexus_delete_old_rows('runtime_snapshots', now() - interval '12 hours', p_limit);
  d_event := public.nexus_delete_old_rows('event_journal', now() - interval '1 day', p_limit);
  d_strategy := public.nexus_delete_old_rows('strategy_evaluations', now() - interval '14 days', p_limit);
  d_market := public.nexus_delete_old_rows('market_snapshots', now() - interval '1 day', p_limit);
  d_ai := public.nexus_delete_old_rows('ai_decisions', now() - interval '1 day', p_limit);
  d_signal := public.nexus_delete_old_rows('signal_quality', now() - interval '7 days', p_limit);
  d_incident := public.nexus_delete_old_rows('incident_log', now() - interval '14 days', p_limit);
  d_recovery := public.nexus_delete_old_rows('replay_recovery_log', now() - interval '14 days', p_limit);
  d_test_orders := public.nexus_delete_old_rows('testnet_orders', now() - interval '30 days', p_limit);
  d_test_proofs := public.nexus_delete_old_rows('testnet_proofs', now() - interval '30 days', p_limit);
  d_capital := public.nexus_delete_old_rows('capital_ledger', now() - interval '30 days', p_limit);
  d_withdrawals := public.nexus_delete_old_rows('profit_withdrawals', now() - interval '365 days', p_limit);
  d_maintenance := public.nexus_delete_old_rows('maintenance_runs', now() - interval '30 days', p_limit);
  d_trade_events := public.nexus_delete_old_rows('trade_events', now() - interval '7 days', p_limit);
  d_recovery_boots := public.nexus_delete_old_rows('recovery_boots', now() - interval '30 days', p_limit);
  d_risk_snapshots := public.nexus_delete_old_rows('portfolio_risk_scaling_snapshots', now() - interval '30 days', p_limit);

  -- v199_146 SAFE POLICY: a teljes trade_journal megmarad, mert a minősített régi trade-ek
  -- csökkentett súllyal részt vesznek a történeti tanulásban. Automatikus journal-törlés nincs.
  d_legacy_trade := 0;

  if to_regclass('public.model_registry') is not null then
    with doomed as (
      select ctid
      from public.model_registry
      order by created_at desc
      offset 10
      limit greatest(1, least(coalesce(p_limit, 2000), 10000))
    )
    delete from public.model_registry m using doomed d where m.ctid = d.ctid;
    get diagnostics d_models = row_count;
  end if;

  d_total := d_runtime + d_event + d_strategy + d_market + d_ai + d_signal + d_incident +
             d_recovery + d_test_orders + d_test_proofs + d_capital + d_withdrawals +
             d_maintenance + d_trade_events + d_recovery_boots + d_risk_snapshots +
             d_legacy_trade + d_models;

  return jsonb_build_object(
    'ok', true,
    'realCleanup', true,
    'retentionPolicyVersion', 'v199_158-footprint-safe-retention',
    'deletedTotal', d_total,
    'deleted_runtime_snapshots', d_runtime,
    'deleted_event_journal', d_event,
    'deleted_strategy_evaluations', d_strategy,
    'deleted_market_snapshots', d_market,
    'deleted_ai_decisions', d_ai,
    'deleted_signal_quality', d_signal,
    'deleted_incident_log', d_incident,
    'deleted_recovery_log', d_recovery,
    'deleted_testnet_orders', d_test_orders,
    'deleted_testnet_proofs', d_test_proofs,
    'deleted_capital_ledger', d_capital,
    'deleted_profit_withdrawals', d_withdrawals,
    'deleted_maintenance_runs', d_maintenance,
    'deleted_trade_events', d_trade_events,
    'deleted_recovery_boots', d_recovery_boots,
    'deleted_portfolio_risk_snapshots', d_risk_snapshots,
    'deleted_legacy_trade_journal', d_legacy_trade,
    'deleted_old_model_registry', d_models,
    'verifiedTradeJournalProtected', true,
    'legacyDetailedTradeJournalProtected', true,
    'venueConfigsProtected', true,
    'finishedAt', now()
  );
end;
$$;

drop function if exists public.run_nexus_retention_maintenance();
drop function if exists public.run_nexus_retention_maintenance(text);

create or replace function public.run_nexus_retention_maintenance(reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := 'maint_' || extract(epoch from now())::bigint || '_' || floor(random() * 100000)::text;
  v_result jsonb;
begin
  v_result := public.nexus_retention_batch(2000);

  begin
    insert into public.maintenance_runs (id, status, reason, payload)
    values (
      v_id,
      'ok',
      reason,
      v_result || jsonb_build_object(
        'maintenanceRunId', v_id,
        'reason', reason,
        'realCleanup', true,
        'retentionPolicyVersion', 'v199_158-footprint-safe-retention'
      )
    );
  exception when others then
    -- A takarítás eredményét ne görgesse vissza egy opcionális audit-log írási hiba.
    null;
  end;

  return v_result || jsonb_build_object(
    'maintenanceRunId', v_id,
    'reason', reason,
    'realCleanup', true,
    'retentionPolicyVersion', 'v199_158-footprint-safe-retention'
  );
end;
$$;

create or replace function public.run_nexus_retention_maintenance()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.run_nexus_retention_maintenance('manual');
$$;

drop function if exists public.run_nexus_emergency_cleanup();
drop function if exists public.run_nexus_emergency_cleanup(text);
drop function if exists public.run_nexus_emergency_cleanup(text, integer);

create or replace function public.run_nexus_emergency_cleanup(
  reason text,
  batches integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := 'maint_emergency_' || extract(epoch from now())::bigint || '_' || floor(random() * 100000)::text;
  v_i integer;
  v_result jsonb;
  v_deleted bigint;
  v_total bigint := 0;
  v_runs integer := 0;
begin
  perform set_config('statement_timeout', '0', true);

  for v_i in 1..greatest(1, least(coalesce(batches, 6), 20)) loop
    v_result := public.nexus_retention_batch(10000);
    v_deleted := coalesce((v_result->>'deletedTotal')::bigint, 0);
    v_total := v_total + v_deleted;
    v_runs := v_runs + 1;
    exit when v_deleted = 0;
  end loop;

  v_result := jsonb_build_object(
    'ok', true,
    'realCleanup', true,
    'retentionPolicyVersion', 'v199_158-footprint-safe-retention',
    'emergency', true,
    'batchesRun', v_runs,
    'deletedTotal', v_total,
    'verifiedTradeJournalProtected', true,
    'legacyDetailedTradeJournalProtected', true,
    'venueConfigsProtected', true,
    'finishedAt', now()
  );

  begin
    insert into public.maintenance_runs (id, status, reason, payload)
    values (v_id, 'ok', reason, v_result || jsonb_build_object('maintenanceRunId', v_id));
  exception when others then
    null;
  end;

  return v_result || jsonb_build_object('maintenanceRunId', v_id, 'reason', reason);
end;
$$;

create or replace function public.run_nexus_emergency_cleanup(reason text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.run_nexus_emergency_cleanup(reason, 8);
$$;

create or replace function public.run_nexus_emergency_cleanup()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.run_nexus_emergency_cleanup('manual-emergency', 8);
$$;

create or replace function public.get_nexus_database_usage()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bytes bigint := pg_database_size(current_database());
  v_tables jsonb;
begin
  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into v_tables
  from (
    select jsonb_build_object(
      'table', schemaname || '.' || relname,
      'totalBytes', pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass),
      'totalPretty', pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass)),
      'estimatedRows', n_live_tup
    ) as row_data
    from pg_stat_user_tables
    order by pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass) desc
    limit 10
  ) q;

  return jsonb_build_object(
    'ok', true,
    'databaseBytes', v_bytes,
    'databasePretty', pg_size_pretty(v_bytes),
    'topTables', v_tables,
    'measuredAt', now()
  );
end;
$$;

create or replace function public.get_nexus_retention_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest jsonb;
  v_usage jsonb;
  v_archive jsonb;
begin
  select to_jsonb(m) into v_latest from public.maintenance_runs m order by created_at desc limit 1;
  select to_jsonb(a) into v_archive from public.nexus_legacy_archive a where id = 'legacy_pre_v199_131';
  v_usage := public.get_nexus_database_usage();
  return jsonb_build_object(
    'ok', true,
    'realCleanup', true,
    'retentionPolicyVersion', 'v199_158-footprint-safe-retention',
    'latestMaintenanceRun', v_latest,
    'legacyArchive', v_archive,
    'databaseUsage', v_usage,
    'verifiedTradeJournalProtected', true,
    'legacyDetailedTradeJournalProtected', true,
    'venueConfigsProtected', true
  );
end;
$$;

revoke all on function public.nexus_delete_old_rows(text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.nexus_capture_delete_legacy_trade_batch(integer) from public, anon, authenticated;
revoke all on function public.nexus_retention_batch(integer) from public, anon, authenticated;
grant execute on function public.run_nexus_retention_maintenance() to service_role;
grant execute on function public.run_nexus_retention_maintenance(text) to service_role;
grant execute on function public.run_nexus_emergency_cleanup() to service_role;
grant execute on function public.run_nexus_emergency_cleanup(text) to service_role;
grant execute on function public.run_nexus_emergency_cleanup(text, integer) to service_role;
grant execute on function public.get_nexus_database_usage() to service_role;
grant execute on function public.get_nexus_retention_status() to service_role;

-- Supabase-oldali ütemezés: Render alvás/restart esetén is folytatja a retentiont.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron extension nem telepíthető automatikusan: %', sqlerrm;
  end;

  begin
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'nexus-retention-maintenance';
  exception when others then
    null;
  end;

  begin
    perform cron.schedule(
      'nexus-retention-maintenance',
      '*/15 * * * *',
      $cron$select public.run_nexus_retention_maintenance('pg_cron');$cron$
    );
  exception when others then
    raise notice 'NEXUS pg_cron ütemezés nem sikerült: %', sqlerrm;
  end;
end;
$$;

notify pgrst, 'reload schema';

-- A telepítő szándékosan nem indít automatikus takarítást.
-- A külön biztonságos cleanup fájlt csak a séma ellenőrzése után futtasd.

-- Ha a Database Reports méret a törlés után sem csökken eléggé, ezeket külön-külön
-- futtasd a SQL Editorban egy nyugodtabb időszakban (a VACUUM FULL ideiglenesen zárol):
-- vacuum (analyze) public.runtime_snapshots;
-- vacuum (analyze) public.event_journal;
-- vacuum (analyze) public.market_snapshots;
-- vacuum (analyze) public.ai_decisions;
-- vacuum (analyze) public.trade_journal;
-- Szükség esetén a legnagyobb táblán: vacuum full public.<tabla_neve>;


-- Telepítés utáni rövid összefoglaló. A result táblában mindhárom értéknek igaznak kell lennie.
select
  to_regclass('public.runtime_snapshots') is not null as runtime_snapshots_ok,
  to_regclass('public.trade_journal') is not null as trade_journal_ok,
  to_regclass('public.venue_configs') is not null as venue_configs_ok,
  to_regprocedure('public.run_nexus_retention_maintenance()') is not null as retention_rpc_ok,
  to_regprocedure('public.get_nexus_retention_status()') is not null as retention_status_rpc_ok;

-- ============================================================================
-- END ORIGINAL FILE: supabase_repair.sql
-- ============================================================================

-- ============================================================================
-- BEGIN ORIGINAL FILE: supabase_trade_journal_compact_v199_158.sql
-- ============================================================================
-- NEXUS v199_158 — OPTIONAL TRADE_JOURNAL PAYLOAD COMPACTION
-- Csak azután futtasd, hogy a supabase_emergency_compact_v199_158.sql már lefutott
-- és a projekt ismét a kvóta alatt / írható állapotban van.
--
-- EGYETLEN trade_journal sort sem töröl. A cél a legacy rekordok óriási beágyazott
-- runtime objektumainak kicsinyítése úgy, hogy a verified evidence, PnL, online learning,
-- venue/symbol/side/regime és fontos execution mezők megmaradjanak.

set statement_timeout = '180s';

update public.trade_journal
set payload = jsonb_strip_nulls(jsonb_build_object(
  'id', coalesce(payload->'id', to_jsonb(id)),
  'orderId', coalesce(payload->'orderId', to_jsonb(order_id)),
  'status', coalesce(payload->'status', '"closed"'::jsonb),
  'mode', payload->'mode',
  'source', payload->'source',
  'priceSource', coalesce(payload->'priceSource', payload->'marketSource'),
  'marketSource', coalesce(payload->'marketSource', payload->'priceSource'),
  'marketTransport', payload->'marketTransport',
  'marketDataTrusted', payload->'marketDataTrusted',
  'entryMarketDataTrusted', payload->'entryMarketDataTrusted',
  'journalIntegrityVersion', payload->'journalIntegrityVersion',
  'marketIntegrityVersion', payload->'marketIntegrityVersion',
  'requestedVenue', coalesce(payload->'requestedVenue', to_jsonb(venue)),
  'venue', coalesce(payload->'venue', to_jsonb(venue)),
  'symbol', coalesce(payload->'symbol', to_jsonb(symbol)),
  'side', coalesce(payload->'side', to_jsonb(side)),
  'qty', coalesce(payload->'qty', payload->'quantity'),
  'entryPrice', coalesce(payload->'entryPrice', payload->'openPrice', payload->'avgEntryPrice'),
  'exitPrice', coalesce(payload->'exitPrice', payload->'closePrice', payload->'avgExitPrice'),
  'fee', payload->'fee',
  'slippage', payload->'slippage',
  'grossPnl', payload->'grossPnl',
  'netPnl', coalesce(payload->'netPnl', payload->'pnl'),
  'feeRate', payload->'feeRate',
  'slippageRate', payload->'slippageRate',
  'spreadPct', payload->'spreadPct',
  'volatility', payload->'volatility',
  'confidence', payload->'confidence',
  'regime', coalesce(payload->'regime', payload->'marketRegime'),
  'decisionId', payload->'decisionId',
  'signalEdge', payload->'signalEdge',
  'signalRequiredEdge', payload->'signalRequiredEdge',
  'strategy', payload->'strategy',
  'strategyKey', payload->'strategyKey',
  'strategyVersion', coalesce(payload->'strategyVersion', payload->'executionEpoch'),
  'executionEpoch', coalesce(payload->'executionEpoch', payload->'strategyVersion'),
  'exitReason', payload->'exitReason',
  'holdingMs', payload->'holdingMs',
  'marketMovePct', payload->'marketMovePct',
  'entryMarketSnapshotId', payload->'entryMarketSnapshotId',
  'exitMarketSnapshotId', coalesce(payload->'exitMarketSnapshotId', payload->'marketSnapshotId'),
  'entryMarketSymbol', coalesce(payload->'entryMarketSymbol', payload->'symbol', to_jsonb(symbol)),
  'exitMarketSymbol', coalesce(payload->'exitMarketSymbol', payload->'symbol', to_jsonb(symbol)),
  'entryMarketVenue', coalesce(payload->'entryMarketVenue', payload->'venue', to_jsonb(venue)),
  'exitMarketVenue', coalesce(payload->'exitMarketVenue', payload->'venue', to_jsonb(venue)),
  'entryMarketSourceVenue', coalesce(payload->'entryMarketSourceVenue', payload->'entryMarketVenue', payload->'venue', to_jsonb(venue)),
  'exitMarketSourceVenue', coalesce(payload->'exitMarketSourceVenue', payload->'exitMarketVenue', payload->'venue', to_jsonb(venue)),
  'entryMarketTransport', coalesce(payload->'entryMarketTransport', payload->'marketTransport'),
  'exitMarketTransport', coalesce(payload->'exitMarketTransport', payload->'marketTransport'),
  'entryPriceSource', coalesce(payload->'entryPriceSource', payload->'priceSource', payload->'source'),
  'exitPriceSource', coalesce(payload->'exitPriceSource', payload->'priceSource', payload->'source'),
  'marketBindingVerified', payload->'marketBindingVerified',
  'marketBindingPolicy', payload->'marketBindingPolicy',
  'verifiedMarketEpoch', payload->'verifiedMarketEpoch',
  'marketProofVerified', payload->'marketProofVerified',
  'publicMarketProof', case when payload->'publicMarketProof' = 'true'::jsonb then true else null end,
  'fillState', payload->'fillState',
  'journalStatus', payload->'journalStatus',
  'activeTradingCapitalBefore', payload->'activeTradingCapitalBefore',
  'activeTradingCapitalAfter', payload->'activeTradingCapitalAfter',
  'openedAt', coalesce(payload->'openedAt', payload->'entryTime'),
  'closedAt', coalesce(payload->'closedAt', payload->'exitTime', to_jsonb(created_at)),
  'technicalAtEntry', case when jsonb_typeof(payload->'technicalAtEntry') = 'object' then jsonb_strip_nulls(jsonb_build_object(
      'ready', payload#>'{technicalAtEntry,ready}',
      'sampleCount', payload#>'{technicalAtEntry,sampleCount}',
      'trend', payload#>'{technicalAtEntry,trend}',
      'volatility', payload#>'{technicalAtEntry,volatility}',
      'momentumSide', payload#>'{technicalAtEntry,momentumSide}',
      'momentumScore', payload#>'{technicalAtEntry,momentumScore}',
      'rsi', payload#>'{technicalAtEntry,rsi}',
      'directionFlipPct', payload#>'{technicalAtEntry,directionFlipPct}',
      'acceleration', payload#>'{technicalAtEntry,acceleration}'
  )) else null end,
  'technicalAtExit', case when jsonb_typeof(payload->'technicalAtExit') = 'object' then jsonb_strip_nulls(jsonb_build_object(
      'ready', payload#>'{technicalAtExit,ready}',
      'sampleCount', payload#>'{technicalAtExit,sampleCount}',
      'trend', payload#>'{technicalAtExit,trend}',
      'volatility', payload#>'{technicalAtExit,volatility}',
      'momentumSide', payload#>'{technicalAtExit,momentumSide}',
      'momentumScore', payload#>'{technicalAtExit,momentumScore}',
      'rsi', payload#>'{technicalAtExit,rsi}',
      'directionFlipPct', payload#>'{technicalAtExit,directionFlipPct}',
      'acceleration', payload#>'{technicalAtExit,acceleration}'
  )) else null end,
  'signalRouting', case when jsonb_typeof(payload->'signalRouting') = 'object' then jsonb_strip_nulls(jsonb_build_object(
      'combinedEdge', payload#>'{signalRouting,combinedEdge}',
      'requiredEdge', payload#>'{signalRouting,requiredEdge}',
      'expectedMovePct', payload#>'{signalRouting,expectedMovePct}',
      'estimatedRoundTripCostPct', payload#>'{signalRouting,estimatedRoundTripCostPct}',
      'costCoverageRatio', payload#>'{signalRouting,costCoverageRatio}',
      'requiredCostCoverage', payload#>'{signalRouting,requiredCostCoverage}',
      'directionalPersistencePct', payload#>'{signalRouting,directionalPersistencePct}',
      'trendAlignmentPct', payload#>'{signalRouting,trendAlignmentPct}',
      'bootstrapExploration', payload#>'{signalRouting,bootstrapExploration}',
      'historicalExpectancyOverride', payload#>'{signalRouting,historicalExpectancyOverride}'
  )) else null end,
  'compact', true,
  'compactVersion', 'v199_158'
));

analyze public.trade_journal;

select
  pg_size_pretty(pg_total_relation_size('public.trade_journal')) as trade_journal_relation_size,
  count(*) as trade_journal_rows_preserved,
  count(*) filter (where payload->>'compactVersion' = 'v199_158') as compacted_rows
from public.trade_journal;

-- Ha később a Supabase fizikai relation mérete még mindig indokolatlanul nagy,
-- a VACUUM FULL külön, önálló SQL parancsként futtatható karbantartási ablakban:
-- VACUUM (FULL, ANALYZE) public.trade_journal;

-- ============================================================================
-- END ORIGINAL FILE: supabase_trade_journal_compact_v199_158.sql
-- ============================================================================

-- BEGIN v199_187_13 isolated learning-state + execution-authority migration
-- Run ONLY this section for this release. No existing trading rows are deleted.
create table if not exists public.nexus_learning_state (
  id text primary key, revision bigint not null default 0, payload jsonb not null,
  updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.nexus_execution_state (
  id text primary key, payload jsonb not null default '{"token":0,"expires":0,"orders":{}}'::jsonb
);
alter table public.nexus_learning_state enable row level security;
alter table public.nexus_execution_state enable row level security;
revoke all on public.nexus_learning_state,public.nexus_execution_state from public,anon,authenticated;
grant select,insert,update on public.nexus_learning_state,public.nexus_execution_state to service_role;
create or replace function public.nexus_save_learning_state(p_id text,p_expected_revision bigint,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r bigint;
begin
  insert into nexus_learning_state(id,revision,payload) values(p_id,0,'{}') on conflict do nothing;
  select revision into r from nexus_learning_state where id=p_id for update;
  if r<>p_expected_revision then return jsonb_build_object('ok',false,'reason','revision-conflict','revision',r); end if;
  update nexus_learning_state set revision=r+1,payload=p_payload,updated_at=clock_timestamp() where id=p_id;
  return jsonb_build_object('ok',true,'revision',r+1);
end $$;
create or replace function public.nexus_execution_authority(p_scope text,p_action text,p_args jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare s jsonb; o jsonb; result jsonb; t bigint; token bigint; own text; valid boolean; k text;
begin
  insert into nexus_execution_state(id) values(p_scope) on conflict do nothing;
  select payload into s from nexus_execution_state where id=p_scope for update;
  t=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  token=coalesce((s->>'token')::bigint,0); own=s->>'owner'; k=p_args->>'key';
  valid=own=p_args->>'owner' and token=coalesce((p_args->>'token')::bigint,-1) and coalesce((s->>'expires')::bigint,0)>t;
  result=jsonb_build_object('ok',false,'reason','unknown-action');
  if p_action='acquire' then
    if coalesce((s->>'expires')::bigint,0)<=t or own=p_args->>'owner' then
      if own is distinct from p_args->>'owner' or coalesce((s->>'expires')::bigint,0)<=t then token=token+1; end if;
      s=s||jsonb_build_object('owner',p_args->>'owner','token',token,'expires',t+least(30000,coalesce((p_args->>'ttlMs')::bigint,15000)));
      result=jsonb_build_object('ok',true,'token',token,'expires',s->'expires');
    else result=jsonb_build_object('ok',false,'reason','lease-held'); end if;
  elsif p_action='renew' then
    if valid then s=s||jsonb_build_object('expires',t+least(30000,coalesce((p_args->>'ttlMs')::bigint,15000)));result=jsonb_build_object('ok',true,'token',token,'expires',s->'expires');
    else result=jsonb_build_object('ok',false,'reason','lease-lost');end if;
  elsif p_action='reserve' then
    o=s->'orders'->k;
    if o is not null then result=jsonb_build_object('ok',false,'reason',case when o->>'hash'<>p_args->>'hash' then 'idempotency-content-conflict' else 'existing-order' end,'order',o);
    elsif not coalesce(valid,false) then result=jsonb_build_object('ok',false,'reason','lease-lost');
    else o=jsonb_build_object('key',k,'hash',p_args->>'hash','clientOrderId',p_args->>'clientOrderId','token',token,'status','pending','at',t);
      s=jsonb_set(s,array['orders',k],o,true);result=jsonb_build_object('ok',true,'order',o);end if;
  elsif p_action='complete' then
    o=s->'orders'->k;
    if o is not null and (o->>'token')::bigint=(p_args->>'token')::bigint then
      if o->>'status'<>'accepted' or p_args->>'status'='accepted' then o=o||jsonb_build_object('status',p_args->>'status','receipt',p_args->'receipt','updatedAt',t);s=jsonb_set(s,array['orders',k],o,true);end if;
      result=jsonb_build_object('ok',true,'order',o);
    else result=jsonb_build_object('ok',false,'reason','order-token-mismatch');end if;
  elsif p_action='lookup' then result=jsonb_build_object('ok',true,'order',s->'orders'->k);
  elsif p_action='status' then result=jsonb_build_object('ok',true,'owner',own,'token',token,'expires',s->'expires','scope','postgres-atomic');
  end if;
  update nexus_execution_state set payload=s where id=p_scope;
  return result;
end $$;
revoke all on function public.nexus_save_learning_state(text,bigint,jsonb),public.nexus_execution_authority(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nexus_save_learning_state(text,bigint,jsonb),public.nexus_execution_authority(text,text,jsonb) to service_role;
-- END v199_187_13 isolated learning-state + execution-authority migration
