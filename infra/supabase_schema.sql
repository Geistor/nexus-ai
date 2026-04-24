create table if not exists public.system_state (
  key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.model_registry (
  version text primary key,
  status text,
  path text,
  remote_path text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.trade_events (
  id bigint generated always as identity primary key,
  trade_id text,
  event_type text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trade_events_trade_id_idx on public.trade_events(trade_id);
create index if not exists trade_events_event_type_idx on public.trade_events(event_type);
create index if not exists trade_events_created_at_idx on public.trade_events(created_at desc);
