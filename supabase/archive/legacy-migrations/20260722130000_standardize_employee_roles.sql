-- Normalize legacy roles to the extensible ERP role set.
update public.employees
set role = 'staff'
where role in ('user', 'member', 'sales') or role is null;

alter table public.employees
  drop constraint if exists employees_role_check;

alter table public.employees
  add constraint employees_role_check
  check (role in ('admin', 'manager', 'staff', 'viewer'));

drop policy if exists "approved admins update signup requests" on public.employees;
create policy "approved admins update signup requests"
  on public.employees
  for update
  to authenticated
  using (public.is_approved_admin())
  with check (
    approval_status = 'rejected'
    or (
      approval_status = 'approved'
      and role in ('admin', 'manager', 'staff', 'viewer')
    )
  );
