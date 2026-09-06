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
  if v_request.allocation_type <> 'project' and v_allocated+p_quantity_tons>v_request.quantity_tons+0.00005 then raise exception '미배정량을 초과할 수 없습니다.' using errcode='23514'; end if;
  insert into public.material_contract_allocations(contract_id,usage_request_id,allocation_type,project_id,destination_name,quantity_tons,allocation_date,status,created_by,source_type,direct_unit_price_krw_per_kg,applied_unit_price_krw_per_kg)
  values(null,v_request.id,v_request.allocation_type,v_request.project_id,v_request.destination_name,p_quantity_tons,v_request.usage_date,p_status,auth.uid(),'direct_price',p_direct_unit_price_krw_per_kg,p_direct_unit_price_krw_per_kg) returning * into v_result;
  perform public.record_material_allocation_activity(null,v_result.id,'material_allocation_created','직접단가 배정',null,'배정',null,jsonb_build_object('usage_request_id',v_request.id,'source_type','direct_price','quantity_tons',p_quantity_tons,'status',p_status,'applied_unit_price_krw_per_kg',p_direct_unit_price_krw_per_kg),null,to_char(p_quantity_tons,'FM999999999990.0000')||'t · '||to_char(p_direct_unit_price_krw_per_kg,'FM999999999990.####')||'원/kg');
  return v_result;
end; $$;

revoke all on function public.allocate_material_usage_request_direct_price(uuid,numeric,numeric,text) from public;
grant execute on function public.allocate_material_usage_request_direct_price(uuid,numeric,numeric,text) to authenticated;
grant execute on function public.allocate_material_usage_request_direct_price(uuid,numeric,numeric,text) to service_role;
