begin;
select to_regclass('public.raw_material_contracts') as raw_material_contracts;
select relrowsecurity from pg_class where oid = 'public.raw_material_contracts'::regclass;
select conname, contype from pg_constraint where conrelid = 'public.raw_material_contracts'::regclass order by conname;
select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'raw_material_contracts' order by policyname;
select has_table_privilege('anon', 'public.raw_material_contracts', 'select') as anon_select,
       has_table_privilege('authenticated', 'public.raw_material_contracts', 'select') as authenticated_select,
       has_table_privilege('authenticated', 'public.raw_material_contracts', 'delete') as authenticated_delete;
select count(*) as supplier_orphans from public.raw_material_contracts contract left join public.suppliers supplier on supplier.id = contract.supplier_id where supplier.id is null;
select count(*) as material_orphans from public.raw_material_contracts contract left join public.lme_materials material on material.code = contract.material_code where material.code is null;
select count(*) as invalid_quantities from public.raw_material_contracts where contract_quantity_ton <= 0 or remaining_quantity_ton < 0 or remaining_quantity_ton > contract_quantity_ton;
select count(*) as invalid_dates from public.raw_material_contracts where effective_end_date < effective_start_date;
rollback;
