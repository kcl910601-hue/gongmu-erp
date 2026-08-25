begin;

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  reference_date date not null,
  base_currency text not null default 'USD',
  quote_currency text not null default 'KRW',
  rate numeric(16,6) not null,
  rate_type text not null,
  source_name text not null,
  source_url text,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint exchange_rates_pair_check check (base_currency = 'USD' and quote_currency = 'KRW'),
  constraint exchange_rates_rate_check check (rate > 0),
  constraint exchange_rates_type_check check (rate_type = 'usd_krw_deal_base_rate'),
  constraint exchange_rates_source_url_check check (source_url is null or source_url ~* '^https?://[^[:space:]]+$'),
  constraint exchange_rates_unique_key unique (reference_date, base_currency, quote_currency, rate_type)
);
create index if not exists exchange_rates_pair_date_idx on public.exchange_rates(base_currency, quote_currency, rate_type, reference_date desc);

create table if not exists public.exchange_rate_sync_runs (
  id uuid primary key default gen_random_uuid(), mode text not null check (mode in ('initial','incremental')),
  trigger_source text not null check (trigger_source in ('admin','cron')), status text not null check (status in ('running','success','failed')),
  started_at timestamptz not null default now(), completed_at timestamptz, requested_ranges integer not null default 0,
  parsed_rows integer not null default 0, inserted_rows integer not null default 0, skipped_rows integer not null default 0,
  invalid_rows integer not null default 0, conflict_rows jsonb not null default '[]'::jsonb,
  latest_source_date date, stopped_reason text, message text, created_by uuid, created_by_name text
);
create unique index if not exists exchange_rate_sync_single_running_idx on public.exchange_rate_sync_runs((status)) where status='running';
create index if not exists exchange_rate_sync_started_idx on public.exchange_rate_sync_runs(started_at desc);

create or replace function public.prevent_exchange_rate_change() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'Exchange rate rows are immutable.' using errcode='55000'; end; $$;
drop trigger if exists prevent_exchange_rate_change on public.exchange_rates;
create trigger prevent_exchange_rate_change before update or delete on public.exchange_rates for each row execute function public.prevent_exchange_rate_change();

alter table public.exchange_rates enable row level security;
alter table public.exchange_rate_sync_runs enable row level security;
create policy exchange_rates_select_approved on public.exchange_rates for select to authenticated using(public.is_approved_erp_user());
create policy exchange_rate_sync_runs_select_admin on public.exchange_rate_sync_runs for select to authenticated using(public.is_approved_admin());
revoke all on public.exchange_rates, public.exchange_rate_sync_runs from anon, authenticated;
grant select on public.exchange_rates to authenticated;
grant select on public.exchange_rate_sync_runs to authenticated;
notify pgrst,'reload schema';
commit;
