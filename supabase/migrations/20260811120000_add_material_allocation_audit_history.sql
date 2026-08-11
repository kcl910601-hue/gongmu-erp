begin;

create index if not exists activity_logs_material_allocation_created_idx
  on public.activity_logs ((metadata ->> 'allocation_id'), created_at desc)
  where target_type = 'material_contract_allocation';

create or replace function public.guard_material_allocation_activity_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.target_type = 'material_contract_allocation'
     and coalesce(current_setting('app.material_allocation_audit_write', true), '') <> 'on' then
    raise exception '원자재 배정 Audit은 저장 RPC에서만 생성할 수 있습니다.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_material_allocation_activity_insert on public.activity_logs;
create trigger guard_material_allocation_activity_insert
before insert on public.activity_logs
for each row execute function public.guard_material_allocation_activity_insert();

create or replace function public.record_material_allocation_activity(
  p_material_contract_id uuid,
  p_allocation_id uuid,
  p_event_type text,
  p_title text,
  p_field text,
  p_field_label text,
  p_before jsonb,
  p_after jsonb,
  p_before_display text,
  p_after_display text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee public.employees%rowtype;
  v_log_id bigint;
begin
  select * into v_employee from public.employees
  where auth_user_id = auth.uid() and active = true and approval_status = 'approved';
  if v_employee.id is null then raise exception '승인된 사용자를 찾을 수 없습니다.' using errcode = '42501'; end if;

  perform set_config('app.material_allocation_audit_write', 'on', true);
  insert into public.activity_logs (
    activity_type, action_type, target_type, target_id, project_id, employee_id,
    employee_name, employee_email, title, description, metadata
  ) values (
    p_event_type, p_event_type, 'material_contract_allocation', null, null, v_employee.id,
    v_employee.name, v_employee.email, p_title, null,
    jsonb_build_object(
      'material_contract_id', p_material_contract_id,
      'allocation_id', p_allocation_id,
      'field', p_field,
      'field_label', p_field_label,
      'before', p_before,
      'after', p_after,
      'before_display', p_before_display,
      'after_display', p_after_display
    )
  ) returning id into v_log_id;
  perform set_config('app.material_allocation_audit_write', 'off', true);
  return v_log_id;
end;
$$;

revoke all on function public.record_material_allocation_activity(uuid,uuid,text,text,text,text,jsonb,jsonb,text,text) from public, anon, authenticated;

create or replace function public.save_material_contract_allocation(
  p_contract_id uuid,
  p_allocation_id uuid,
  p_allocation_type text,
  p_project_id bigint,
  p_destination_name text,
  p_quantity_tons numeric,
  p_allocation_date date,
  p_status text,
  p_purchase_order_no text,
  p_memo text,
  p_cancel boolean default false
)
returns public.material_contract_allocations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contract public.raw_material_contracts%rowtype;
  v_existing public.material_contract_allocations%rowtype;
  v_allocated numeric(16,4);
  v_result public.material_contract_allocations%rowtype;
  v_before_target text;
  v_after_target text;
begin
  if auth.uid() is null or not public.is_approved_admin() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;

  select * into v_contract from public.raw_material_contracts where id = p_contract_id for update;
  if not found then raise exception '계약을 찾을 수 없습니다.' using errcode = 'P0002'; end if;

  if p_allocation_id is not null then
    select * into v_existing from public.material_contract_allocations
    where id = p_allocation_id and contract_id = p_contract_id;
    if not found then raise exception '해당 계약의 사용 이력을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  end if;

  if p_cancel then
    if p_allocation_id is null or v_existing.status = 'cancelled' then raise exception '취소할 수 없는 사용 이력입니다.' using errcode = '22023'; end if;
    update public.material_contract_allocations set status = 'cancelled'
    where id = p_allocation_id and contract_id = p_contract_id returning * into v_result;
    perform public.record_material_allocation_activity(
      p_contract_id, v_result.id, 'material_allocation_cancelled', '배정 취소', 'status', '상태',
      to_jsonb(v_existing.status), to_jsonb(v_result.status),
      case v_existing.status when 'planned' then '예정' when 'confirmed' then '확정' else '취소' end, '취소'
    );
    return v_result;
  end if;

  if p_allocation_type not in ('project', 'factory', 'as', 'sample', 'etc') then raise exception '사용 구분을 확인해주세요.' using errcode = '22023'; end if;
  if p_allocation_type = 'project' then
    if p_project_id is null or not exists (select 1 from public.projects where id = p_project_id) then raise exception '유효한 프로젝트가 필요합니다.' using errcode = 'P0002'; end if;
  elsif p_project_id is not null or (p_allocation_type <> 'factory' and nullif(btrim(p_destination_name), '') is null) then
    raise exception '비프로젝트 사용은 프로젝트를 지정할 수 없고 사용처명이 필요합니다.' using errcode = '22023';
  end if;
  if nullif(btrim(p_destination_name), '') is not null and char_length(btrim(p_destination_name)) > 200 then raise exception '사용처명은 200자 이하여야 합니다.' using errcode = '22023'; end if;
  if p_status not in ('planned', 'confirmed') then raise exception '상태는 planned 또는 confirmed여야 합니다.' using errcode = '22023'; end if;
  if p_quantity_tons is null or p_quantity_tons <= 0 or p_quantity_tons <> round(p_quantity_tons, 4) then raise exception '톤수는 0보다 큰 소수점 4자리 이하 값이어야 합니다.' using errcode = '22023'; end if;
  if p_allocation_date is null then raise exception '배정일이 필요합니다.' using errcode = '22023'; end if;
  if nullif(btrim(p_purchase_order_no), '') is not null and char_length(btrim(p_purchase_order_no)) > 100 then raise exception '발주번호는 100자 이하여야 합니다.' using errcode = '22023'; end if;
  if nullif(btrim(p_memo), '') is not null and char_length(btrim(p_memo)) > 2000 then raise exception '메모는 2000자 이하여야 합니다.' using errcode = '22023'; end if;

  select coalesce(sum(quantity_tons), 0) into v_allocated from public.material_contract_allocations
  where contract_id = p_contract_id and status in ('planned', 'confirmed') and (p_allocation_id is null or id <> p_allocation_id);
  if v_allocated + p_quantity_tons > v_contract.contract_quantity_ton + 0.00005 then
    raise exception '현재 배정 가능한 물량은 %t입니다. %t를 배정할 수 없습니다.',
      to_char(greatest(v_contract.contract_quantity_ton - v_allocated, 0), 'FM999999999990.0000'), to_char(p_quantity_tons, 'FM999999999990.0000') using errcode = '23514';
  end if;

  if p_allocation_id is null then
    insert into public.material_contract_allocations (
      contract_id, allocation_type, project_id, destination_name, quantity_tons, allocation_date, status, purchase_order_no, memo, created_by
    ) values (
      p_contract_id, p_allocation_type, case when p_allocation_type = 'project' then p_project_id else null end,
      case when p_allocation_type in ('project', 'factory') then null else nullif(btrim(p_destination_name), '') end,
      p_quantity_tons, p_allocation_date, p_status, nullif(btrim(p_purchase_order_no), ''), nullif(btrim(p_memo), ''), auth.uid()
    ) returning * into v_result;
    v_after_target := case v_result.allocation_type
      when 'project' then (select project_name from public.projects where id = v_result.project_id)
      when 'factory' then '공장 재고' when 'as' then 'A/S · ' || v_result.destination_name
      when 'sample' then '샘플 · ' || v_result.destination_name else '기타 · ' || v_result.destination_name end;
    perform public.record_material_allocation_activity(
      p_contract_id, v_result.id, 'material_allocation_created', '신규 배정 등록', null, '배정', null,
      jsonb_build_object('allocation_type', v_result.allocation_type, 'project_id', v_result.project_id, 'quantity_tons', v_result.quantity_tons, 'status', v_result.status),
      null, v_after_target || ' · ' || to_char(v_result.quantity_tons, 'FM999999999990.0000') || 't'
    );
  else
    if v_existing.status = 'cancelled' then raise exception '취소된 사용 이력은 수정할 수 없습니다.' using errcode = '22023'; end if;
    update public.material_contract_allocations set
      allocation_type = p_allocation_type,
      project_id = case when p_allocation_type = 'project' then p_project_id else null end,
      destination_name = case when p_allocation_type in ('project', 'factory') then null else nullif(btrim(p_destination_name), '') end,
      quantity_tons = p_quantity_tons, allocation_date = p_allocation_date, status = p_status,
      purchase_order_no = nullif(btrim(p_purchase_order_no), ''), memo = nullif(btrim(p_memo), '')
    where id = p_allocation_id and contract_id = p_contract_id returning * into v_result;

    if v_existing.status is distinct from v_result.status then
      perform public.record_material_allocation_activity(p_contract_id, v_result.id, 'material_allocation_status_changed', '상태 변경', 'status', '상태', to_jsonb(v_existing.status), to_jsonb(v_result.status), case v_existing.status when 'planned' then '예정' else '확정' end, case v_result.status when 'planned' then '예정' else '확정' end);
    end if;
    if v_existing.quantity_tons is distinct from v_result.quantity_tons then
      perform public.record_material_allocation_activity(p_contract_id, v_result.id, 'material_allocation_quantity_changed', '배정량 변경', 'quantity_tons', '배정량', to_jsonb(v_existing.quantity_tons), to_jsonb(v_result.quantity_tons), to_char(v_existing.quantity_tons, 'FM999999999990.0000') || 't', to_char(v_result.quantity_tons, 'FM999999999990.0000') || 't');
    end if;
    if (v_existing.allocation_type, v_existing.project_id, v_existing.destination_name) is distinct from (v_result.allocation_type, v_result.project_id, v_result.destination_name) then
      v_before_target := case v_existing.allocation_type when 'project' then (select project_name from public.projects where id = v_existing.project_id) when 'factory' then '공장 재고' when 'as' then 'A/S · ' || v_existing.destination_name when 'sample' then '샘플 · ' || v_existing.destination_name else '기타 · ' || v_existing.destination_name end;
      v_after_target := case v_result.allocation_type when 'project' then (select project_name from public.projects where id = v_result.project_id) when 'factory' then '공장 재고' when 'as' then 'A/S · ' || v_result.destination_name when 'sample' then '샘플 · ' || v_result.destination_name else '기타 · ' || v_result.destination_name end;
      perform public.record_material_allocation_activity(p_contract_id, v_result.id, 'material_allocation_target_changed', '사용 대상 변경', 'allocation_target', '사용 대상', jsonb_build_object('allocation_type', v_existing.allocation_type, 'project_id', v_existing.project_id, 'destination_name', v_existing.destination_name), jsonb_build_object('allocation_type', v_result.allocation_type, 'project_id', v_result.project_id, 'destination_name', v_result.destination_name), v_before_target, v_after_target);
    end if;
    if v_existing.purchase_order_no is distinct from v_result.purchase_order_no then
      perform public.record_material_allocation_activity(p_contract_id, v_result.id, 'material_allocation_purchase_order_changed', '발주번호 변경', 'purchase_order_no', '발주번호', to_jsonb(v_existing.purchase_order_no), to_jsonb(v_result.purchase_order_no), coalesce(v_existing.purchase_order_no, '-'), coalesce(v_result.purchase_order_no, '-'));
    end if;
    if v_existing.memo is distinct from v_result.memo then
      perform public.record_material_allocation_activity(p_contract_id, v_result.id, 'material_allocation_memo_changed', '메모 변경', 'memo', '메모', to_jsonb(v_existing.memo), to_jsonb(v_result.memo), coalesce(v_existing.memo, '-'), coalesce(v_result.memo, '-'));
    end if;
    if v_existing.allocation_date is distinct from v_result.allocation_date then
      perform public.record_material_allocation_activity(p_contract_id, v_result.id, 'material_allocation_date_changed', '배정일 변경', 'allocation_date', '배정일', to_jsonb(v_existing.allocation_date), to_jsonb(v_result.allocation_date), v_existing.allocation_date::text, v_result.allocation_date::text);
    end if;
  end if;
  return v_result;
end;
$$;

revoke all on function public.save_material_contract_allocation(uuid, uuid, text, bigint, text, numeric, date, text, text, text, boolean) from public, anon;
grant execute on function public.save_material_contract_allocation(uuid, uuid, text, bigint, text, numeric, date, text, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
