select column_name, data_type, udt_name
from information_schema.columns
where table_schema = 'public' and table_name = 'activity_logs' and column_name = 'source_item_id';

select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'activity_logs' and indexname = 'activity_logs_source_item_created_at_idx';

select policyname, cmd, roles, qual from pg_policies
where schemaname = 'public' and tablename = 'activity_logs' and policyname = 'activity_logs_select_erp_user';

select has_function_privilege('authenticated', 'public.can_view_shared_activity(uuid)', 'execute') as can_view_execute,
       has_function_privilege('authenticated', 'public.record_shared_workspace_activity(uuid,text,text,jsonb)', 'execute') as record_execute;

select count(*) as missing_source_item_id
from public.activity_logs
where activity_type like 'shared_%' and source_item_id is null;
