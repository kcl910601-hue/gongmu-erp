begin;

alter table public.material_contract_allocations
  add column if not exists allocation_type text,
  add column if not exists destination_name text;

update public.material_contract_allocations
set allocation_type = 'project'
where allocation_type is null;

alter table public.material_contract_allocations
  alter column allocation_type set not null,
  alter column project_id drop not null;

alter table public.material_contract_allocations
  add constraint material_contract_allocations_target_check check (
    (allocation_type = 'project' and project_id is not null)
    or
    (allocation_type in ('factory', 'as', 'sample', 'etc') and project_id is null and nullif(btrim(destination_name), '') is not null)
  ),
  add constraint material_contract_allocations_destination_name_check check (
    destination_name is null or char_length(destination_name) <= 200
  );

create index if not exists material_contract_allocations_type_idx
  on public.material_contract_allocations(allocation_type, allocation_date desc);

notify pgrst, 'reload schema';
commit;
