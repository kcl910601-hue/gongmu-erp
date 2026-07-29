-- Run in the Supabase SQL editor after applying 20260730100000_unify_core_rls.sql.

select
  schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = any(array['projects', 'tasks', 'shipments', 'activity_logs'])
order by tablename, cmd, policyname;

select
  table_name,
  has_table_privilege('anon', format('public.%I', table_name), 'SELECT') as anon_select,
  has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') as authenticated_select,
  has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT') as authenticated_insert,
  has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE') as authenticated_update,
  has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') as authenticated_delete
from unnest(array['projects', 'tasks', 'shipments', 'activity_logs']) as tables(table_name)
order by table_name;

select
  captured_for, captured_at, tablename, policyname,
  permissive, roles, cmd, qual, with_check
from public.rls_policy_backups
where captured_for = 'sprint-5-11b'
order by tablename, policyname;

select
  p.proname,
  case when p.prosecdef then 'DEFINER' else 'INVOKER' end as security_mode,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any(array[
    'has_erp_role', 'is_approved_erp_user', 'can_manage_projects',
    'can_edit_tasks', 'can_manage_settings', 'is_approved_admin',
    'delete_project_task'
  ])
order by p.proname;

-- Structural account matrix. This does not mutate business data.
-- Run as the SQL editor/database owner so representative employee rows can be selected.
create or replace function pg_temp.erp_authorization_result(p_auth_user_id uuid)
returns table (
  approved_user boolean,
  manage_projects boolean,
  edit_tasks boolean,
  manage_settings boolean,
  approved_admin boolean
)
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_auth_user_id::text, true);
  return query select
    public.is_approved_erp_user(),
    public.can_manage_projects(),
    public.can_edit_tasks(),
    public.can_manage_settings(),
    public.is_approved_admin();
end;
$$;

select
  employee.role,
  employee.active,
  employee.approval_status,
  result.approved_user,
  result.manage_projects,
  result.edit_tasks,
  result.manage_settings,
  result.approved_admin
from public.employees employee
cross join lateral pg_temp.erp_authorization_result(employee.auth_user_id) result
where employee.auth_user_id is not null
  and (
    (employee.active is true and employee.approval_status = 'approved'
      and employee.role in ('admin', 'manager', 'staff', 'viewer'))
    or employee.active is not true
    or employee.approval_status in ('pending', 'rejected')
  )
order by employee.active desc, employee.approval_status, employee.role;
