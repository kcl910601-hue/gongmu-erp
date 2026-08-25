-- Repair a partially applied legacy LME schema without deleting existing rows.
begin;

create extension if not exists pgcrypto;

create table if not exists public.lme_status_thresholds (
  id smallint primary key default 1 check (id = 1),
  normal_max_rate numeric not null default 3,
  caution_max_rate numeric not null default 7,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.lme_status_thresholds add column if not exists normal_max_rate numeric;
alter table public.lme_status_thresholds add column if not exists caution_max_rate numeric;
alter table public.lme_status_thresholds add column if not exists updated_at timestamptz default now();
alter table public.lme_status_thresholds add column if not exists updated_by uuid;
insert into public.lme_status_thresholds (id, normal_max_rate, caution_max_rate)
values (1, 3, 7)
on conflict (id) do update set
  normal_max_rate = coalesce(public.lme_status_thresholds.normal_max_rate, excluded.normal_max_rate),
  caution_max_rate = coalesce(public.lme_status_thresholds.caution_max_rate, excluded.caution_max_rate);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.suppliers add column if not exists name text;
alter table public.suppliers add column if not exists is_active boolean default true;
alter table public.suppliers add column if not exists created_at timestamptz default now();
alter table public.suppliers add column if not exists updated_at timestamptz default now();
update public.suppliers set is_active = true where is_active is null;
update public.suppliers set created_at = now() where created_at is null;
update public.suppliers set updated_at = coalesce(created_at, now()) where updated_at is null;
update public.suppliers set name = '복구 공급업체 (' || id::text || ')' where name is null or btrim(name) = '';
with duplicate_names as (
  select id, row_number() over (partition by lower(btrim(name)) order by created_at, id) as duplicate_order
  from public.suppliers
)
update public.suppliers supplier
set name = supplier.name || ' (중복 복구 ' || supplier.id::text || ')'
from duplicate_names duplicate
where supplier.id = duplicate.id and duplicate.duplicate_order > 1;
create unique index if not exists suppliers_normalized_name_uidx on public.suppliers (lower(btrim(name)));

do $$
begin
  if to_regclass('public.organizations') is not null
     and to_regclass('public.organization_categories') is not null then
    execute $sql$
      insert into public.suppliers (name)
      select min(btrim(o.name))
      from public.organizations o
      join public.organization_categories c on c.id = o.category_id
      where c.code = 'partner' and o.name is not null and btrim(o.name) <> ''
      group by lower(btrim(o.name))
      on conflict do nothing
    $sql$;
  end if;
end
$$;

create table if not exists public.lme_price_records (
  id uuid primary key default gen_random_uuid()
);

alter table public.lme_price_records add column if not exists reference_date date;
alter table public.lme_price_records add column if not exists reference_month date;
alter table public.lme_price_records add column if not exists round smallint;
alter table public.lme_price_records add column if not exists supplier_id uuid;
alter table public.lme_price_records add column if not exists lme_al_usd_per_ton numeric;
alter table public.lme_price_records add column if not exists exchange_rate_krw_per_usd numeric;
alter table public.lme_price_records add column if not exists domestic_lme_krw_per_kg numeric;
alter table public.lme_price_records add column if not exists processing_cost_krw_per_kg numeric default 0;
alter table public.lme_price_records add column if not exists standard_cost_krw_per_kg numeric;
alter table public.lme_price_records add column if not exists applied_price_krw_per_kg numeric;
alter table public.lme_price_records add column if not exists difference_krw_per_kg numeric;
alter table public.lme_price_records add column if not exists difference_rate numeric;
alter table public.lme_price_records add column if not exists status text;
alter table public.lme_price_records add column if not exists effective_start_date date;
alter table public.lme_price_records add column if not exists effective_end_date date;
alter table public.lme_price_records add column if not exists quantity_ton numeric;
alter table public.lme_price_records add column if not exists source_url text;
alter table public.lme_price_records add column if not exists memo text;
alter table public.lme_price_records add column if not exists created_by uuid;
alter table public.lme_price_records add column if not exists created_by_name text;
alter table public.lme_price_records add column if not exists created_at timestamptz default now();
alter table public.lme_price_records add column if not exists updated_by uuid;
alter table public.lme_price_records add column if not exists updated_at timestamptz default now();
alter table public.lme_price_records add column if not exists revision integer default 1;
alter table public.lme_price_records add column if not exists supersedes_id uuid;
alter table public.lme_price_records add column if not exists is_current boolean default true;

do $$
declare
  id_type text;
  supplier_id_type text;
  supplier_pk_type text;
begin
  select data_type into id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'lme_price_records' and column_name = 'id';
  select data_type into supplier_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'lme_price_records' and column_name = 'supplier_id';
  select data_type into supplier_pk_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'suppliers' and column_name = 'id';
  if id_type <> 'uuid' then
    raise exception 'lme_price_records.id must be uuid, found %; repair stopped without commit', id_type;
  end if;
  if supplier_id_type <> 'uuid' then
    raise exception 'lme_price_records.supplier_id must be uuid, found %; repair stopped without commit', supplier_id_type;
  end if;
  if supplier_pk_type <> 'uuid' then
    raise exception 'suppliers.id must be uuid, found %; repair stopped without commit', supplier_pk_type;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lme_price_records' and column_name = 'supplier_name'
  ) then
    execute $sql$
      insert into public.suppliers (name)
      select min(btrim(supplier_name))
      from public.lme_price_records
      where supplier_name is not null and btrim(supplier_name) <> ''
      group by lower(btrim(supplier_name))
      on conflict do nothing
    $sql$;
    execute $sql$
      update public.lme_price_records record
      set supplier_id = supplier.id
      from public.suppliers supplier
      where record.supplier_id is null
        and record.supplier_name is not null
        and btrim(record.supplier_name) <> ''
        and lower(btrim(record.supplier_name)) = lower(btrim(supplier.name))
    $sql$;
  end if;
