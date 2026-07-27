-- Employee master RLS aligned with the ERP role model.
-- Public sign-up policies remain separate from administrator CRUD policies.
begin;

alter table public.employees enable row level security;

create or replace function public.is_approved_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employees
    where auth_user_id = auth.uid()
      and role = 'admin'
      and active is true
      and approval_status = 'approved'
  );
$$;

revoke all on function public.is_approved_admin() from public;
grant execute on function public.is_approved_admin() to authenticated;

-- Remove superseded or potentially overlapping employee-master policies.
drop policy if exists "approved admins select signup requests" on public.employees;
drop policy if exists "approved admins update signup requests" on public.employees;
drop policy if exists "authenticated users select active approved employee master" on public.employees;
drop policy if exists employees_select_active_approved on public.employees;
drop policy if exists employees_select_approved_admin on public.employees;
drop policy if exists employees_insert_approved_admin on public.employees;
drop policy if exists employees_update_approved_admin on public.employees;

-- Active, approved ERP users may read active, approved employee master rows.
create policy employees_select_active_approved
  on public.employees
  for select
  to authenticated
  using (
    active is true
    and approval_status = 'approved'
  );

-- Admins must also see pending, rejected, and inactive rows in Employee Management.
create policy employees_select_approved_admin
  on public.employees
  for select
  to authenticated
  using (public.is_approved_admin());

-- Only an active, approved admin can create employee-master rows.
-- The existing "signup employees insert own pending row" policy is intentionally retained.
create policy employees_insert_approved_admin
  on public.employees
  for insert
  to authenticated
  with check (public.is_approved_admin());

-- Only an active, approved admin can update employees.
create policy employees_update_approved_admin
  on public.employees
  for update
  to authenticated
  using (public.is_approved_admin())
  with check (public.is_approved_admin());

grant select, insert, update on table public.employees to authenticated;
revoke delete on table public.employees from authenticated;
revoke all on table public.employees from anon;

commit;

-- Live verification query (run in Supabase SQL editor after applying):
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'employees'
-- order by policyname;
