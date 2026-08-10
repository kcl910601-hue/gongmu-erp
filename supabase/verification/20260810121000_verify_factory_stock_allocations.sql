-- Run manually after reviewing and applying 20260810120000_support_factory_stock_allocations.sql.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.material_contract_allocations'::regclass
  and conname in ('material_contract_allocations_target_check', 'material_contract_allocations_destination_name_check');

select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'save_material_contract_allocation';

select allocation_type, project_id is null as project_is_null, count(*)
from public.material_contract_allocations
group by allocation_type, project_id is null
order by allocation_type, project_is_null;

select count(*) as invalid_factory_rows
from public.material_contract_allocations
where allocation_type = 'factory' and project_id is not null;
