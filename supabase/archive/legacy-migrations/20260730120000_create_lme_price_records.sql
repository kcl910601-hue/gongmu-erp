create extension if not exists pgcrypto;

create table if not exists public.lme_status_thresholds (
  id smallint primary key default 1 check (id = 1),
  normal_max_rate numeric not null default 3 check (normal_max_rate >= 0),
  caution_max_rate numeric not null default 7 check (caution_max_rate > normal_max_rate),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.lme_status_thresholds (id, normal_max_rate, caution_max_rate)
values (1, 3, 7)
on conflict (id) do nothing;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists suppliers_normalized_name_uidx
  on public.suppliers (lower(btrim(name)));

insert into public.suppliers (name)
select min(organization.name)
from public.organizations organization
join public.organization_categories category on category.id = organization.category_id
where category.code = 'partner' and btrim(organization.name) <> ''
group by lower(btrim(organization.name))
on conflict do nothing;

create table if not exists public.lme_price_records (
  id uuid primary key default gen_random_uuid(),
  reference_date date not null,
  reference_month date not null,
  round smallint not null check (round in (1, 2)),
  supplier_id uuid not null references public.suppliers(id) on update cascade on delete restrict,
  lme_al_usd_per_ton numeric not null check (lme_al_usd_per_ton >= 0),
  exchange_rate_krw_per_usd numeric not null check (exchange_rate_krw_per_usd >= 0),
  domestic_lme_krw_per_kg numeric not null,
  processing_cost_krw_per_kg numeric not null default 0 check (processing_cost_krw_per_kg >= 0),
  standard_cost_krw_per_kg numeric not null,
  applied_price_krw_per_kg numeric not null check (applied_price_krw_per_kg >= 0),
  difference_krw_per_kg numeric not null,
  difference_rate numeric not null,
  status text not null check (status in ('favorable', 'normal', 'caution', 'high')),
  effective_start_date date,
  effective_end_date date,
  quantity_ton numeric check (quantity_ton is null or quantity_ton >= 0),
  source_url text not null default 'https://www.nonferrous.or.kr/stats/?act=sub3',
  memo text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  supersedes_id uuid references public.lme_price_records(id) on delete restrict,
  is_current boolean not null default true,
  check (effective_end_date is null or effective_start_date is null or effective_end_date >= effective_start_date)
);

create unique index if not exists lme_price_records_current_month_round_supplier_uidx
  on public.lme_price_records (reference_month, round, supplier_id)
  where is_current;
create index if not exists lme_price_records_reference_date_idx on public.lme_price_records(reference_date);
create index if not exists lme_price_records_reference_month_idx on public.lme_price_records(reference_month);
create index if not exists lme_price_records_supplier_id_idx on public.lme_price_records(supplier_id);
create index if not exists lme_price_records_created_at_idx on public.lme_price_records(created_at);

create or replace function public.calculate_lme_price_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  threshold_row public.lme_status_thresholds%rowtype;
begin
  select * into threshold_row from public.lme_status_thresholds where id = 1;
  new.reference_month = date_trunc('month', new.reference_date)::date;
  if new.supersedes_id is not null then
    select revision into new.revision
    from public.lme_price_records
    where id = new.supersedes_id and is_current;
    if not found then raise exception '수정할 현재 LME 자료를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
    new.revision = new.revision + 1;
    update public.lme_price_records set is_current = false where id = new.supersedes_id;
  else
    new.revision = 1;
  end if;
  new.domestic_lme_krw_per_kg = round(new.lme_al_usd_per_ton * new.exchange_rate_krw_per_usd / 1000, 4);
  new.standard_cost_krw_per_kg = round(new.domestic_lme_krw_per_kg + new.processing_cost_krw_per_kg, 4);
  new.difference_krw_per_kg = round(new.applied_price_krw_per_kg - new.standard_cost_krw_per_kg, 4);
  new.difference_rate = case
    when new.standard_cost_krw_per_kg = 0 then 0
    else round(new.difference_krw_per_kg / new.standard_cost_krw_per_kg * 100, 4)
  end;
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

alter table public.lme_status_thresholds enable row level security;
alter table public.suppliers enable row level security;
alter table public.lme_price_records enable row level security;

create policy lme_thresholds_select_approved
  on public.lme_status_thresholds for select to authenticated
  using (public.is_approved_erp_user());
create policy lme_thresholds_update_admin
  on public.lme_status_thresholds for update to authenticated
  using (public.is_approved_admin())
  with check (public.is_approved_admin());

create policy suppliers_select_approved
  on public.suppliers for select to authenticated
  using (public.is_approved_erp_user());
create policy suppliers_insert_admin
  on public.suppliers for insert to authenticated
  with check (public.is_approved_admin());
create policy suppliers_update_admin
  on public.suppliers for update to authenticated
  using (public.is_approved_admin()) with check (public.is_approved_admin());

create policy lme_records_select_approved
  on public.lme_price_records for select to authenticated
  using (public.is_approved_erp_user());
create policy lme_records_insert_admin
  on public.lme_price_records for insert to authenticated
  with check (public.is_approved_admin() and created_by = auth.uid());
create policy lme_records_delete_admin
  on public.lme_price_records for delete to authenticated
  using (public.is_approved_admin());

revoke all on public.lme_status_thresholds from anon;
revoke all on public.suppliers from anon;
revoke all on public.lme_price_records from anon;
revoke all on public.lme_status_thresholds from authenticated;
revoke all on public.suppliers from authenticated;
revoke all on public.lme_price_records from authenticated;
grant select, update on public.lme_status_thresholds to authenticated;
grant select, insert, update on public.suppliers to authenticated;
grant select, insert, delete on public.lme_price_records to authenticated;
