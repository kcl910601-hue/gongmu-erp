alter table public.projects
  add column if not exists quantity numeric,
  add column if not exists quantity_unit text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_quantity_non_negative'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_quantity_non_negative
      check (quantity is null or quantity >= 0);
  end if;
end;
$$;

create or replace function public.create_project_with_sections_and_vendors(
  p_project jsonb,
  p_sections jsonb,
  p_assembly_vendor_ids bigint[]
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id bigint;
  v_section_id bigint;
  v_section jsonb;
  v_first_process_type text;
  v_process_type text;
begin
  if not public.can_manage_projects() then
    raise exception using message = '프로젝트 등록 권한이 없습니다.', errcode = '42501';
  end if;
  if p_project is null or jsonb_typeof(p_project) <> 'object'
     or nullif(btrim(p_project->>'project_code'), '') is null
     or nullif(btrim(p_project->>'project_name'), '') is null then
    raise exception using message = '프로젝트 필수 입력값이 올바르지 않습니다.', errcode = '22023';
  end if;
  if nullif(p_project->>'quantity', '')::numeric < 0 then
    raise exception using message = '프로젝트 수량은 0 이상이어야 합니다.', errcode = '22023';
  end if;
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then
    raise exception using message = '공정을 최소 1개 선택해야 합니다.', errcode = '22023';
  end if;
  perform public.assert_valid_assembly_vendor_ids(p_assembly_vendor_ids);

  select btrim(value->>'process_type') into v_first_process_type
  from jsonb_array_elements(p_sections)
  order by coalesce(nullif(value->>'sort_order', '')::integer, 0), btrim(value->>'process_type') limit 1;

  insert into public.projects (
    project_code, project_name, client_name, salesperson, site_address,
    task_manager, process_type, start_date, end_date, status, memo,
    assembly_vendor, assembly_vendor_organization_id, quantity, quantity_unit
  ) values (
    btrim(p_project->>'project_code'), btrim(p_project->>'project_name'),
    nullif(btrim(p_project->>'client_name'), ''), nullif(btrim(p_project->>'salesperson'), ''),
    nullif(btrim(p_project->>'site_address'), ''), nullif(btrim(p_project->>'task_manager'), ''),
    v_first_process_type, nullif(p_project->>'start_date', '')::date,
    nullif(p_project->>'end_date', '')::date, 'in_progress', nullif(btrim(p_project->>'memo'), ''),
    null, null, nullif(p_project->>'quantity', '')::numeric, nullif(btrim(p_project->>'quantity_unit'), '')
  ) returning id into v_project_id;

  insert into public.project_assembly_vendors (project_id, organization_id, sort_order, is_primary)
  select v_project_id, vendor.id, vendor.ordinality::integer, vendor.ordinality = 1
  from unnest(coalesce(p_assembly_vendor_ids, array[]::bigint[])) with ordinality vendor(id, ordinality);

  for v_section in
    select value from jsonb_array_elements(p_sections)
    order by coalesce(nullif(value->>'sort_order', '')::integer, 0), btrim(value->>'process_type')
  loop
    v_process_type := nullif(btrim(v_section->>'process_type'), '');
    if v_process_type is null or not exists (
      select 1 from public.process_types where code = v_process_type and is_active is true
    ) then
      raise exception using message = format('활성 공정을 찾을 수 없습니다: %s', coalesce(v_process_type, '')), errcode = '22023';
    end if;

    insert into public.project_sections (
      project_id, process_type, assembly_vendor, task_manager, quantity,
      start_date, end_date, status, memo, sort_order
    ) values (
      v_project_id, v_process_type, nullif(btrim(v_section->>'assembly_vendor'), ''),
      nullif(btrim(v_section->>'task_manager'), ''), nullif(v_section->>'quantity', '')::integer,
      nullif(v_section->>'start_date', '')::date, nullif(v_section->>'end_date', '')::date,
      'pending', nullif(btrim(v_section->>'memo'), ''),
      coalesce(nullif(v_section->>'sort_order', '')::integer, 0)
    ) returning id into v_section_id;

    insert into public.tasks (
      project_id, project_section_id, task_order, task_type, task_name,
      assignee, status, start_date, due_date, completed_date
    )
    select v_project_id, v_section_id, template.task_order, template.task_type,
      template.task_name, nullif(btrim(v_section->>'task_manager'), ''),
      'pending', null, null, null
    from public.task_templates template
    where template.process_type = v_process_type
    order by template.task_order, template.id;
  end loop;

  return v_project_id;
end;
$$;

create or replace function public.update_project_with_vendors(
  p_project_id bigint,
  p_project jsonb,
  p_assembly_vendor_ids bigint[]
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_manage_projects() then
    raise exception using message = '프로젝트 수정 권한이 없습니다.', errcode = '42501';
  end if;
  if nullif(p_project->>'quantity', '')::numeric < 0 then
    raise exception using message = '프로젝트 수량은 0 이상이어야 합니다.', errcode = '22023';
  end if;
  perform public.assert_valid_assembly_vendor_ids(p_assembly_vendor_ids);

  update public.projects set
    project_code = btrim(p_project->>'project_code'),
    project_name = btrim(p_project->>'project_name'),
    client_name = nullif(btrim(p_project->>'client_name'), ''),
    site_address = nullif(btrim(p_project->>'site_address'), ''),
    salesperson = nullif(btrim(p_project->>'salesperson'), ''),
    task_manager = nullif(btrim(p_project->>'task_manager'), ''),
    process_type = btrim(p_project->>'process_type'),
    start_date = nullif(p_project->>'start_date', '')::date,
    end_date = nullif(p_project->>'end_date', '')::date,
    memo = nullif(btrim(p_project->>'memo'), ''),
    quantity = nullif(p_project->>'quantity', '')::numeric,
    quantity_unit = nullif(btrim(p_project->>'quantity_unit'), ''),
    updated_at = now()
  where id = p_project_id;

  if not found then
    raise exception using message = '프로젝트를 찾을 수 없습니다.', errcode = 'P0002';
  end if;

  delete from public.project_assembly_vendors where project_id = p_project_id;
  insert into public.project_assembly_vendors (project_id, organization_id, sort_order, is_primary)
  select p_project_id, vendor.id, vendor.ordinality::integer, vendor.ordinality = 1
  from unnest(coalesce(p_assembly_vendor_ids, array[]::bigint[])) with ordinality vendor(id, ordinality);
  perform public.sync_project_primary_vendor(p_project_id);
  return p_project_id;
end;
$$;

revoke all on function public.create_project_with_sections_and_vendors(jsonb, jsonb, bigint[]) from public, anon;
revoke all on function public.update_project_with_vendors(bigint, jsonb, bigint[]) from public, anon;
grant execute on function public.create_project_with_sections_and_vendors(jsonb, jsonb, bigint[]) to authenticated;
grant execute on function public.update_project_with_vendors(bigint, jsonb, bigint[]) to authenticated;
