-- Structural and data-preservation verification; run after the migration.
select exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='partner_type' and e.enumlabel='coating') as coating_partner_type_exists;
select table_name,column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name like 'coating_cost_%' order by table_name,ordinal_position;
select conrelid::regclass table_name,conname,pg_get_constraintdef(oid) from pg_constraint where conrelid in('public.coating_cost_statements'::regclass,'public.coating_cost_allocations'::regclass,'public.coating_cost_allocation_history'::regclass) order by 1,2;
select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename like 'coating_cost_%' order by 1,2;
select tablename,policyname,cmd from pg_policies where schemaname='public' and tablename like 'coating_cost_%' order by 1,2;
select proname,pg_get_function_identity_arguments(oid) from pg_proc where pronamespace='public'::regnamespace and proname like '%coating_cost%' order by 1;
select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename in('coating_cost_statements','coating_cost_allocations');
select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid='public.editing_locks'::regclass and conname='editing_locks_resource_type_check';
select 'projects' table_name,count(*) row_count from public.projects union all select 'project_cost_entries',count(*) from public.project_cost_entries union all select 'project_material_usages',count(*) from public.project_material_usages union all select 'raw_material_contracts',count(*) from public.raw_material_contracts union all select 'material_usage_requests',count(*) from public.material_usage_requests union all select 'material_contract_allocations',count(*) from public.material_contract_allocations union all select 'organizations',count(*) from public.organizations union all select 'suppliers',count(*) from public.suppliers;
select s.id,s.supply_amount_krw,coalesce(sum(a.allocated_supply_amount_krw)filter(where a.status='active'),0) allocated,s.supply_amount_krw-coalesce(sum(a.allocated_supply_amount_krw)filter(where a.status='active'),0) unallocated from public.coating_cost_statements s left join public.coating_cost_allocations a on a.statement_id=s.id where s.status='active' group by s.id;


-- Run after 20260821150000_create_coating_actual_cost_management.sql.
select proname,pg_get_function_identity_arguments(oid) arguments,prosecdef security_definer from pg_proc where pronamespace='public'::regnamespace and proname in('create_project_coating_cost_entry','update_project_coating_cost_entry','void_project_coating_cost_entry') order by proname;
-- Before UAT, capture counts. Run create/update/void RPCs as an approved Admin, then compare.
select 'coating_cost_statements' table_name,count(*) row_count from public.coating_cost_statements union all select 'coating_cost_allocations',count(*) from public.coating_cost_allocations union all select 'coating_cost_allocation_history',count(*) from public.coating_cost_allocation_history;
select s.id,s.supply_amount_krw,a.project_id,a.allocated_supply_amount_krw,s.supply_amount_krw-a.allocated_supply_amount_krw unallocated,s.status statement_status,a.status allocation_status from public.coating_cost_statements s join public.coating_cost_allocations a on a.statement_id=s.id where (s.id,a.project_id)=(nullif(current_setting('app.verify_coating_statement_id',true),'')::uuid,nullif(current_setting('app.verify_project_id',true),'')::bigint);
select h.action,h.before_data,h.after_data,h.changed_at from public.coating_cost_allocation_history h where h.statement_id=nullif(current_setting('app.verify_coating_statement_id',true),'')::uuid order by h.changed_at;
select a.project_id,coalesce(sum(a.allocated_supply_amount_krw),0) actual_coating_cost_krw from public.coating_cost_allocations a join public.coating_cost_statements s on s.id=a.statement_id where a.status='active' and s.status='active' group by a.project_id;
-- Multi-project protection: update_project_coating_cost_entry and void_project_coating_cost_entry must raise 23514 when active allocation count is not one or the amount is not 100% allocated.



-- Regression guards: existing domains remain present and untouched.
select to_regclass('public.glass_cost_statements') is not null as glass_statements_preserved,
       to_regclass('public.project_material_usages') is not null as al_usages_preserved;
