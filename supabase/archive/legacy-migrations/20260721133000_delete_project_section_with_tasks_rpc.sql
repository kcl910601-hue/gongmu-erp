-- Atomically delete a project section and its tasks without changing FK rules.

create or replace function public.delete_project_section_with_tasks(
  p_section_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_section public.project_sections%rowtype;
  v_task_count integer;
  v_section_count integer;
  v_project_status text;
  v_employee_id bigint;
  v_employee_name text;
  v_employee_email text;
begin
  select * into v_section
  from public.project_sections
  where id = p_section_id
  for update;

  if not found then
    raise exception using message = '공정을 찾을 수 없습니다.', errcode = 'P0002';
  end if;

  select count(*) into v_section_count
  from public.project_sections
  where project_id = v_section.project_id;

  if v_section_count <= 1 then
    raise exception using message = '프로젝트에는 최소 1개의 공정이 필요합니다.', errcode = '22023';
  end if;

  select count(*) into v_task_count
  from public.tasks
  where project_section_id = p_section_id
    and project_id = v_section.project_id;

  select id, name, email
    into v_employee_id, v_employee_name, v_employee_email
  from public.employees
  where auth_user_id = auth.uid()
     or email = auth.jwt() ->> 'email'
  order by case when auth_user_id = auth.uid() then 0 else 1 end
  limit 1;

  insert into public.activity_logs (
    activity_type,
    action_type,
    target_type,
    target_id,
    project_id,
    employee_id,
    employee_name,
    employee_email,
    title,
    description,
    metadata
  ) values (
    'project_update',
    'project_update',
    'project_section',
    v_section.id,
    v_section.project_id,
    v_employee_id,
    v_employee_name,
    v_employee_email,
    '공정 삭제',
    format('%s 공정과 업무 %s건을 함께 삭제했습니다.', v_section.process_type, v_task_count),
    jsonb_build_object(
      'sectionId', v_section.id,
      'processType', v_section.process_type,
      'deletedTaskCount', v_task_count
    )
  );

  delete from public.tasks
  where project_section_id = p_section_id
    and project_id = v_section.project_id;

  delete from public.project_sections
  where id = p_section_id
    and project_id = v_section.project_id;

  select case
    when count(*) = 0 then 'pending'
    when bool_and(coalesce(status, 'pending') in ('completed', '완료')) then 'completed'
    when bool_or(coalesce(status, 'pending') in ('in_progress', '진행중', 'completed', '완료')) then 'in_progress'
    else 'pending'
  end
  into v_project_status
  from public.tasks
  where project_id = v_section.project_id;

  update public.projects
  set status = v_project_status,
      updated_at = now()
  where id = v_section.project_id;

  return jsonb_build_object(
    'section_id', v_section.id,
    'project_id', v_section.project_id,
    'deleted_task_count', v_task_count,
    'project_status', v_project_status
  );
end;
$$;

revoke all on function public.delete_project_section_with_tasks(bigint) from public;
revoke all on function public.delete_project_section_with_tasks(bigint) from anon;
grant execute on function public.delete_project_section_with_tasks(bigint) to authenticated;
