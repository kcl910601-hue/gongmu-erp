-- Allow factory stock allocations above the requested quantity, as for projects.
-- Keep contract capacity, price snapshots, authorization and activity logging unchanged.
begin;

create or replace function public.allocate_material_usage_request(p_usage_request_id uuid, p_contract_id uuid, p_quantity_tons numeric, p_status text, p_expected_available numeric default null) returns public.material_contract_allocations
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_employee public.employees%rowtype; v_request public.material_usage_requests%rowtype; v_contract public.raw_material_contracts%rowtype; v_available numeric(16,4); v_allocated numeric(16,4); v_result public.material_contract_allocations%rowtype;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role<>'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into v_request from public.material_usage_requests where id=p_usage_request_id and status='active' for update;
  if not found then raise exception '사용요청을 찾을 수 없습니다.' using errcode='P0002'; end if;
  select * into v_contract from public.raw_material_contracts where id=p_contract_id and material_code=v_request.material_code and status='active' for update;
  if not found then raise exception '동일 원자재의 활성 계약이 필요합니다.' using errcode='P0002'; end if;
  if p_status not in ('planned','confirmed') or p_quantity_tons is null or p_quantity_tons<=0 or p_quantity_tons<>round(p_quantity_tons,4) then raise exception '배정값을 확인해주세요.' using errcode='22023'; end if;
  select greatest(v_contract.contract_quantity_ton-coalesce(sum(quantity_tons) filter(where status in ('planned','confirmed')),0),0) into v_available from public.material_contract_allocations where contract_id=v_contract.id and source_type='contract';
  select coalesce(sum(quantity_tons) filter(where status in ('planned','confirmed')),0) into v_allocated from public.material_contract_allocations where usage_request_id=v_request.id;
  if p_expected_available is not null and abs(v_available-p_expected_available)>0.00005 then raise exception '계약 가용량이 변경되었습니다. 배정 계획을 다시 확인해주세요.' using errcode='40001'; end if;
  if p_quantity_tons>v_available+0.00005 then raise exception '계약 가용량을 초과할 수 없습니다.' using errcode='23514'; end if;
  if v_request.allocation_type not in ('project', 'factory') and v_allocated+p_quantity_tons>v_request.quantity_tons+0.00005 then raise exception '미배정량을 초과할 수 없습니다.' using errcode='23514'; end if;
  insert into public.material_contract_allocations(contract_id,usage_request_id,allocation_type,project_id,destination_name,quantity_tons,allocation_date,status,created_by,source_type,direct_unit_price_krw_per_kg,applied_unit_price_krw_per_kg)
  values(v_contract.id,v_request.id,v_request.allocation_type,v_request.project_id,v_request.destination_name,p_quantity_tons,v_request.usage_date,p_status,auth.uid(),'contract',null,v_contract.contract_price_krw_per_kg) returning * into v_result;
  perform public.record_material_allocation_activity(v_contract.id,v_result.id,'material_allocation_created','계약 배정',null,'배정',null,jsonb_build_object('usage_request_id',v_request.id,'source_type','contract','quantity_tons',p_quantity_tons,'status',p_status,'applied_unit_price_krw_per_kg',v_contract.contract_price_krw_per_kg),null,to_char(p_quantity_tons,'FM999999999990.0000')||'t');
  return v_result;
end; $$;

create or replace function public.allocate_material_usage_request_direct_price(p_usage_request_id uuid, p_quantity_tons numeric, p_direct_unit_price_krw_per_kg numeric, p_status text) returns public.material_contract_allocations
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_employee public.employees%rowtype; v_request public.material_usage_requests%rowtype; v_allocated numeric(16,4); v_result public.material_contract_allocations%rowtype;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role<>'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into v_request from public.material_usage_requests where id=p_usage_request_id and status='active' for update;
  if not found then raise exception '사용요청을 찾을 수 없습니다.' using errcode='P0002'; end if;
  if p_status not in ('planned','confirmed') or p_quantity_tons is null or p_quantity_tons<=0 or p_quantity_tons<>round(p_quantity_tons,4) then raise exception '배정값을 확인해주세요.' using errcode='22023'; end if;
  if p_direct_unit_price_krw_per_kg is null or p_direct_unit_price_krw_per_kg<=0 or p_direct_unit_price_krw_per_kg<>round(p_direct_unit_price_krw_per_kg,4) then raise exception '직접단가를 확인해주세요.' using errcode='22023'; end if;
  select coalesce(sum(quantity_tons) filter(where status in ('planned','confirmed')),0) into v_allocated from public.material_contract_allocations where usage_request_id=v_request.id;
  if v_request.allocation_type not in ('project', 'factory') and v_allocated+p_quantity_tons>v_request.quantity_tons+0.00005 then raise exception '미배정량을 초과할 수 없습니다.' using errcode='23514'; end if;
  insert into public.material_contract_allocations(contract_id,usage_request_id,allocation_type,project_id,destination_name,quantity_tons,allocation_date,status,created_by,source_type,direct_unit_price_krw_per_kg,applied_unit_price_krw_per_kg)
  values(null,v_request.id,v_request.allocation_type,v_request.project_id,v_request.destination_name,p_quantity_tons,v_request.usage_date,p_status,auth.uid(),'direct_price',p_direct_unit_price_krw_per_kg,p_direct_unit_price_krw_per_kg) returning * into v_result;
  perform public.record_material_allocation_activity(null,v_result.id,'material_allocation_created','직접단가 배정',null,'배정',null,jsonb_build_object('usage_request_id',v_request.id,'source_type','direct_price','quantity_tons',p_quantity_tons,'status',p_status,'applied_unit_price_krw_per_kg',p_direct_unit_price_krw_per_kg),null,to_char(p_quantity_tons,'FM999999999990.0000')||'t · '||to_char(p_direct_unit_price_krw_per_kg,'FM999999999990.####')||'원/kg');
  return v_result;
