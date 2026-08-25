-- Calendar-only staff are employees assigned to organization '기타' with position '스태프'.
-- Keep SELECT policies unchanged and add a restrictive mutation boundary to every existing RLS table.

create or replace function public.is_calendar_only_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.employees employee
    join public.organizations organization on organization.id = employee.organization_id
    where employee.auth_user_id = auth.uid()
      and employee.active = true
      and employee.approval_status = 'approved'
      and lower(btrim(coalesce(employee.role, ''))) = 'staff'
      and lower(btrim(coalesce(employee.position, ''))) = lower('스태프')
      and lower(btrim(organization.name)) = lower('기타')
  );
$$;

revoke all on function public.is_calendar_only_staff() from public, anon;
grant execute on function public.is_calendar_only_staff() to authenticated;

do $$
declare
  target record;
begin
  for target in
    select cls.relname
    from pg_class cls
    join pg_namespace namespace on namespace.oid = cls.relnamespace
    where namespace.nspname = 'public'
      and cls.relkind in ('r', 'p')
      and cls.relrowsecurity
  loop
    execute format('drop policy if exists calendar_only_staff_block_insert on public.%I', target.relname);
    execute format('drop policy if exists calendar_only_staff_block_update on public.%I', target.relname);
    execute format('drop policy if exists calendar_only_staff_block_delete on public.%I', target.relname);
    execute format('create policy calendar_only_staff_block_insert on public.%I as restrictive for insert to authenticated with check (not public.is_calendar_only_staff())', target.relname);
    execute format('create policy calendar_only_staff_block_update on public.%I as restrictive for update to authenticated using (not public.is_calendar_only_staff()) with check (not public.is_calendar_only_staff())', target.relname);
    execute format('create policy calendar_only_staff_block_delete on public.%I as restrictive for delete to authenticated using (not public.is_calendar_only_staff())', target.relname);
  end loop;
end;
$$;

comment on function public.is_calendar_only_staff() is
  'Approved active staff assigned to organization 기타 with position 스태프; Calendar read/export only.';
