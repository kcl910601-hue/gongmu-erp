begin;

create table if not exists public.raw_material_contracts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null,
  material_code text not null,
  contract_name text not null,
  contract_year integer not null,
  contract_price_krw_per_kg numeric(16,4) not null,
  processing_cost_krw_per_kg numeric(16,4) not null,
  effective_start_date date not null,
  effective_end_date date not null,
  contract_quantity_ton numeric(16,4) not null,
  remaining_quantity_ton numeric(16,4) not null,
  status text not null,
  memo text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint raw_material_contracts_supplier_fkey foreign key (supplier_id) references public.suppliers(id) on update cascade on delete restrict,
  constraint raw_material_contracts_material_fkey foreign key (material_code) references public.lme_materials(code) on update cascade on delete restrict,
  constraint raw_material_contracts_status_check check (status in ('scheduled', 'active', 'completed', 'cancelled')),
  constraint raw_material_contracts_year_check check (contract_year between 2000 and 2200),
  constraint raw_material_contracts_dates_check check (effective_end_date >= effective_start_date),
  constraint raw_material_contracts_values_check check (contract_price_krw_per_kg > 0 and processing_cost_krw_per_kg >= 0 and contract_quantity_ton > 0 and remaining_quantity_ton >= 0 and remaining_quantity_ton <= contract_quantity_ton),
  constraint raw_material_contracts_name_check check (btrim(contract_name) <> '' and char_length(contract_name) <= 200),
  constraint raw_material_contracts_memo_check check (memo is null or char_length(memo) <= 2000)
);

create index if not exists raw_material_contracts_supplier_start_idx on public.raw_material_contracts(supplier_id, effective_start_date desc);
create index if not exists raw_material_contracts_status_end_idx on public.raw_material_contracts(status, effective_end_date);
create index if not exists raw_material_contracts_material_idx on public.raw_material_contracts(material_code);

create or replace function public.prepare_raw_material_contract()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.remaining_quantity_ton := new.contract_quantity_ton;
  else
    if new.supplier_id is distinct from old.supplier_id
       or new.material_code is distinct from old.material_code
       or new.contract_name is distinct from old.contract_name
       or new.contract_year is distinct from old.contract_year
       or new.contract_price_krw_per_kg is distinct from old.contract_price_krw_per_kg
       or new.processing_cost_krw_per_kg is distinct from old.processing_cost_krw_per_kg
       or new.effective_start_date is distinct from old.effective_start_date
       or new.effective_end_date is distinct from old.effective_end_date
       or new.contract_quantity_ton is distinct from old.contract_quantity_ton
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Core contract terms are immutable. Register a new contract instead.' using errcode = '55000';
    end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists prepare_raw_material_contract on public.raw_material_contracts;
create trigger prepare_raw_material_contract before insert or update on public.raw_material_contracts
for each row execute function public.prepare_raw_material_contract();

alter table public.raw_material_contracts enable row level security;
drop policy if exists raw_material_contracts_select_approved on public.raw_material_contracts;
drop policy if exists raw_material_contracts_insert_admin on public.raw_material_contracts;
drop policy if exists raw_material_contracts_update_admin on public.raw_material_contracts;
create policy raw_material_contracts_select_approved on public.raw_material_contracts for select to authenticated using (public.is_approved_erp_user());
create policy raw_material_contracts_insert_admin on public.raw_material_contracts for insert to authenticated with check (public.is_approved_admin() and created_by = auth.uid());
create policy raw_material_contracts_update_admin on public.raw_material_contracts for update to authenticated using (public.is_approved_admin()) with check (public.is_approved_admin());

revoke all on public.raw_material_contracts from anon, authenticated;
grant select, insert, update on public.raw_material_contracts to authenticated;

notify pgrst, 'reload schema';
commit;
