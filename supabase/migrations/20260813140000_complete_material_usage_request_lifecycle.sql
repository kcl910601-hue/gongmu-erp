create or replace function public.update_material_usage_request(
  p_usage_request_id uuid, p_quantity_tons numeric, p_purchase_order_no text,
  p_usage_date date, p_memo text
) returns public.material_usage_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_employee public.employees%rowtype;
  v_request public.material_usage_requests%rowtype;
  v_allocated numeric(16,4);
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role <> 'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into v_request from public.material_usage_requests where id=p_usage_request_id and status='active' for update;
  if not found then raise exception '활성 사용요청을 찾을 수 없습니다.' using errcode='P0002'; end if;
  if p_quantity_tons is null or p_quantity_tons<=0 or p_quantity_tons<>round(p_quantity_tons,4) or p_usage_date is null then raise exception '사용요청 입력값을 확인해주세요.' using errcode='22023'; end if;
  if char_length(coalesce(nullif(btrim(p_purchase_order_no),''),''))>100 or char_length(coalesce(nullif(btrim(p_memo),''),''))>2000 then raise exception '발주번호 또는 메모 길이를 확인해주세요.' using errcode='22023'; end if;
  select coalesce(sum(quantity_tons) filter(where status in ('planned','confirmed')),0) into v_allocated
  from public.material_contract_allocations where usage_request_id=v_request.id;
  if p_quantity_tons+0.00005 < v_allocated then raise exception '현재 %.3ft가 계약에 배정되어 있어 요청량을 그보다 작게 줄일 수 없습니다.',v_allocated using errcode='23514'; end if;
  update public.material_usage_requests set quantity_tons=p_quantity_tons,
    purchase_order_no=nullif(btrim(p_purchase_order_no),''), usage_date=p_usage_date,
    memo=nullif(btrim(p_memo),''), updated_by=auth.uid(), updated_at=now()
  where id=v_request.id returning * into v_request;
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
  values('material_usage_request_updated','material_usage_request_updated','material_usage_request',v_employee.id,v_employee.name,v_employee.email,'원자재 사용요청 수정',to_char(p_quantity_tons,'FM999999999990.0000')||'t',jsonb_build_object('usage_request_id',v_request.id,'after_quantity_tons',p_quantity_tons,'allocated_tons',v_allocated,'purchase_order_no',v_request.purchase_order_no,'usage_date',v_request.usage_date));
  return v_request;
end; $$;

create or replace function public.cancel_material_usage_request(p_usage_request_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_employee public.employees%rowtype; v_request public.material_usage_requests%rowtype;
  v_allocation record; v_confirmed numeric(16,4); v_cancelled integer:=0;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role <> 'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into v_request from public.material_usage_requests where id=p_usage_request_id and status='active' for update;
  if not found then raise exception '활성 사용요청을 찾을 수 없습니다.' using errcode='P0002'; end if;
  select coalesce(sum(quantity_tons) filter(where status='confirmed'),0) into v_confirmed from public.material_contract_allocations where usage_request_id=v_request.id;
  if v_confirmed>0 and nullif(btrim(p_reason),'') is null then raise exception '확정 배정이 포함된 요청은 취소 사유가 필요합니다.' using errcode='22023'; end if;
  for v_allocation in update public.material_contract_allocations set status='cancelled',updated_at=now()
    where usage_request_id=v_request.id and status in ('planned','confirmed') returning *
  loop
    v_cancelled:=v_cancelled+1;
    perform public.record_material_allocation_activity(v_allocation.contract_id,v_allocation.id,'material_allocation_cancelled','사용요청 취소에 따른 배정 취소',v_allocation.status,'cancelled',null,jsonb_build_object('usage_request_id',v_request.id,'reason',nullif(btrim(p_reason),'')),to_char(v_allocation.quantity_tons,'FM999999999990.0000')||'t',null);
  end loop;
  update public.material_usage_requests set status='cancelled',updated_by=auth.uid(),updated_at=now() where id=v_request.id;
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
  values('material_usage_request_cancelled','material_usage_request_cancelled','material_usage_request',v_employee.id,v_employee.name,v_employee.email,'원자재 사용요청 취소',nullif(btrim(p_reason),''),jsonb_build_object('usage_request_id',v_request.id,'cancelled_allocations',v_cancelled,'confirmed_tons',v_confirmed,'reason',nullif(btrim(p_reason),'')));
  return jsonb_build_object('cancelled',true,'cancelled_allocations',v_cancelled,'confirmed_tons',v_confirmed);
end; $$;

create or replace function public.get_material_usage_request_history(p_usage_request_id uuid)
returns table(created_at timestamptz, activity_type text, title text, description text, employee_name text, metadata jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select log.created_at,log.activity_type,log.title,log.description,log.employee_name,log.metadata
  from public.activity_logs log
  where public.is_approved_erp_user() and log.metadata->>'usage_request_id'=p_usage_request_id::text
  order by log.created_at desc,log.id desc
$$;

create or replace function public.log_material_usage_request_created()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_employee public.employees%rowtype;
begin
  select * into v_employee from public.employees where auth_user_id=new.created_by;
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
  values('material_usage_request_created','material_usage_request_created','material_usage_request',v_employee.id,v_employee.name,v_employee.email,'원자재 사용요청 생성',to_char(new.quantity_tons,'FM999999999990.0000')||'t',jsonb_build_object('usage_request_id',new.id,'quantity_tons',new.quantity_tons,'usage_date',new.usage_date));
  return new;
end; $$;
drop trigger if exists log_material_usage_request_created on public.material_usage_requests;
create trigger log_material_usage_request_created after insert on public.material_usage_requests for each row execute function public.log_material_usage_request_created();

revoke all on function public.update_material_usage_request(uuid,numeric,text,date,text), public.cancel_material_usage_request(uuid,text), public.get_material_usage_request_history(uuid) from public,anon;
grant execute on function public.update_material_usage_request(uuid,numeric,text,date,text), public.cancel_material_usage_request(uuid,text), public.get_material_usage_request_history(uuid) to authenticated;
notify pgrst,'reload schema';
alter table public.editing_locks drop constraint if exists editing_locks_resource_type_check;
alter table public.editing_locks add constraint editing_locks_resource_type_check check (resource_type in ('project','task','personal_note','shipment','employee','comment','setting','material_usage_request'));

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
    else v_allowed:=false;
  end case;
  if not v_allowed then raise exception 'resource not editable'; end if;
  return v_employee_id;
end; $$;
