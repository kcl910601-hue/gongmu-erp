-- Run after 20260821160000_create_accessory_actual_usage_cost.sql. This script is read-only.
select exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='partner_type' and e.enumlabel='accessory') accessory_partner_type_exists;
select table_name,column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name in('accessory_items','accessory_price_history','project_accessory_usages') order by table_name,ordinal_position;
select conrelid::regclass table_name,conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid in('public.accessory_items'::regclass,'public.accessory_price_history'::regclass,'public.project_accessory_usages'::regclass) order by 1,2;
select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename in('accessory_items','accessory_price_history','project_accessory_usages') order by 1,2;
select tablename,policyname,cmd from pg_policies where schemaname='public' and tablename in('accessory_items','accessory_price_history','project_accessory_usages') order by 1,2;
select proname,pg_get_function_identity_arguments(oid),prosecdef from pg_proc where pronamespace='public'::regnamespace and proname in('save_accessory_item','save_project_accessory_usage','void_project_accessory_usage') order by proname;
select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename in('accessory_items','project_accessory_usages') order by tablename;
select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid='public.editing_locks'::regclass and conname='editing_locks_resource_type_check';

-- Calculation and Snapshot audit. Expected: 2,300 / 1,150,000 and 2,572 / 1,286,000.
select round(2300::numeric)::bigint krw_unit,round(500::numeric*round(2300::numeric))::bigint krw_total;
select round(1.85::numeric*1390::numeric)::bigint usd_krw_unit,round(500::numeric*round(1.85::numeric*1390::numeric))::bigint usd_total;
select id,accessory_item_id,snapshot_unit,snapshot_origin_type,snapshot_price_basis,snapshot_currency,snapshot_unit_price,snapshot_exchange_rate,snapshot_krw_unit_price,total_cost_krw,status from public.project_accessory_usages order by created_at desc;
select u.id,u.snapshot_unit_price usage_snapshot,i.current_unit_price master_current,u.snapshot_unit_price is distinct from i.current_unit_price snapshot_differs_after_price_change from public.project_accessory_usages u join public.accessory_items i on i.id=u.accessory_item_id;
select project_id,sum(total_cost_krw) accessory_actual_cost_krw from public.project_accessory_usages where status='active' group by project_id order by project_id;
select accessory_item_id,old_unit_price,new_unit_price,old_currency,new_currency,changed_at from public.accessory_price_history order by changed_at desc;

-- Existing-domain preservation guards. Capture row counts before/after UAT and compare.
select 'project_material_usages' source,count(*) rows from public.project_material_usages
union all select 'glass_cost_statements',count(*) from public.glass_cost_statements
union all select 'glass_cost_allocations',count(*) from public.glass_cost_allocations
union all select 'coating_cost_statements',count(*) from public.coating_cost_statements
union all select 'coating_cost_allocations',count(*) from public.coating_cost_allocations
union all select 'project_cost_entries',count(*) from public.project_cost_entries;