end
$$;

-- Preserve orphan supplier UUIDs that may exist after a different partial attempt.
insert into public.suppliers (id, name)
select distinct record.supplier_id, '복구 공급업체 (' || record.supplier_id::text || ')'
from public.lme_price_records record
left join public.suppliers supplier on supplier.id = record.supplier_id
where record.supplier_id is not null and supplier.id is null
on conflict (id) do nothing;

-- Legacy rows without a supplier name are retained under one explicit migration-only Master.
insert into public.suppliers (name)
select '공급업체 미지정 (기존 LME 데이터)'
where exists (select 1 from public.lme_price_records where supplier_id is null)
  and not exists (
    select 1 from public.suppliers
    where lower(btrim(name)) = lower('공급업체 미지정 (기존 LME 데이터)')
  );
update public.lme_price_records record
set supplier_id = supplier.id
from public.suppliers supplier
where record.supplier_id is null
  and lower(btrim(supplier.name)) = lower('공급업체 미지정 (기존 LME 데이터)');

update public.lme_price_records
set reference_month = date_trunc('month', reference_date)::date
where reference_date is not null
  and reference_month is distinct from date_trunc('month', reference_date)::date;
update public.lme_price_records set processing_cost_krw_per_kg = 0 where processing_cost_krw_per_kg is null;
update public.lme_price_records set created_at = now() where created_at is null;
update public.lme_price_records set updated_at = created_at where updated_at is null;
update public.lme_price_records set created_by_name = '기존 데이터' where created_by_name is null or btrim(created_by_name) = '';
update public.lme_price_records
set source_url = 'https://www.nonferrous.or.kr/stats/?act=sub3'
where source_url is null or btrim(source_url) = '';

