-- Atomic Project -> Section -> Task creation.
-- SECURITY INVOKER intentionally preserves caller grants and RLS policies.

create or replace function public.create_project_with_sections(
  p_project jsonb,
  p_sections jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_project_id bigint;
  v_section_id bigint;
  v_section jsonb;
  v_first_process_type text;
  v_process_type text;
  v_quantity integer;
  v_project_start date;
  v_project_end date;
  v_section_start date;
  v_section_end date;
begin
  if p_project is null or jsonb_typeof(p_project) <> 'object' then
    raise exception using message = '프로젝트 입력값이 올바르지 않습니다.', errcode = '22023';
  end if;

  if p_sections is null
     or jsonb_typeof(p_sections) <> 'array'
     or jsonb_array_length(p_sections) = 0 then
    raise exception using message = '공정을 최소 1개 선택해야 합니다.', errcode = '22023';
  end if;

  if nullif(btrim(p_project->>'project_code'), '') is null then
    raise exception using message = '프로젝트 코드는 필수입니다.', errcode = '22023';
  end if;

  if nullif(btrim(p_project->>'project_name'), '') is null then
    raise exception using message = '프로젝트명은 필수입니다.', errcode = '22023';
  end if;

  v_project_start := nullif(p_project->>'start_date', '')::date;
  v_project_end := nullif(p_project->>'end_date', '')::date;

  if v_project_start is not null
     and v_project_end is not null
     and v_project_end < v_project_start then
    raise exception using message = '프로젝트 종료일은 시작일보다 빠를 수 없습니다.', errcode = '22023';
  end if;

  if exists (
    select 1
    from public.projects
    where project_code = btrim(p_project->>'project_code')
  ) then
    raise exception using message = '이미 같은 프로젝트 코드가 있습니다.', errcode = '23505';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_sections)
  ) <> (
    select count(distinct btrim(value->>'process_type'))
    from jsonb_array_elements(p_sections)
  ) then
    raise exception using message = '동일한 공정을 중복 선택할 수 없습니다.', errcode = '22023';
  end if;

  select btrim(value->>'process_type')
  into v_first_process_type
  from jsonb_array_elements(p_sections)
  order by
    coalesce(nullif(value->>'sort_order', '')::integer, 0),
    btrim(value->>'process_type')
  limit 1;

  insert into public.projects (
    project_code,
    project_name,
    client_name,
    salesperson,
    site_address,
    assembly_vendor,
    task_manager,
    process_type,
    start_date,
    end_date,
    status,
    memo
  )
  values (
    btrim(p_project->>'project_code'),
    btrim(p_project->>'project_name'),
    nullif(btrim(p_project->>'client_name'), ''),
    nullif(btrim(p_project->>'salesperson'), ''),
    nullif(btrim(p_project->>'site_address'), ''),
    nullif(btrim(p_project->>'assembly_vendor'), ''),
    nullif(btrim(p_project->>'task_manager'), ''),
    v_first_process_type,
    v_project_start,
    v_project_end,
    'in_progress',
    nullif(btrim(p_project->>'memo'), '')
  )
  returning id into v_project_id;

  for v_section in
    select value
    from jsonb_array_elements(p_sections)
    order by
      coalesce(nullif(value->>'sort_order', '')::integer, 0),
      btrim(value->>'process_type')
  loop
    v_process_type := nullif(btrim(v_section->>'process_type'), '');
    v_quantity := nullif(v_section->>'quantity', '')::integer;
    v_section_start := nullif(v_section->>'start_date', '')::date;
    v_section_end := nullif(v_section->>'end_date', '')::date;

    if v_process_type is null then
      raise exception using message = '공정 코드가 비어 있습니다.', errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.process_types
      where code = v_process_type
        and is_active = true
    ) then
      raise exception using message = format('활성 공정을 찾을 수 없습니다: %s', v_process_type), errcode = '22023';
    end if;

    if v_quantity is not null and v_quantity < 0 then
      raise exception using message = format('%s 공정의 수량은 0 이상이어야 합니다.', v_process_type), errcode = '22023';
    end if;

    if v_section_start is not null
       and v_section_end is not null
       and v_section_end < v_section_start then
      raise exception using message = format('%s 공정의 종료일은 시작일보다 빠를 수 없습니다.', v_process_type), errcode = '22023';
    end if;

    insert into public.project_sections (
      project_id,
      process_type,
      assembly_vendor,
      task_manager,
      quantity,
      start_date,
      end_date,
      status,
      memo,
      sort_order
    )
    values (
      v_project_id,
      v_process_type,
      nullif(btrim(v_section->>'assembly_vendor'), ''),
      nullif(btrim(v_section->>'task_manager'), ''),
      v_quantity,
      v_section_start,
      v_section_end,
      'pending',
      nullif(btrim(v_section->>'memo'), ''),
      coalesce(nullif(v_section->>'sort_order', '')::integer, 0)
    )
    returning id into v_section_id;

    insert into public.tasks (
      project_id,
      project_section_id,
      task_order,
      task_type,
      task_name,
      assignee,
      status,
      start_date,
      due_date,
      completed_date
    )
    select
      v_project_id,
      v_section_id,
      template.task_order,
      template.task_type,
      template.task_name,
      nullif(btrim(v_section->>'task_manager'), ''),
      'pending',
      null,
      null,
      null
    from public.task_templates template
    where template.process_type = v_process_type
    order by template.task_order, template.id;
  end loop;

  return v_project_id;
end;
$$;

revoke all on function public.create_project_with_sections(jsonb, jsonb) from public;
revoke all on function public.create_project_with_sections(jsonb, jsonb) from anon;
grant execute on function public.create_project_with_sections(jsonb, jsonb) to authenticated;
