-- Reconnect a removed assembly vendor and its unassigned task atomically.
-- Prepared only; apply separately to the database.
create or replace function public.restore_unassigned_task_vendor(
  p_project_id bigint,
  p_task_id bigint,
  p_organization_id bigint
) returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_relation_id bigint;
begin
  if not public.can_manage_projects() or public.is_calendar_only_staff() then
    raise exception using message = '프로젝트 수정 권한이 없습니다.', errcode = '42501';
  end if;
  perform public.assert_valid_assembly_vendor_ids(array[p_organization_id]);

  -- Use the same project-first lock order as project vendor editing.
  perform 1 from public.projects where id = p_project_id for update;
  if not found then
    raise exception using message = '프로젝트를 찾을 수 없습니다.', errcode = 'P0002';
  end if;
  perform 1 from public.tasks
  where id = p_task_id and project_id = p_project_id
    and project_assembly_vendor_id is null
  for update;
  if not found then
    raise exception using message = '미지정 업무가 아닙니다. 새로고침 후 다시 확인해주세요.', errcode = '23514';
  end if;

  select id into v_relation_id from public.project_assembly_vendors
  where project_id = p_project_id and organization_id = p_organization_id;
  if v_relation_id is null then
    insert into public.project_assembly_vendors (project_id, organization_id, sort_order, is_primary)
    select p_project_id, p_organization_id, coalesce(max(sort_order), 0) + 1, count(*) = 0
    from public.project_assembly_vendors where project_id = p_project_id
    returning id into v_relation_id;
  end if;

  update public.tasks set project_assembly_vendor_id = v_relation_id
  where id = p_task_id and project_id = p_project_id;
  return v_relation_id;
end;
$$;

revoke all on function public.restore_unassigned_task_vendor(bigint, bigint, bigint) from public, anon;
grant execute on function public.restore_unassigned_task_vendor(bigint, bigint, bigint) to authenticated, service_role;

notify pgrst, 'reload schema';
