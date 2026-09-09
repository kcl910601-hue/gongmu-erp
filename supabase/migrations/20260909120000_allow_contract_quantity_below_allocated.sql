begin;
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
  if v_quantity is distinct from v_contract.contract_quantity_ton and v_quantity+0.005<v_allocated then
    raise exception '배정량 % ton 대비 계약 무게의 초과 허용 범위는 최대 5kg입니다.',v_allocated using errcode='23514';
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
notify pgrst, 'reload schema';
commit;
