begin;
select to_regclass('public.project_cost_import_batches') as batch_table;
select column_name,is_nullable from information_schema.columns where table_schema='public' and table_name='project_cost_entries' and column_name='import_batch_id';
select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid in ('public.project_cost_import_batches'::regclass,'public.project_cost_entries'::regclass) and (conname like 'project_cost_import%' or conname like '%import_batch%') order by conname;
select policyname,cmd,roles,qual,with_check from pg_policies where schemaname='public' and tablename='project_cost_import_batches';
select has_function_privilege('authenticated','public.import_project_cost_entries(text,jsonb)','EXECUTE') as authenticated_execute,
       has_function_privilege('anon','public.import_project_cost_entries(text,jsonb)','EXECUTE') as anon_execute;
select count(*) as existing_cost_count, count(*) filter(where import_batch_id is null) as legacy_null_batch_count from public.project_cost_entries;
rollback;