end; $$;

create or replace function public.update_material_usage_request(p_usage_request_id uuid, p_quantity_tons numeric, p_purchase_order_no text, p_usage_date date, p_memo text) returns public.material_usage_requests
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_employee public.employees%rowtype; v_request public.material_usage_requests%rowtype; v_allocated numeric(16,4);
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role <> 'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into v_request from public.material_usage_requests where id=p_usage_request_id and status='active' for update;
  if not found then raise exception '활성 사용요청을 찾을 수 없습니다.' using errcode='P0002'; end if;
  if p_quantity_tons is null or p_quantity_tons<=0 or p_quantity_tons<>round(p_quantity_tons,4) or p_usage_date is null then raise exception '사용요청 입력값을 확인해주세요.' using errcode='22023'; end if;
  if char_length(coalesce(nullif(btrim(p_purchase_order_no),''),''))>100 or char_length(coalesce(nullif(btrim(p_memo),''),''))>2000 then raise exception '발주번호 또는 메모 길이를 확인해주세요.' using errcode='22023'; end if;
  select coalesce(sum(quantity_tons) filter(where status in ('planned','confirmed')),0) into v_allocated from public.material_contract_allocations where usage_request_id=v_request.id;
  if v_request.allocation_type not in ('project', 'factory') and p_quantity_tons+0.00005 < v_allocated then raise exception '현재 %.3ft가 배정되어 요청량을 그보다 작게 줄일 수 없습니다.',v_allocated using errcode='23514'; end if;
  update public.material_usage_requests set quantity_tons=p_quantity_tons,purchase_order_no=nullif(btrim(p_purchase_order_no),''),usage_date=p_usage_date,memo=nullif(btrim(p_memo),''),updated_by=auth.uid(),updated_at=now() where id=v_request.id returning * into v_request;
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata) values('material_usage_request_updated','material_usage_request_updated','material_usage_request',v_employee.id,v_employee.name,v_employee.email,'원자재 사용요청 수정',to_char(p_quantity_tons,'FM999999999990.0000')||'t',jsonb_build_object('usage_request_id',v_request.id,'after_quantity_tons',p_quantity_tons,'allocated_tons',v_allocated,'purchase_order_no',v_request.purchase_order_no,'usage_date',v_request.usage_date));
  return v_request;
end; $$;

create or replace function public.update_material_usage_request_quantity(p_usage_request_id uuid, p_quantity_tons numeric) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_request public.material_usage_requests%rowtype; v_allocated numeric(16,4); begin
  if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into v_request from public.material_usage_requests where id=p_usage_request_id and status='active' for update;
  if not found or p_quantity_tons is null or p_quantity_tons<=0 or p_quantity_tons<>round(p_quantity_tons,4) then raise exception '요청량을 확인해주세요.' using errcode='22023'; end if;
  select coalesce(sum(quantity_tons) filter(where status in ('planned','confirmed')),0) into v_allocated from public.material_contract_allocations where usage_request_id=v_request.id;
  if v_request.allocation_type not in ('project', 'factory') and p_quantity_tons+0.00005<v_allocated then raise exception '요청량은 현재 유효 배정량보다 작을 수 없습니다.' using errcode='23514'; end if;
  update public.material_usage_requests set quantity_tons=p_quantity_tons,updated_by=auth.uid(),updated_at=now() where id=v_request.id;
end; $$;

commit;
