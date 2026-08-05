select column_name, data_type, is_nullable
from information_schema.columns where table_schema = 'public' and table_name = 'editing_locks'
order by ordinal_position;

select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'editing_locks';

select routine_name, security_type from information_schema.routines
where routine_schema = 'public' and routine_name in ('assert_editing_lock_permission','acquire_editing_lock','heartbeat_editing_lock','release_editing_lock','get_editing_lock_status')
order by routine_name;

select has_table_privilege('authenticated', 'public.editing_locks', 'select,insert,update,delete') as authenticated_has_direct_table_access;
