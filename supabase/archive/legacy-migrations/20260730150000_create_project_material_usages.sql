begin;

create table if not exists public.project_material_usages (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on update cascade on delete restrict,
  material_code text not null references public.lme_materials(code) on update cascade on delete restrict,
  raw_material_contract_id uuid references public.raw_material_contracts(id) on update cascade on delete restrict,
  lme_market_price_id uuid references public.lme_market_prices(id) on update cascade on delete restrict,
  pricing_basis text not null,
  cost_reference_date date not null,
  expected_quantity_kg numeric(18,3) not null,
  input_quantity numeric(18,3) not null,
  input_unit text not null,
  applied_unit_price_krw_per_kg numeric(16,4) not null,
  processing_cost_snapshot numeric(16,4),
  domestic_lme_snapshot numeric(16,4),
  contract_price_snapshot numeric(16,4),
  expected_cost_krw bigint not null,
  memo text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint project_material_usages_basis_check check (pricing_basis in ('contract', 'market')),
  constraint project_material_usages_unit_check check (input_unit in ('kg', 'ton')),
  constraint project_material_usages_quantity_check check (expected_quantity_kg > 0 and input_quantity > 0),
  constraint project_material_usages_price_check check (applied_unit_price_krw_per_kg > 0 and expected_cost_krw >= 0),
  constraint project_material_usages_memo_check check (memo is null or char_length(memo) <= 2000),
  constraint project_material_usages_basis_snapshot_check check (
    (pricing_basis = 'contract'
      and raw_material_contract_id is not null
      and lme_market_price_id is null
      and contract_price_snapshot is not null
      and contract_price_snapshot > 0
      and processing_cost_snapshot is null
      and domestic_lme_snapshot is null)
    or
    (pricing_basis = 'market'
      and raw_material_contract_id is null
      and lme_market_price_id is not null
      and contract_price_snapshot is null
      and processing_cost_snapshot is not null
      and processing_cost_snapshot >= 0
      and domestic_lme_snapshot is not null
      and domestic_lme_snapshot > 0)
  )
);

create index if not exists project_material_usages_project_idx
  on public.project_material_usages(project_id, created_at desc);
create index if not exists project_material_usages_material_idx
  on public.project_material_usages(material_code, cost_reference_date desc);
create index if not exists project_material_usages_contract_idx
  on public.project_material_usages(raw_material_contract_id)
  where raw_material_contract_id is not null;

create or replace function public.prepare_project_material_usage()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.project_id := old.project_id;
    new.material_code := old.material_code;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists prepare_project_material_usage on public.project_material_usages;
create trigger prepare_project_material_usage before update on public.project_material_usages
for each row execute function public.prepare_project_material_usage();

alter table public.project_material_usages enable row level security;
drop policy if exists project_material_usages_select_approved on public.project_material_usages;
drop policy if exists project_material_usages_insert_admin on public.project_material_usages;
drop policy if exists project_material_usages_update_admin on public.project_material_usages;
create policy project_material_usages_select_approved on public.project_material_usages
  for select to authenticated using (public.is_approved_erp_user());
create policy project_material_usages_insert_admin on public.project_material_usages
  for insert to authenticated with check (public.is_approved_admin() and created_by = auth.uid());
create policy project_material_usages_update_admin on public.project_material_usages
  for update to authenticated using (public.is_approved_admin()) with check (public.is_approved_admin());

revoke all on public.project_material_usages from anon, authenticated;
grant select, insert, update on public.project_material_usages to authenticated;

notify pgrst, 'reload schema';
commit;
