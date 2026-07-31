begin;

create table if not exists public.lme_materials (
  code text primary key,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint lme_materials_code_check check (code ~ '^[A-Z]{2,10}$')
);

insert into public.lme_materials (code, name) values ('AL', '알루미늄')
on conflict (code) do update set name = excluded.name;

create table if not exists public.lme_market_prices (
  id uuid primary key default gen_random_uuid(),
  reference_date date not null,
  reference_month date not null,
  round smallint not null,
  material_code text not null,
  lme_al_usd_per_ton numeric(16,4) not null,
  exchange_rate_krw_per_usd numeric(16,4) not null,
  domestic_lme_krw_per_kg numeric(16,4) not null,
  source_url text not null,
  memo text,
  created_by uuid not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  constraint lme_market_prices_material_fkey foreign key (material_code) references public.lme_materials(code) on update cascade on delete restrict,
  constraint lme_market_prices_month_round_material_key unique (reference_month, round, material_code),
  constraint lme_market_prices_round_check check (round in (1, 2)),
  constraint lme_market_prices_month_check check (reference_month = date_trunc('month', reference_month)::date),
  constraint lme_market_prices_date_month_check check (date_trunc('month', reference_date)::date = reference_month),
  constraint lme_market_prices_values_check check (lme_al_usd_per_ton > 0 and exchange_rate_krw_per_usd > 0 and domestic_lme_krw_per_kg > 0),
  constraint lme_market_prices_source_check check (source_url ~* '^https?://[^[:space:]]+$'),
  constraint lme_market_prices_memo_length_check check (memo is null or char_length(memo) <= 2000)
);

create index if not exists lme_market_prices_material_date_idx on public.lme_market_prices(material_code, reference_date desc);

create table if not exists public.lme_market_kpi_cache (
  material_code text primary key references public.lme_materials(code) on update cascade on delete restrict,
  latest_reference_date date,
  average_1m numeric(16,4), sample_count_1m integer not null default 0,
  average_3m numeric(16,4), sample_count_3m integer not null default 0,
  average_6m numeric(16,4), sample_count_6m integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.lme_import_logs (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  total_rows integer not null,
  inserted_rows integer not null,
  skipped_rows integer not null,
  failed_rows integer not null,
  created_by uuid not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  constraint lme_import_logs_counts_check check (total_rows >= 0 and inserted_rows >= 0 and skipped_rows >= 0 and failed_rows >= 0)
);

create or replace function public.calculate_lme_market_price()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.lme_materials where code = new.material_code and is_active) then
    raise exception 'Material code does not exist or is inactive.' using errcode = '23514';
  end if;
  new.reference_month := date_trunc('month', new.reference_month)::date;
  new.domestic_lme_krw_per_kg := round(new.lme_al_usd_per_ton * new.exchange_rate_krw_per_usd / 1000, 4);
  return new;
end;
$$;

drop trigger if exists calculate_lme_market_price on public.lme_market_prices;
create trigger calculate_lme_market_price before insert on public.lme_market_prices
for each row execute function public.calculate_lme_market_price();

create or replace function public.refresh_lme_market_kpi_cache()
returns trigger language plpgsql set search_path = public as $$
declare latest_date date;
begin
  select max(reference_date) into latest_date from public.lme_market_prices where material_code = new.material_code;
  insert into public.lme_market_kpi_cache (material_code, latest_reference_date, average_1m, sample_count_1m, average_3m, sample_count_3m, average_6m, sample_count_6m, updated_at)
  select new.material_code, latest_date,
    avg(domestic_lme_krw_per_kg) filter (where reference_date >= latest_date - interval '1 month' and reference_date <= latest_date), count(*) filter (where reference_date >= latest_date - interval '1 month' and reference_date <= latest_date),
    avg(domestic_lme_krw_per_kg) filter (where reference_date >= latest_date - interval '3 months' and reference_date <= latest_date), count(*) filter (where reference_date >= latest_date - interval '3 months' and reference_date <= latest_date),
    avg(domestic_lme_krw_per_kg) filter (where reference_date >= latest_date - interval '6 months' and reference_date <= latest_date), count(*) filter (where reference_date >= latest_date - interval '6 months' and reference_date <= latest_date), now()
  from public.lme_market_prices where material_code = new.material_code
  on conflict (material_code) do update set latest_reference_date = excluded.latest_reference_date, average_1m = excluded.average_1m, sample_count_1m = excluded.sample_count_1m, average_3m = excluded.average_3m, sample_count_3m = excluded.sample_count_3m, average_6m = excluded.average_6m, sample_count_6m = excluded.sample_count_6m, updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists refresh_lme_market_kpi_cache on public.lme_market_prices;
