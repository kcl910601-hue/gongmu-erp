-- Allow signed-in ERP users to manage project sections.
-- Anonymous users are intentionally excluded from every policy.

alter table public.project_sections enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_sections'
      and policyname = 'project_sections_select_authenticated'
  ) then
    create policy project_sections_select_authenticated
      on public.project_sections
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_sections'
      and policyname = 'project_sections_insert_authenticated'
  ) then
    create policy project_sections_insert_authenticated
      on public.project_sections
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_sections'
      and policyname = 'project_sections_update_authenticated'
  ) then
    create policy project_sections_update_authenticated
      on public.project_sections
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_sections'
      and policyname = 'project_sections_delete_authenticated'
  ) then
    create policy project_sections_delete_authenticated
      on public.project_sections
      for delete
      to authenticated
      using (true);
  end if;
end
$$;
