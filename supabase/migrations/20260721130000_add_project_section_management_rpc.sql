-- Atomic section + template task creation for the project detail screen.
-- Existing duplicate rows are never deleted automatically.

do $$
begin
  if exists (
    select 1 from public.project_sections
    group by project_id, process_type having count(*) > 1
  ) then
    raise exception 'Cannot add project/process uniqueness: duplicate project_sections exist.';
  end if;
end
$$;

create unique index if not exists project_sections_project_process_uidx
  on public.project_sections (project_id, process_type);

create or replace function public.create_project_section_with_tasks(
  p_project_id bigint,
  p_process_type text,
  p_assembly_vendor text default null,
  p_task_manager text default null,
  p_quantity integer default null,
  p_start_date date default null,
  p_end_date date default null,
  p_memo text default null,
  p_source_section_id bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_section_id bigint;
  v_task_count integer;
  v_sort_order integer;
begin
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception using message = '프로젝트를 찾을 수 없습니다.', errcode = 'P0002';
  end if;
  if not exists (select 1 from public.process_types where code = btrim(p_process_type) and is_active = true) then
    raise exception using message = '활성 공정을 찾을 수 없습니다.', errcode = '22023';
  end if;
  if exists (select 1 from public.project_sections where project_id = p_project_id and process_type = btrim(p_process_type)) then
    raise exception using message = '이미 존재하는 공정입니다.', errcode = '23505';
  end if;
  if p_source_section_id is not null and not exists (
    select 1 from public.project_sections where id = p_source_section_id and project_id = p_project_id
  ) then
    raise exception using message = '기준 공정을 찾을 수 없습니다.', errcode = '22023';
  end if;
  if p_quantity is not null and p_quantity < 0 then
    raise exception using message = '수량은 0 이상이어야 합니다.', errcode = '22023';
  end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception using message = '종료일은 시작일보다 빠를 수 없습니다.', errcode = '22023';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort_order
  from public.project_sections where project_id = p_project_id;

  insert into public.project_sections (
    project_id, process_type, assembly_vendor, task_manager, quantity,
    start_date, end_date, status, memo, sort_order
  ) values (
    p_project_id, btrim(p_process_type), nullif(btrim(p_assembly_vendor), ''),
    nullif(btrim(p_task_manager), ''), p_quantity, p_start_date, p_end_date,
    'pending', nullif(btrim(p_memo), ''), v_sort_order
  ) returning id into v_section_id;

  insert into public.tasks (
    project_id, project_section_id, task_order, task_type, task_name,
    assignee, status, start_date, due_date, completed_date
  )
  select p_project_id, v_section_id, template.task_order, template.task_type,
    template.task_name, nullif(btrim(p_task_manager), ''), 'pending', null, null, null
  from public.task_templates template
  where template.process_type = btrim(p_process_type)
  order by template.task_order, template.id;

  get diagnostics v_task_count = row_count;
  return jsonb_build_object('section_id', v_section_id, 'task_count', v_task_count);
end;
$$;

revoke all on function public.create_project_section_with_tasks(bigint, text, text, text, integer, date, date, text, bigint) from public, anon;
grant execute on function public.create_project_section_with_tasks(bigint, text, text, text, integer, date, date, text, bigint) to authenticated;
