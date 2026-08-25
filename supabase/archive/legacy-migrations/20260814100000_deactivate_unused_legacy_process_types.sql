begin;

do $$
declare
  v_projects_before bigint;
  v_sections_before bigint;
  v_tasks_before bigint;
begin
  select count(*) into v_projects_before from public.projects;
  select count(*) into v_sections_before from public.project_sections;
  select count(*) into v_tasks_before from public.tasks;

  if exists (
    select 1 from public.project_sections where process_type in ('DOOR', 'FRAME')
  ) or exists (
    select 1 from public.task_templates where process_type in ('DOOR', 'FRAME')
  ) then
    raise exception 'Legacy process master cleanup stopped: DOOR or FRAME is still referenced.';
  end if;

  if not exists (select 1 from public.process_types where code = '본납-도어' and is_active)
    or not exists (select 1 from public.process_types where code = '본납-문틀' and is_active) then
    raise exception 'Canonical process master is missing or inactive.';
  end if;

  update public.process_types
  set is_active = false,
      updated_at = now()
  where code in ('DOOR', 'FRAME')
    and is_active = true;

  if (select count(*) from public.projects) <> v_projects_before
    or (select count(*) from public.project_sections) <> v_sections_before
    or (select count(*) from public.tasks) <> v_tasks_before then
    raise exception 'Process master cleanup changed protected row counts.';
  end if;
end
$$;

notify pgrst, 'reload schema';
commit;

-- Rollback (manual review only):
-- update public.process_types set is_active = true, updated_at = now() where code in ('DOOR', 'FRAME');
