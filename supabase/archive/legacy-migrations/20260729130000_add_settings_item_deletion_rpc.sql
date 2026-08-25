-- Sprint 5-10: atomically inspect and delete/deactivate settings master rows.
-- Direct table DELETE remains unavailable; only approved admins may execute this RPC.

begin;

create or replace function public.manage_settings_item(
  p_entity text,
  p_target_id bigint,
  p_execute boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.employees%rowtype;
  v_employee public.employees%rowtype;
  v_partner public.organizations%rowtype;
  v_template public.task_templates%rowtype;
  v_partner_category_id bigint;
  v_reference_count integer := 0;
  v_action text;
  v_name text;
begin
  if not public.is_approved_admin() then
    raise exception using message = '관리자 권한이 필요합니다.', errcode = '42501';
  end if;

  select * into v_actor
  from public.employees
  where auth_user_id = auth.uid()
    and active is true
    and approval_status = 'approved'
    and role = 'admin'
  limit 1;

  if p_entity = 'task_template' then
    select * into v_template
    from public.task_templates
    where id = p_target_id
    for update;

    if not found then
      return jsonb_build_object('success', false, 'action', 'blocked', 'message', '업무 템플릿을 찾을 수 없습니다.', 'referenceCount', 0);
    end if;

    v_action := 'deleted';
    v_name := v_template.task_name;

    if p_execute then
      delete from public.task_templates where id = p_target_id;
      insert into public.activity_logs (
        activity_type, action_type, target_type, target_id,
        employee_id, employee_name, employee_email,
        title, description, metadata
      ) values (
        'task_delete', 'task_delete', 'task_template', p_target_id,
        v_actor.id, v_actor.name, v_actor.email,
        '업무 템플릿 삭제',
        format('%s 템플릿을 삭제했습니다.', v_name),
        jsonb_build_object(
          'templateName', v_name,
          'processType', v_template.process_type,
          'taskType', v_template.task_type,
          'taskOrder', v_template.task_order,
          'deletedAt', now()
        )
      );
    end if;

  elsif p_entity = 'employee' then
    select * into v_employee
    from public.employees
    where id = p_target_id
    for update;

    if not found then
      return jsonb_build_object('success', false, 'action', 'blocked', 'message', '직원을 찾을 수 없습니다.', 'referenceCount', 0);
    end if;

    if v_employee.auth_user_id = auth.uid() then
      return jsonb_build_object('success', false, 'action', 'blocked', 'message', '현재 로그인한 관리자 계정은 삭제하거나 비활성화할 수 없습니다.', 'referenceCount', 1);
    end if;

    select
      (select count(*) from public.projects where salesperson = v_employee.name or task_manager = v_employee.name)
      + (select count(*) from public.project_sections where task_manager = v_employee.name)
      + (select count(*) from public.tasks where assignee = v_employee.name)
      + (select count(*) from public.shipments where driver_name = v_employee.name)
      + (select count(*) from public.activity_logs where employee_id = v_employee.id or employee_name = v_employee.name or (v_employee.email is not null and employee_email = v_employee.email))
      + (select count(*) from public.project_files where uploaded_by = v_employee.name or (v_employee.email is not null and uploaded_by_email = v_employee.email))
      + case when v_employee.auth_user_id is null then 0 else 1 end
    into v_reference_count;

    v_action := case when v_reference_count > 0 then 'deactivated' else 'deleted' end;
    v_name := v_employee.name;

    if p_execute then
      if v_action = 'deactivated' then
        update public.employees
        set active = false
        where id = p_target_id;
      else
        delete from public.employees where id = p_target_id;
      end if;

      insert into public.activity_logs (
        activity_type, action_type, target_type, target_id,
        employee_id, employee_name, employee_email,
        title, description, metadata
      ) values (
        case when v_action = 'deleted' then 'employee_update' else 'employee_deactivate' end,
        case when v_action = 'deleted' then 'employee_update' else 'employee_deactivate' end,
        'employee', p_target_id,
        v_actor.id, v_actor.name, v_actor.email,
        case when v_action = 'deleted' then '직원 삭제' else '직원 비활성화' end,
        case when v_action = 'deleted'
          then format('%s 직원을 삭제했습니다.', v_name)
          else format('%s 직원은 기존 업무 또는 기록에 사용 중이어서 비활성화했습니다.', v_name)
        end,
        jsonb_build_object('employeeName', v_name, 'action', v_action, 'referenceCount', v_reference_count, 'processedAt', now())
      );
    end if;

  elsif p_entity = 'partner' then
    select id into v_partner_category_id
    from public.organization_categories
    where code = 'partner';

    select * into v_partner
    from public.organizations
    where id = p_target_id
      and category_id = v_partner_category_id
    for update;

    if not found then
      return jsonb_build_object('success', false, 'action', 'blocked', 'message', '협력업체를 찾을 수 없습니다.', 'referenceCount', 0);
    end if;

    select
      (select count(*) from public.project_assembly_vendors where organization_id = v_partner.id)
      + (select count(*) from public.projects where assembly_vendor_organization_id = v_partner.id or lower(btrim(assembly_vendor)) = lower(btrim(v_partner.name)))
      + (select count(*) from public.project_sections where lower(btrim(assembly_vendor)) = lower(btrim(v_partner.name)))
      + (select count(*) from public.employees where organization_id = v_partner.id)
    into v_reference_count;

    v_action := case when v_reference_count > 0 then 'deactivated' else 'deleted' end;
    v_name := v_partner.name;

    if p_execute then
      if v_action = 'deactivated' then
        update public.organizations
        set is_active = false, updated_at = now()
        where id = p_target_id;
      else
        delete from public.organizations where id = p_target_id;
      end if;

      insert into public.activity_logs (
        activity_type, action_type, target_type, target_id,
        employee_id, employee_name, employee_email,
        title, description, metadata
      ) values (
        'project_update', 'project_update', 'partner_organization', p_target_id,
        v_actor.id, v_actor.name, v_actor.email,
        case when v_action = 'deleted' then '협력업체 삭제' else '협력업체 비활성화' end,
        case when v_action = 'deleted'
          then format('%s 협력업체를 삭제했습니다.', v_name)
          else format('%s 협력업체는 기존 프로젝트 또는 기록에 사용 중이어서 비활성화했습니다.', v_name)
        end,
        jsonb_build_object('partnerName', v_name, 'action', v_action, 'referenceCount', v_reference_count, 'processedAt', now())
      );
    end if;

  else
    raise exception using message = '지원하지 않는 설정 항목입니다.', errcode = '22023';
  end if;

  return jsonb_build_object(
    'success', true,
    'action', v_action,
    'message', case
      when v_action = 'deleted' then format('%s 항목이 삭제됩니다.', v_name)
      else format('%s 항목이 기존 기록에 사용 중이어서 비활성화됩니다.', v_name)
    end,
    'referenceCount', v_reference_count
  );
exception
  when foreign_key_violation then
    return jsonb_build_object('success', false, 'action', 'blocked', 'message', '연결된 데이터가 있어 완전 삭제할 수 없습니다.', 'referenceCount', greatest(v_reference_count, 1));
end;
$$;

revoke all on function public.manage_settings_item(text, bigint, boolean) from public, anon;
grant execute on function public.manage_settings_item(text, bigint, boolean) to authenticated;

commit;