create trigger refresh_lme_market_kpi_cache after insert on public.lme_market_prices
for each row execute function public.refresh_lme_market_kpi_cache();

create or replace function public.import_lme_market_prices(
  rows_json jsonb,
  import_file_name text,
  import_created_by_name text,
  import_pre_skipped_rows integer
)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  total_count integer := jsonb_array_length(rows_json);
  inserted_count integer := 0;
  skipped_count integer := 0;
begin
  if not public.is_approved_admin() then raise exception 'Admin permission is required.' using errcode = '42501'; end if;
  if total_count > 1000 then raise exception 'A maximum of 1000 rows can be imported at once.' using errcode = '22023'; end if;

  with source_rows as (
    select * from jsonb_to_recordset(rows_json) as row_data(
      reference_date date, reference_month date, round smallint, material_code text,
      lme_al_usd_per_ton numeric, exchange_rate_krw_per_usd numeric,
      domestic_lme_krw_per_kg numeric, source_url text, memo text
    )
  ), inserted as (
    insert into public.lme_market_prices (
      reference_date, reference_month, round, material_code, lme_al_usd_per_ton,
      exchange_rate_krw_per_usd, domestic_lme_krw_per_kg, source_url, memo,
      created_by, created_by_name
    )
    select reference_date, reference_month, round, material_code, lme_al_usd_per_ton,
      exchange_rate_krw_per_usd, domestic_lme_krw_per_kg, source_url, memo,
      auth.uid(), import_created_by_name
    from source_rows
    on conflict (reference_month, round, material_code) do nothing
    returning 1
  )
  select count(*) into inserted_count from inserted;

  skipped_count := import_pre_skipped_rows + total_count - inserted_count;
  insert into public.lme_import_logs (
    file_name, total_rows, inserted_rows, skipped_rows, failed_rows,
    created_by, created_by_name
  ) values (
    import_file_name, total_count + import_pre_skipped_rows, inserted_count, skipped_count, 0,
    auth.uid(), import_created_by_name
  );
  return jsonb_build_object('insertedRows', inserted_count, 'skippedRows', skipped_count, 'failedRows', 0);
end;
$$;

create or replace function public.prevent_lme_market_history_change()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'LME Market History rows are immutable.' using errcode = '55000';
end;
$$;

drop trigger if exists prevent_lme_market_history_change on public.lme_market_prices;
create trigger prevent_lme_market_history_change before update or delete on public.lme_market_prices
for each row execute function public.prevent_lme_market_history_change();

alter table public.lme_materials enable row level security;
alter table public.lme_market_prices enable row level security;
alter table public.lme_market_kpi_cache enable row level security;
alter table public.lme_import_logs enable row level security;

drop policy if exists lme_materials_select_approved on public.lme_materials;
drop policy if exists lme_market_prices_select_approved on public.lme_market_prices;
drop policy if exists lme_market_prices_insert_admin on public.lme_market_prices;
drop policy if exists lme_market_kpi_cache_select_approved on public.lme_market_kpi_cache;
drop policy if exists lme_import_logs_select_admin on public.lme_import_logs;
drop policy if exists lme_import_logs_insert_admin on public.lme_import_logs;
create policy lme_materials_select_approved on public.lme_materials for select to authenticated using (public.is_approved_erp_user());
create policy lme_market_prices_select_approved on public.lme_market_prices for select to authenticated using (public.is_approved_erp_user());
create policy lme_market_prices_insert_admin on public.lme_market_prices for insert to authenticated with check (public.is_approved_admin() and created_by = auth.uid());
create policy lme_market_kpi_cache_select_approved on public.lme_market_kpi_cache for select to authenticated using (public.is_approved_erp_user());
create policy lme_import_logs_select_admin on public.lme_import_logs for select to authenticated using (public.is_approved_admin());
create policy lme_import_logs_insert_admin on public.lme_import_logs for insert to authenticated with check (public.is_approved_admin() and created_by = auth.uid());

revoke all on public.lme_materials, public.lme_market_prices, public.lme_market_kpi_cache, public.lme_import_logs from anon;
revoke all on public.lme_materials, public.lme_market_prices, public.lme_market_kpi_cache, public.lme_import_logs from authenticated;
grant select on public.lme_materials to authenticated;
grant select, insert on public.lme_market_prices to authenticated;
grant select on public.lme_market_kpi_cache to authenticated;
grant select, insert on public.lme_import_logs to authenticated;
revoke all on function public.import_lme_market_prices(jsonb, text, text, integer) from public, anon;
grant execute on function public.import_lme_market_prices(jsonb, text, text, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
