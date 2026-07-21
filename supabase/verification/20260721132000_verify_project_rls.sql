-- Run before and after 20260721132000_audit_project_rls_policies.sql.

-- 1. RLS state.
select
  n.nspname as schemaname,
  c.relname as tablename,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = any (array[
    'projects', 'project_sections', 'tasks', 'process_types',
    'task_templates', 'activity_logs', 'shipments', 'employees'
  ])
order by c.relname;

-- 2. Policies, roles and predicates.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = any (array[
    'projects', 'project_sections', 'tasks', 'process_types',
    'task_templates', 'activity_logs', 'shipments', 'employees'
  ])
order by tablename, policyname;

-- 3. Effective table privileges for anon/authenticated.
select
  table_name,
  role_name,
  has_table_privilege(role_name, format('public.%I', table_name), 'SELECT') as can_select,
  has_table_privilege(role_name, format('public.%I', table_name), 'INSERT') as can_insert,
  has_table_privilege(role_name, format('public.%I', table_name), 'UPDATE') as can_update,
  has_table_privilege(role_name, format('public.%I', table_name), 'DELETE') as can_delete
from unnest(array[
  'projects', 'project_sections', 'tasks', 'process_types',
  'task_templates', 'activity_logs', 'shipments', 'employees'
]) as tables(table_name)
cross join unnest(array['anon', 'authenticated']) as roles(role_name)
order by table_name, role_name;

-- 4. RPC owner, security mode, search_path and return type.
select
  n.nspname as schemaname,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_userbyid(p.proowner) as owner,
  case when p.prosecdef then 'DEFINER' else 'INVOKER' end as security_mode,
  p.proconfig as function_settings,
  pg_get_function_result(p.oid) as return_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_project_with_sections', 'create_project_section_with_tasks')
order by p.proname;

-- 5. RPC execute privileges. Expected: anon=false, authenticated=true.
select
  function_signature,
  has_function_privilege('anon', function_signature, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', function_signature, 'EXECUTE') as authenticated_execute
from unnest(array[
  'public.create_project_with_sections(jsonb,jsonb)',
  'public.create_project_section_with_tasks(bigint,text,text,text,integer,date,date,text,bigint)'
]) as functions(function_signature);
