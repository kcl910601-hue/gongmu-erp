-- Project entry forms need approved employee names and departments.
-- RLS remains enabled; pending, rejected and inactive rows stay hidden.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'employees'
      and policyname = 'authenticated users select active approved employee master'
  ) then
    create policy "authenticated users select active approved employee master"
      on public.employees
      for select
      to authenticated
      using (
        active is true
        and approval_status = 'approved'
      );
  end if;
end
$$;
