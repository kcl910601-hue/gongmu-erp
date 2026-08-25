alter table public.editing_locks drop constraint if exists editing_locks_resource_type_check;
alter table public.editing_locks add constraint editing_locks_resource_type_check check (resource_type in ('project','task','personal_note','shipment','employee','comment','setting','material_usage_request','material_usage_group'));

create or replace function public.assert_editing_lock_permission(p_resource_type text,p_resource_id text)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_employee_id bigint; v_allowed boolean:=false;
begin
  select id into v_employee_id from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee_id is null then raise exception 'permission denied'; end if;
  case p_resource_type
    when 'project' then v_allowed:=p_resource_id~'^[0-9]+$' and public.can_manage_projects() and exists(select 1 from public.projects where id=p_resource_id::bigint);
    when 'task' then v_allowed:=p_resource_id~'^[0-9]+$' and public.can_edit_tasks() and exists(select 1 from public.tasks where id=p_resource_id::bigint);
    when 'shipment' then v_allowed:=p_resource_id~'^[0-9]+$' and public.can_edit_tasks() and exists(select 1 from public.shipments where id=p_resource_id::bigint);
    when 'employee' then v_allowed:=p_resource_id~'^[0-9]+$' and public.is_approved_admin() and exists(select 1 from public.employees where id=p_resource_id::bigint);
    when 'setting' then v_allowed:=public.can_manage_settings();
    when 'comment' then v_allowed:=p_resource_id~'^[0-9]+$' and exists(select 1 from public.shared_comments where id=p_resource_id::bigint and author_id=v_employee_id);
    when 'personal_note' then v_allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and (exists(select 1 from public.personal_notes where id=p_resource_id::uuid and user_id=auth.uid()) or exists(select 1 from public.shared_items si join public.shared_item_members sim on sim.shared_item_id=si.id where si.item_id=p_resource_id::uuid and sim.employee_id=v_employee_id and sim.permission='edit'));
    when 'material_usage_request' then v_allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin() and exists(select 1 from public.material_usage_requests where id=p_resource_id::uuid and status='active');
    when 'material_usage_group' then v_allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin() and exists(select 1 from public.material_usage_groups where id=p_resource_id::uuid and is_active=true);
    else v_allowed:=false;
  end case;
  if not v_allowed then raise exception 'resource not editable'; end if;
  return v_employee_id;
end; $$;