do $$
begin
  if exists (
    select 1 from public.lme_price_records
    where reference_date is null or round is null or supplier_id is null
      or lme_al_usd_per_ton is null or exchange_rate_krw_per_usd is null
      or applied_price_krw_per_kg is null
  ) then
    raise exception 'Required legacy LME source values are NULL; repair stopped without data loss. Inspect reference_date, round, supplier_id, LME, exchange rate, and applied price.';
  end if;
end
$$;

update public.lme_price_records
set domestic_lme_krw_per_kg = round(lme_al_usd_per_ton * exchange_rate_krw_per_usd / 1000, 4),
    standard_cost_krw_per_kg = round(lme_al_usd_per_ton * exchange_rate_krw_per_usd / 1000 + processing_cost_krw_per_kg, 4);
update public.lme_price_records
set difference_krw_per_kg = round(applied_price_krw_per_kg - standard_cost_krw_per_kg, 4),
    difference_rate = case when standard_cost_krw_per_kg = 0 then 0 else round((applied_price_krw_per_kg - standard_cost_krw_per_kg) / standard_cost_krw_per_kg * 100, 4) end;
alter table public.lme_price_records drop constraint if exists lme_price_records_status_check;
update public.lme_price_records record
set status = case
  when record.difference_rate <= 0 then 'favorable'
  when record.difference_rate <= threshold.normal_max_rate then 'normal'
  when record.difference_rate <= threshold.caution_max_rate then 'caution'
  else 'high'
end
from public.lme_status_thresholds threshold
where threshold.id = 1;

-- Convert duplicate legacy contracts into a lossless revision chain.
with ranked as (
  select id,
    row_number() over (
      partition by reference_month, round, supplier_id
      order by coalesce(updated_at, created_at, 'epoch'::timestamptz), created_at, id
    ) as next_revision,
    lag(id) over (
      partition by reference_month, round, supplier_id
      order by coalesce(updated_at, created_at, 'epoch'::timestamptz), created_at, id
    ) as previous_id,
    row_number() over (
      partition by reference_month, round, supplier_id
      order by coalesce(updated_at, created_at, 'epoch'::timestamptz) desc, created_at desc, id desc
    ) = 1 as next_is_current
  from public.lme_price_records
)
update public.lme_price_records record
set revision = ranked.next_revision,
    supersedes_id = ranked.previous_id,
    is_current = ranked.next_is_current
from ranked
where record.id = ranked.id;

alter table public.lme_price_records alter column reference_date set not null;
alter table public.lme_price_records alter column reference_month set not null;
alter table public.lme_price_records alter column round set not null;
alter table public.lme_price_records alter column supplier_id set not null;
alter table public.lme_price_records alter column lme_al_usd_per_ton set not null;
alter table public.lme_price_records alter column exchange_rate_krw_per_usd set not null;
alter table public.lme_price_records alter column domestic_lme_krw_per_kg set not null;
alter table public.lme_price_records alter column processing_cost_krw_per_kg set default 0;
alter table public.lme_price_records alter column processing_cost_krw_per_kg set not null;
alter table public.lme_price_records alter column standard_cost_krw_per_kg set not null;
alter table public.lme_price_records alter column applied_price_krw_per_kg set not null;
alter table public.lme_price_records alter column difference_krw_per_kg set not null;
alter table public.lme_price_records alter column difference_rate set not null;
alter table public.lme_price_records alter column status set not null;
alter table public.lme_price_records alter column created_by_name set not null;
alter table public.lme_price_records alter column created_at set default now();
alter table public.lme_price_records alter column created_at set not null;
alter table public.lme_price_records alter column updated_at set default now();
alter table public.lme_price_records alter column updated_at set not null;
alter table public.lme_price_records alter column revision set default 1;
alter table public.lme_price_records alter column revision set not null;
alter table public.lme_price_records alter column is_current set default true;
alter table public.lme_price_records alter column is_current set not null;
alter table public.suppliers alter column name set not null;
alter table public.suppliers alter column is_active set not null;
alter table public.suppliers alter column created_at set not null;
alter table public.suppliers alter column updated_at set not null;

