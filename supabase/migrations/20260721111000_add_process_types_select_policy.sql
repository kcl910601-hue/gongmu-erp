-- The live repository does not contain the projects/tasks RLS definitions.
-- This migration grants only the minimum read access required by authenticated
-- ERP users. No INSERT, UPDATE, or DELETE policy is added.

begin;

alter table public.process_types enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'process_types'
      and policyname = 'process_types_select_authenticated'
  ) then
    create policy process_types_select_authenticated
      on public.process_types
      for select
      to authenticated
      using (true);
  end if;
end
$$;

commit;
