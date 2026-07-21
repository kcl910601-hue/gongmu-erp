-- Sprint 5.3.5: minimum project-domain RLS and privilege normalization.
-- Existing policies on legacy business tables are never dropped or broadened.

begin;

-- This ERP requires a signed-in session. Remove direct anonymous table access
-- without changing the existing authenticated/admin policy model.
revoke all on table public.projects from anon;
revoke all on table public.project_sections from anon;
revoke all on table public.tasks from anon;
revoke all on table public.process_types from anon;
revoke all on table public.task_templates from anon;
revoke all on table public.activity_logs from anon;
revoke all on table public.shipments from anon;
revoke all on table public.employees from anon;

-- project_sections RLS was introduced with no policies. Keep it enabled and
-- add only missing authenticated CRUD policies. Equivalent policies with a
-- different name are recognized so manually applied policies are not duplicated.
alter table public.project_sections enable row level security;
grant select, insert, update, delete on table public.project_sections to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_sections'
      and cmd in ('SELECT', 'ALL')
      and 'authenticated'::name = any (roles)
      and coalesce(qual, '') = 'true'
  ) then
    create policy project_sections_select_authenticated
      on public.project_sections for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_sections'
      and cmd in ('INSERT', 'ALL')
      and 'authenticated'::name = any (roles)
      and coalesce(with_check, '') = 'true'
  ) then
    create policy project_sections_insert_authenticated
      on public.project_sections for insert to authenticated with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_sections'
      and cmd in ('UPDATE', 'ALL')
      and 'authenticated'::name = any (roles)
      and coalesce(qual, '') = 'true'
      and coalesce(with_check, '') = 'true'
  ) then
    create policy project_sections_update_authenticated
      on public.project_sections for update to authenticated
      using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_sections'
      and cmd in ('DELETE', 'ALL')
      and 'authenticated'::name = any (roles)
      and coalesce(qual, '') = 'true'
  ) then
    create policy project_sections_delete_authenticated
      on public.project_sections for delete to authenticated using (true);
  end if;
end
$$;

-- Reference tables are read-only for ordinary authenticated users. This does
-- not affect table owners/service_role. Do not enable task_templates RLS when
-- the legacy table currently has it disabled.
grant select on table public.process_types, public.task_templates to authenticated;
revoke insert, update, delete on table public.process_types, public.task_templates from authenticated;

do $$
begin
  if (
    select c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'task_templates'
  ) and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'task_templates'
      and cmd in ('SELECT', 'ALL')
      and 'authenticated'::name = any (roles)
      and coalesce(qual, '') = 'true'
  ) then
    create policy task_templates_select_authenticated
      on public.task_templates for select to authenticated using (true);
  end if;
end
$$;

-- Both creation functions remain SECURITY INVOKER and execute only for signed-in users.
revoke all on function public.create_project_with_sections(jsonb, jsonb) from public;
revoke all on function public.create_project_with_sections(jsonb, jsonb) from anon;
grant execute on function public.create_project_with_sections(jsonb, jsonb) to authenticated;

revoke all on function public.create_project_section_with_tasks(
  bigint, text, text, text, integer, date, date, text, bigint
) from public;
revoke all on function public.create_project_section_with_tasks(
  bigint, text, text, text, integer, date, date, text, bigint
) from anon;
grant execute on function public.create_project_section_with_tasks(
  bigint, text, text, text, integer, date, date, text, bigint
) to authenticated;

-- Legacy policies for projects, tasks, activity_logs, shipments and employees
-- are intentionally preserved. Emit an apply-time warning when RLS is disabled
-- so the live state can be reviewed instead of silently changing authorization.
do $$
declare
  v_table text;
  v_rls boolean;
begin
  foreach v_table in array array['projects', 'tasks', 'activity_logs', 'shipments', 'employees']
  loop
    select c.relrowsecurity into v_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_table;

    if not coalesce(v_rls, false) then
      raise warning 'RLS remains disabled on public.%; review live policies before enabling it.', v_table;
    end if;
  end loop;
end
$$;

commit;