alter table public.lme_price_records drop constraint if exists lme_price_records_round_check;
alter table public.lme_price_records add constraint lme_price_records_round_check check (round in (1, 2));
alter table public.lme_price_records drop constraint if exists lme_price_records_lme_al_usd_per_ton_check;
alter table public.lme_price_records add constraint lme_price_records_lme_al_usd_per_ton_check check (lme_al_usd_per_ton >= 0);
alter table public.lme_price_records drop constraint if exists lme_price_records_exchange_rate_krw_per_usd_check;
alter table public.lme_price_records add constraint lme_price_records_exchange_rate_krw_per_usd_check check (exchange_rate_krw_per_usd >= 0);
alter table public.lme_price_records drop constraint if exists lme_price_records_processing_cost_krw_per_kg_check;
alter table public.lme_price_records add constraint lme_price_records_processing_cost_krw_per_kg_check check (processing_cost_krw_per_kg >= 0);
alter table public.lme_price_records drop constraint if exists lme_price_records_applied_price_krw_per_kg_check;
alter table public.lme_price_records add constraint lme_price_records_applied_price_krw_per_kg_check check (applied_price_krw_per_kg >= 0);
alter table public.lme_price_records drop constraint if exists lme_price_records_quantity_ton_check;
alter table public.lme_price_records add constraint lme_price_records_quantity_ton_check check (quantity_ton is null or quantity_ton >= 0);
alter table public.lme_price_records drop constraint if exists lme_price_records_effective_dates_check;
alter table public.lme_price_records add constraint lme_price_records_effective_dates_check check (effective_end_date is null or effective_start_date is null or effective_end_date >= effective_start_date);
alter table public.lme_price_records drop constraint if exists lme_price_records_revision_check;
alter table public.lme_price_records add constraint lme_price_records_revision_check check (revision > 0);
alter table public.lme_price_records add constraint lme_price_records_status_check check (status in ('favorable', 'normal', 'caution', 'high'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lme_price_records'::regclass
      and conname = 'lme_price_records_supplier_id_fkey'
  ) then
    alter table public.lme_price_records
      add constraint lme_price_records_supplier_id_fkey
      foreign key (supplier_id) references public.suppliers(id)
      on update cascade on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lme_price_records'::regclass
      and conname = 'lme_price_records_supersedes_id_fkey'
  ) then
    alter table public.lme_price_records
      add constraint lme_price_records_supersedes_id_fkey
      foreign key (supersedes_id) references public.lme_price_records(id)
      on delete restrict;
  end if;
end
$$;

drop index if exists public.lme_price_records_month_round_supplier_uidx;
create unique index if not exists suppliers_normalized_name_uidx on public.suppliers (lower(btrim(name)));
create unique index if not exists lme_price_records_current_month_round_supplier_uidx
  on public.lme_price_records (reference_month, round, supplier_id) where is_current;
create index if not exists lme_price_records_reference_date_idx on public.lme_price_records(reference_date);
create index if not exists lme_price_records_reference_month_idx on public.lme_price_records(reference_month);
create index if not exists lme_price_records_supplier_id_idx on public.lme_price_records(supplier_id);
create index if not exists lme_price_records_created_at_idx on public.lme_price_records(created_at);

create or replace function public.calculate_lme_price_record()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  threshold_row public.lme_status_thresholds%rowtype;
  previous_row public.lme_price_records%rowtype;
