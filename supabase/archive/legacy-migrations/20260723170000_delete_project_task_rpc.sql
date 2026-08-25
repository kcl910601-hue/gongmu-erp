-- Delete one task atomically, detach nullable shipment references, and recalculate project state.

create or replace function public.delete_project_task(p_task_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.tasks%rowtype;
  v_project_status text;
  v_unlinked_shipments integer := 0;
  v_deleted integer := 0;
begin
  if not public.can_manage_projects() then
    raise exception using message = '업무 삭제 권한이 없습니다.', errcode = '42501';
  end if;

  select * into v_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception using message = '삭제할 업무를 찾을 수 없습니다.', errcode = 'P0002';
  end if;

  update public.shipments
  set task_id = null
  where task_id = p_task_id;
  get diagnostics v_unlinked_shipments = row_count;

  delete from public.tasks
  where id = p_task_id;
  get diagnostics v_deleted = row_count;

  if v_deleted <> 1 then
    raise exception using message = '업무가 삭제되지 않았습니다.', errcode = 'P0001';
  end if;

  with ordered as (
    select id,
      row_number() over (
        partition by project_section_id
        order by task_order nulls last, id
      )::integer as next_order
    from public.tasks
    where project_id = v_task.project_id
  )
  update public.tasks task
  set task_order = ordered.next_order
  from ordered
  where task.id = ordered.id
    and task.task_order is distinct from ordered.next_order;

  select case
    when count(*) = 0 then 'pending'
    when bool_and(coalesce(status, 'pending') in ('completed', '완료')) then 'completed'
    when bool_or(coalesce(status, 'pending') in ('in_progress', '진행중', 'completed', '완료')) then 'in_progress'
    else 'pending'
  end into v_project_status
  from public.tasks
  where project_id = v_task.project_id;

  update public.projects
  set status = v_project_status,
      updated_at = now()
  where id = v_task.project_id;

  return jsonb_build_object(
    'deleted_task_id', v_task.id,
    'project_id', v_task.project_id,
    'project_status', v_project_status,
    'unlinked_shipment_count', v_unlinked_shipments
  );
end;
$$;

revoke all on function public.delete_project_task(bigint) from public, anon;
grant execute on function public.delete_project_task(bigint) to authenticated;

-- Verification after applying:
-- select routine_name from information_schema.routines where routine_schema = 'public' and routine_name = 'delete_project_task';
