begin;

alter table public.lme_market_prices
  add column if not exists price_type text not null default 'manual_reference',
  add column if not exists currency text not null default 'USD',
  add column if not exists unit text not null default 'metric_ton',
  add column if not exists source_name text not null default '수기 입력',
  add column if not exists fetched_at timestamptz;

alter table public.lme_market_prices alter column round drop not null;
alter table public.lme_market_prices alter column exchange_rate_krw_per_usd drop not null;
alter table public.lme_market_prices alter column domestic_lme_krw_per_kg drop not null;
alter table public.lme_market_prices alter column created_by drop not null;

alter table public.lme_market_prices drop constraint if exists lme_market_prices_round_check;
alter table public.lme_market_prices add constraint lme_market_prices_round_check check (round is null or round in (1, 2));
alter table public.lme_market_prices drop constraint if exists lme_market_prices_values_check;
alter table public.lme_market_prices add constraint lme_market_prices_values_check check (
  lme_al_usd_per_ton > 0
  and (exchange_rate_krw_per_usd is null or exchange_rate_krw_per_usd > 0)
  and (domestic_lme_krw_per_kg is null or domestic_lme_krw_per_kg > 0)
);
alter table public.lme_market_prices add constraint lme_market_prices_price_type_check check (price_type in ('spot', 'manual_reference'));
alter table public.lme_market_prices add constraint lme_market_prices_currency_check check (currency = 'USD');
alter table public.lme_market_prices add constraint lme_market_prices_unit_check check (unit = 'metric_ton');
create unique index if not exists lme_market_prices_daily_source_key
  on public.lme_market_prices(reference_date, material_code, price_type)
  where price_type = 'spot';

create or replace function public.calculate_lme_market_price()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.lme_materials where code = new.material_code and is_active) then
    raise exception 'Material code does not exist or is inactive.' using errcode = '23514';
  end if;
  new.reference_month := date_trunc('month', new.reference_date)::date;
  if new.exchange_rate_krw_per_usd is null then
    new.domestic_lme_krw_per_kg := null;
  else
    new.domestic_lme_krw_per_kg := round(new.lme_al_usd_per_ton * new.exchange_rate_krw_per_usd / 1000, 4);
  end if;
  return new;
end;
$$;

create or replace function public.refresh_lme_market_kpi_cache()
returns trigger language plpgsql set search_path = public as $$
declare latest_date date;
begin
  select max(reference_date) into latest_date from public.lme_market_prices where material_code = new.material_code and domestic_lme_krw_per_kg is not null;
  insert into public.lme_market_kpi_cache (material_code, latest_reference_date, average_1m, sample_count_1m, average_3m, sample_count_3m, average_6m, sample_count_6m, updated_at)
  select new.material_code, latest_date,
    avg(domestic_lme_krw_per_kg) filter (where reference_date >= latest_date - interval '1 month' and reference_date <= latest_date), count(domestic_lme_krw_per_kg) filter (where reference_date >= latest_date - interval '1 month' and reference_date <= latest_date),
    avg(domestic_lme_krw_per_kg) filter (where reference_date >= latest_date - interval '3 months' and reference_date <= latest_date), count(domestic_lme_krw_per_kg) filter (where reference_date >= latest_date - interval '3 months' and reference_date <= latest_date),
    avg(domestic_lme_krw_per_kg) filter (where reference_date >= latest_date - interval '6 months' and reference_date <= latest_date), count(domestic_lme_krw_per_kg) filter (where reference_date >= latest_date - interval '6 months' and reference_date <= latest_date), now()
  from public.lme_market_prices where material_code = new.material_code
  on conflict (material_code) do update set latest_reference_date = excluded.latest_reference_date, average_1m = excluded.average_1m, sample_count_1m = excluded.sample_count_1m, average_3m = excluded.average_3m, sample_count_3m = excluded.sample_count_3m, average_6m = excluded.average_6m, sample_count_6m = excluded.sample_count_6m, updated_at = excluded.updated_at;
  return new;
end;
$$;

create table if not exists public.lme_sync_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('initial', 'incremental')),
  trigger_source text not null check (trigger_source in ('admin', 'cron')),
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(), completed_at timestamptz,
  scanned_pages integer not null default 0, parsed_rows integer not null default 0,
  inserted_rows integer not null default 0, skipped_rows integer not null default 0,
  invalid_rows integer not null default 0, conflict_rows jsonb not null default '[]'::jsonb,
  latest_source_date date, stopped_reason text, message text,
  created_by uuid, created_by_name text
);
create unique index if not exists lme_sync_runs_single_running_idx on public.lme_sync_runs((status)) where status = 'running';
create index if not exists lme_sync_runs_started_idx on public.lme_sync_runs(started_at desc);

alter table public.lme_sync_runs enable row level security;
create policy lme_sync_runs_select_admin on public.lme_sync_runs for select to authenticated using (public.is_approved_admin());
create policy lme_sync_runs_insert_admin on public.lme_sync_runs for insert to authenticated with check (public.is_approved_admin() and created_by = auth.uid());
create policy lme_sync_runs_update_admin on public.lme_sync_runs for update to authenticated using (public.is_approved_admin()) with check (public.is_approved_admin());
revoke all on public.lme_sync_runs from anon, authenticated;
grant select, insert, update on public.lme_sync_runs to authenticated;

notify pgrst, 'reload schema';
commit;