begin
  if not public.is_approved_admin() then
    raise exception 'Admin permission is required.' using errcode = '42501';
  end if;
  select * into threshold_row from public.lme_status_thresholds where id = 1;
  if not found then raise exception 'LME status threshold row is missing.'; end if;

  new.reference_month = date_trunc('month', new.reference_date)::date;
  new.is_current = true;
  if new.supersedes_id is not null then
    if new.supersedes_id = new.id then raise exception 'An LME revision cannot supersede itself.'; end if;
    select * into previous_row
    from public.lme_price_records
    where id = new.supersedes_id
    for update;
    if not found or previous_row.is_current is not true then
      raise exception 'The superseded LME record is not the current revision.' using errcode = 'P0002';
    end if;
    if previous_row.reference_month <> new.reference_month
       or previous_row.round <> new.round
       or previous_row.supplier_id <> new.supplier_id then
      raise exception 'A revision must retain reference month, round, and supplier.' using errcode = '23514';
    end if;
    new.revision = previous_row.revision + 1;
    update public.lme_price_records set is_current = false where id = previous_row.id;
  else
    new.revision = 1;
  end if;

  new.domestic_lme_krw_per_kg = round(new.lme_al_usd_per_ton * new.exchange_rate_krw_per_usd / 1000, 4);
  new.standard_cost_krw_per_kg = round(new.domestic_lme_krw_per_kg + new.processing_cost_krw_per_kg, 4);
  new.difference_krw_per_kg = round(new.applied_price_krw_per_kg - new.standard_cost_krw_per_kg, 4);
  new.difference_rate = case when new.standard_cost_krw_per_kg = 0 then 0 else round(new.difference_krw_per_kg / new.standard_cost_krw_per_kg * 100, 4) end;
  new.status = case
    when new.difference_rate <= 0 then 'favorable'
    when new.difference_rate <= threshold_row.normal_max_rate then 'normal'
    when new.difference_rate <= threshold_row.caution_max_rate then 'caution'
    else 'high'
  end;
  return new;
end;
$$;

drop trigger if exists calculate_lme_price_record on public.lme_price_records;
create trigger calculate_lme_price_record
before insert on public.lme_price_records
for each row execute function public.calculate_lme_price_record();

alter table public.suppliers enable row level security;
alter table public.lme_status_thresholds enable row level security;
alter table public.lme_price_records enable row level security;

drop policy if exists suppliers_select_approved on public.suppliers;
drop policy if exists suppliers_insert_admin on public.suppliers;
drop policy if exists suppliers_update_admin on public.suppliers;
create policy suppliers_select_approved on public.suppliers for select to authenticated using (public.is_approved_erp_user());
create policy suppliers_insert_admin on public.suppliers for insert to authenticated with check (public.is_approved_admin());
create policy suppliers_update_admin on public.suppliers for update to authenticated using (public.is_approved_admin()) with check (public.is_approved_admin());

drop policy if exists lme_thresholds_select_approved on public.lme_status_thresholds;
drop policy if exists lme_thresholds_update_admin on public.lme_status_thresholds;
create policy lme_thresholds_select_approved on public.lme_status_thresholds for select to authenticated using (public.is_approved_erp_user());
create policy lme_thresholds_update_admin on public.lme_status_thresholds for update to authenticated using (public.is_approved_admin()) with check (public.is_approved_admin());

drop policy if exists lme_records_select_approved on public.lme_price_records;
drop policy if exists lme_records_insert_admin on public.lme_price_records;
drop policy if exists lme_records_update_admin on public.lme_price_records;
drop policy if exists lme_records_delete_admin on public.lme_price_records;
create policy lme_records_select_approved on public.lme_price_records for select to authenticated using (public.is_approved_erp_user());
create policy lme_records_insert_admin on public.lme_price_records for insert to authenticated with check (public.is_approved_admin() and created_by = auth.uid());
create policy lme_records_delete_admin on public.lme_price_records for delete to authenticated using (public.is_approved_admin());

revoke all on public.suppliers, public.lme_status_thresholds, public.lme_price_records from anon;
revoke all on public.suppliers, public.lme_status_thresholds, public.lme_price_records from authenticated;
grant select, insert, update on public.suppliers to authenticated;
grant select, update on public.lme_status_thresholds to authenticated;
grant select, insert, delete on public.lme_price_records to authenticated;

notify pgrst, 'reload schema';
commit;
