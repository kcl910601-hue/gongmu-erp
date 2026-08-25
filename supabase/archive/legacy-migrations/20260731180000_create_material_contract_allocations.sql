begin;

create table if not exists public.material_contract_allocations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.raw_material_contracts(id) on update cascade on delete restrict,
  project_id bigint not null references public.projects(id) on update cascade on delete restrict,
  quantity_tons numeric(16,4) not null check (quantity_tons > 0),
  allocation_date date not null,
  status text not null check (status in ('planned', 'confirmed', 'cancelled')),
  purchase_order_no text,
  memo text,
  created_by uuid not null references auth.users(id) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_contract_allocations_purchase_order_check
    check (purchase_order_no is null or char_length(purchase_order_no) <= 100),
  constraint material_contract_allocations_memo_check
    check (memo is null or char_length(memo) <= 2000)
);

create index if not exists material_contract_allocations_contract_status_idx
  on public.material_contract_allocations(contract_id, status);
create index if not exists material_contract_allocations_project_idx
  on public.material_contract_allocations(project_id);
create index if not exists material_contract_allocations_date_idx
  on public.material_contract_allocations(allocation_date);

create or replace function public.set_material_contract_allocations_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_material_contract_allocations_updated_at
  on public.material_contract_allocations;
create trigger set_material_contract_allocations_updated_at
before update on public.material_contract_allocations
for each row execute function public.set_material_contract_allocations_updated_at();

alter table public.material_contract_allocations enable row level security;

create policy material_contract_allocations_select_approved
  on public.material_contract_allocations
  for select to authenticated
  using (public.is_approved_erp_user());

create policy material_contract_allocations_insert_admin
  on public.material_contract_allocations
  for insert to authenticated
  with check (public.is_approved_admin() and created_by = auth.uid());

create policy material_contract_allocations_update_admin
  on public.material_contract_allocations
  for update to authenticated
  using (public.is_approved_admin())
  with check (public.is_approved_admin() and created_by = auth.uid());

revoke all on public.material_contract_allocations from anon, authenticated;
grant select, insert, update on public.material_contract_allocations to authenticated;

notify pgrst, 'reload schema';
commit;
