do $$
declare
  v_table text;
  v_trigger text;
begin
  if to_regprocedure('public.is_current_process_type_code_valid(text,boolean)') is null then
    raise exception 'current process type validation function is missing';
  end if;

  if to_regprocedure('public.enforce_current_process_type_integrity()') is null then
    raise exception 'current process type trigger function is missing';
  end if;

  for v_table, v_trigger in
    values
      ('projects', 'projects_enforce_current_process_type_integrity'),
      ('project_sections', 'project_sections_enforce_current_process_type_integrity'),
      ('task_templates', 'task_templates_enforce_current_process_type_integrity')
  loop
    if not exists (
      select 1
      from pg_trigger
      where tgrelid = format('public.%I', v_table)::regclass
        and tgname = v_trigger
        and not tgisinternal
        and tgenabled <> 'D'
        and pg_get_triggerdef(oid) like '%BEFORE INSERT OR UPDATE OF process_type%'
        and pg_get_triggerdef(oid) like '%enforce_current_process_type_integrity()%'
    ) then
      raise exception 'current process type trigger is missing or invalid: %', v_trigger;
    end if;
  end loop;

  if not public.is_current_process_type_code_valid('AS', false)
    or not public.is_current_process_type_code_valid('MH', false)
    or not public.is_current_process_type_code_valid('SH', false)
    or not public.is_current_process_type_code_valid('본납-문틀', false)
    or not public.is_current_process_type_code_valid('본납-도어', false) then
    raise exception 'an expected active canonical process code is rejected';
  end if;

  if public.is_current_process_type_code_valid('UNKNOWN_PROCESS', false)
    or public.is_current_process_type_code_valid('DOOR', false)
    or public.is_current_process_type_code_valid('FRAME', false)
    or public.is_current_process_type_code_valid(' SH ', false)
    or public.is_current_process_type_code_valid('sh', false) then
    raise exception 'a noncanonical or inactive process code is accepted';
  end if;

  if not public.is_current_process_type_code_valid('', true)
    or public.is_current_process_type_code_valid('', false)
    or public.is_current_process_type_code_valid(null, true)
    or public.is_current_process_type_code_valid(null, false) then
    raise exception 'empty or NULL process type policy is invalid';
  end if;

  if exists (
    select 1
    from public.projects
    where not public.is_current_process_type_code_valid(process_type, true)
  ) then
    raise exception 'an existing projects.process_type violates the new policy';
  end if;

  if exists (
    select 1
    from public.project_sections
    where not public.is_current_process_type_code_valid(process_type, false)
  ) then
    raise exception 'an existing project_sections.process_type violates the new policy';
  end if;

  if exists (
    select 1
    from public.task_templates
    where not public.is_current_process_type_code_valid(process_type, false)
  ) then
    raise exception 'an existing task_templates.process_type violates the new policy';
  end if;

  if exists (
    select 1
    from public.process_types
    where code in ('AS', 'MH', 'SH', '본납-문틀', '본납-도어')
      and not is_active
  ) or (
    select count(*)
    from public.process_types
    where code in ('AS', 'MH', 'SH', '본납-문틀', '본납-도어')
      and is_active
  ) <> 5 then
    raise exception 'expected active Process Master rows changed';
  end if;

  if exists (
    select 1
    from public.process_types
    where code in ('DOOR', 'FRAME')
      and is_active
  ) or (
    select count(*)
    from public.process_types
    where code in ('DOOR', 'FRAME')
      and not is_active
  ) <> 2 then
    raise exception 'expected inactive Process Master rows changed';
  end if;
end
$$;
