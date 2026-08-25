-- Block hierarchical deletes while the target or a related child record is actively edited.

create or replace function public.get_hierarchical_delete_locks(p_resource_type text, p_resource_id bigint)
returns table(resource_type text, resource_id text, resource_title text, employee_id bigint, employee_name text, expires_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  if p_resource_type = 'project' then
    if not public.is_approved_admin() then raise exception using message = 'permission denied', errcode = '42501'; end if;
    return query
      select l.resource_type, l.resource_id,
        case l.resource_type
          when 'project' then coalesce(p.project_name, '프로젝트 #' || l.resource_id)
          when 'task' then coalesce(t.task_name, '업무 #' || l.resource_id)
          when 'shipment' then concat('출고 #', l.resource_id, coalesce(' · ' || s.item_name, ''))
          else l.resource_type || ':' || l.resource_id
        end,
        l.employee_id, e.name, l.expires_at
      from public.editing_locks l
      join public.employees e on e.id = l.employee_id
      left join public.projects p on l.resource_type = 'project' and l.resource_id ~ '^[0-9]+$' and p.id = l.resource_id::bigint
      left join public.tasks t on l.resource_type = 'task' and l.resource_id ~ '^[0-9]+$' and t.id = l.resource_id::bigint
      left join public.shipments s on l.resource_type = 'shipment' and l.resource_id ~ '^[0-9]+$' and s.id = l.resource_id::bigint
      where l.expires_at > now() and (
        (l.resource_type = 'project' and l.resource_id = p_resource_id::text)
        or (l.resource_type = 'task' and l.resource_id ~ '^[0-9]+$' and exists (select 1 from public.tasks child where child.id = l.resource_id::bigint and child.project_id = p_resource_id))
        or (l.resource_type = 'shipment' and l.resource_id ~ '^[0-9]+$' and exists (
          select 1 from public.shipments child where child.id = l.resource_id::bigint and (
            child.project_id = p_resource_id or child.task_id in (select id from public.tasks where project_id = p_resource_id)
          )
        ))
      ) order by l.expires_at desc, l.resource_type, l.resource_id;
  elsif p_resource_type = 'task' then
    if not public.can_manage_projects() then raise exception using message = 'permission denied', errcode = '42501'; end if;
    return query
      select l.resource_type, l.resource_id,
        case l.resource_type when 'task' then coalesce(t.task_name, '업무 #' || l.resource_id)
          when 'shipment' then concat('출고 #', l.resource_id, coalesce(' · ' || s.item_name, ''))
          else l.resource_type || ':' || l.resource_id end,
        l.employee_id, e.name, l.expires_at
      from public.editing_locks l
      join public.employees e on e.id = l.employee_id
      left join public.tasks t on l.resource_type = 'task' and l.resource_id ~ '^[0-9]+$' and t.id = l.resource_id::bigint
      left join public.shipments s on l.resource_type = 'shipment' and l.resource_id ~ '^[0-9]+$' and s.id = l.resource_id::bigint
      where l.expires_at > now() and (
        (l.resource_type = 'task' and l.resource_id = p_resource_id::text)
        or (l.resource_type = 'shipment' and l.resource_id ~ '^[0-9]+$' and exists (select 1 from public.shipments child where child.id = l.resource_id::bigint and child.task_id = p_resource_id))
      ) order by l.expires_at desc, l.resource_type, l.resource_id;
  else
    raise exception using message = 'unsupported delete resource', errcode = '22023';
  end if;
end;
$$;

create or replace function public.delete_project_with_lock_check(p_project_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_locks jsonb; v_lock_count integer; v_project public.projects%rowtype;
begin
  if not public.is_approved_admin() then raise exception using message = 'permission denied', errcode = '42501'; end if;
  lock table public.editing_locks in share row exclusive mode;
  delete from public.editing_locks where expires_at <= now();
  select count(*) into v_lock_count from public.get_hierarchical_delete_locks('project', p_project_id);
  if v_lock_count > 0 then
    select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb) into v_locks from (select * from public.get_hierarchical_delete_locks('project', p_project_id) limit 5) item;
    return jsonb_build_object('deleted', false, 'lock_count', v_lock_count, 'locks', v_locks);
  end if;
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then raise exception using message = 'project not found', errcode = 'P0002'; end if;
  delete from public.shipments where project_id = p_project_id or task_id in (select id from public.tasks where project_id = p_project_id);
  delete from public.tasks where project_id = p_project_id;
  delete from public.project_sections where project_id = p_project_id;
  delete from public.projects where id = p_project_id;
  return jsonb_build_object('deleted', true, 'project_id', p_project_id, 'lock_count', 0, 'locks', '[]'::jsonb);
end;
$$;

create or replace function public.delete_project_task(p_task_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_task public.tasks%rowtype; v_project_status text; v_unlinked_shipments integer := 0; v_lock_count integer; v_locks jsonb;
begin
  if not public.can_manage_projects() then raise exception using message = 'permission denied', errcode = '42501'; end if;
  lock table public.editing_locks in share row exclusive mode;
  delete from public.editing_locks where expires_at <= now();
  select count(*) into v_lock_count from public.get_hierarchical_delete_locks('task', p_task_id);
  if v_lock_count > 0 then
    select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb) into v_locks from (select * from public.get_hierarchical_delete_locks('task', p_task_id) limit 5) item;
    return jsonb_build_object('deleted', false, 'lock_count', v_lock_count, 'locks', v_locks);
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then raise exception using message = 'task not found', errcode = 'P0002'; end if;
  update public.shipments set task_id = null where task_id = p_task_id;
  get diagnostics v_unlinked_shipments = row_count;
  delete from public.tasks where id = p_task_id;
  with ordered as (
    select id, row_number() over (partition by project_section_id order by task_order nulls last, id)::integer next_order
    from public.tasks where project_id = v_task.project_id
  ) update public.tasks task set task_order = ordered.next_order from ordered where task.id = ordered.id and task.task_order is distinct from ordered.next_order;
  select case when count(*) = 0 then 'pending' when bool_and(coalesce(status, 'pending') in ('completed', '완료')) then 'completed'
    when bool_or(coalesce(status, 'pending') in ('in_progress', '진행중', 'completed', '완료')) then 'in_progress' else 'pending' end
    into v_project_status from public.tasks where project_id = v_task.project_id;
  update public.projects set status = v_project_status, updated_at = now() where id = v_task.project_id;
  return jsonb_build_object('deleted', true, 'deleted_task_id', v_task.id, 'project_id', v_task.project_id, 'project_status', v_project_status, 'unlinked_shipment_count', v_unlinked_shipments, 'lock_count', 0, 'locks', '[]'::jsonb);
end;
$$;

revoke all on function public.get_hierarchical_delete_locks(text,bigint), public.delete_project_with_lock_check(bigint) from public, anon;
grant execute on function public.get_hierarchical_delete_locks(text,bigint), public.delete_project_with_lock_check(bigint) to authenticated;
