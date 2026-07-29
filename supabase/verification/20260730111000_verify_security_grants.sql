-- Run after 20260730110000_harden_core_table_grants.sql.

select
  n.nspname as schemaname,
  c.relname as tablename,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = any(array['projects', 'tasks', 'shipments', 'activity_logs'])
order by c.relname;

select
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = any(array['projects', 'tasks', 'shipments', 'activity_logs'])
  and grantee = 'authenticated'
order by table_name, privilege_type;

select
  table_name,
  has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') as select_grant,
  has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT') as insert_grant,
  has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE') as update_grant,
  has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') as delete_grant,
  has_table_privilege('authenticated', format('public.%I', table_name), 'TRUNCATE') as truncate_grant,
  has_table_privilege('authenticated', format('public.%I', table_name), 'REFERENCES') as references_grant,
  has_table_privilege('authenticated', format('public.%I', table_name), 'TRIGGER') as trigger_grant
from unnest(array['projects', 'tasks', 'shipments', 'activity_logs']) as tables(table_name)
order by table_name;

select
  schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = any(array['projects', 'tasks', 'shipments', 'activity_logs'])
order by tablename, cmd, policyname;
