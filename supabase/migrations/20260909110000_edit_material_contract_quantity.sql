begin;
CREATE OR REPLACE FUNCTION public.prepare_raw_material_contract() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op='INSERT' then new.remaining_quantity_ton:=new.contract_quantity_ton;
  else
    if new.supplier_id is distinct from old.supplier_id or new.material_code is distinct from old.material_code or new.contract_name is distinct from old.contract_name or new.contract_year is distinct from old.contract_year or new.contract_price_krw_per_kg is distinct from old.contract_price_krw_per_kg or new.processing_cost_krw_per_kg is distinct from old.processing_cost_krw_per_kg or new.effective_start_date is distinct from old.effective_start_date or new.effective_end_date is distinct from old.effective_end_date or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then raise exception 'Core contract terms are immutable. Register a new contract instead.' using errcode='55000'; end if;
    if new.contract_quantity_ton is distinct from old.contract_quantity_ton and coalesce(current_setting('app.material_contract_quantity_increase',true),'')<>'on' and coalesce(current_setting('app.material_contract_quantity_edit',true),'')<>'on' then raise exception '계약 물량은 증액 RPC로만 변경할 수 있습니다.' using errcode='55000'; end if;
    if new.contract_quantity_ton < old.contract_quantity_ton and coalesce(current_setting('app.material_contract_quantity_edit',true),'')<>'on' then raise exception '계약 물량은 감소시킬 수 없습니다.' using errcode='22023'; end if;
    new.updated_at:=now(); new.updated_by:=auth.uid();
  end if; return new;
end; $$;

create or replace function public.update_material_contract_operations(
  p_contract_id uuid, p_status text, p_memo text, p_quantity_tons numeric default null
) returns public.raw_material_contracts
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_employee public.employees%rowtype;
  v_contract public.raw_material_contracts%rowtype;
  v_result public.raw_material_contracts%rowtype;
  v_quantity numeric;
  v_allocated numeric;
  v_confirmed numeric;
  v_previous_flag text;
begin
  select * into v_employee from public.employees
    where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role<>'admin' then
    raise exception '관리자 권한이 필요합니다.' using errcode='42501';
  end if;
  select * into v_contract from public.raw_material_contracts where id=p_contract_id for update;
  if not found then raise exception '계약을 찾을 수 없습니다.' using errcode='P0002'; end if;
  v_quantity := coalesce(p_quantity_tons,v_contract.contract_quantity_ton);
  if p_status is null or p_status not in ('scheduled','active','completed','cancelled')
    or char_length(coalesce(p_memo,''))>2000 or v_quantity<=0
    or v_quantity<>round(v_quantity,4) or v_quantity>=1000000000000 then
    raise exception '계약 운영값을 확인해주세요.' using errcode='22023';
  end if;
  select coalesce(sum(quantity_tons),0),coalesce(sum(quantity_tons) filter(where status='confirmed'),0)
    into v_allocated,v_confirmed from public.material_contract_allocations
    where contract_id=p_contract_id and source_type='contract' and status in ('planned','confirmed');
  if v_quantity is distinct from v_contract.contract_quantity_ton and v_quantity<v_allocated then
    raise exception '계약 무게는 예정·확정 배정량 합계 % ton 이상이어야 합니다.',v_allocated using errcode='23514';
  end if;
  v_previous_flag := coalesce(current_setting('app.material_contract_quantity_edit',true),'');
  perform set_config('app.material_contract_quantity_edit','on',true);
  update public.raw_material_contracts set
    contract_quantity_ton=v_quantity,
    remaining_quantity_ton=case when v_quantity is distinct from v_contract.contract_quantity_ton then greatest(v_quantity-v_confirmed,0) else remaining_quantity_ton end,
    status=p_status,memo=nullif(btrim(p_memo),''),updated_by=auth.uid()
    where id=p_contract_id returning * into v_result;
  perform set_config('app.material_contract_quantity_edit',v_previous_flag,true);
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
    values('material_contract_operations_updated','material_contract_operations_updated','raw_material_contract',v_employee.id,v_employee.name,v_employee.email,'원자재 계약 운영값 수정',v_contract.contract_name,
      jsonb_build_object('contract_id',p_contract_id,'before_quantity_ton',v_contract.contract_quantity_ton,'after_quantity_ton',v_quantity,'before_status',v_contract.status,'after_status',p_status,'before_memo',v_contract.memo,'after_memo',v_result.memo));
  return v_result;
end; $$;
revoke all on function public.update_material_contract_operations(uuid,text,text,numeric) from public;
grant execute on function public.update_material_contract_operations(uuid,text,text,numeric) to authenticated;
grant execute on function public.update_material_contract_operations(uuid,text,text,numeric) to service_role;
notify pgrst, 'reload schema';
commit;
