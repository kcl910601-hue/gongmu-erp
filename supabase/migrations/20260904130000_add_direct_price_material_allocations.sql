alter table public.material_contract_allocations
  add column source_type text,
  add column direct_unit_price_krw_per_kg numeric(16,4),
  add column applied_unit_price_krw_per_kg numeric(16,4);

update public.material_contract_allocations a
set source_type = 'contract',
    applied_unit_price_krw_per_kg = c.contract_price_krw_per_kg
from public.raw_material_contracts c
where c.id = a.contract_id;

do $$
begin
  if exists (
    select 1 from public.material_contract_allocations
    where source_type is null or applied_unit_price_krw_per_kg is null or applied_unit_price_krw_per_kg <= 0
  ) then
    raise exception 'Legacy allocation price snapshot backfill failed.';
  end if;
end;
$$;

alter table public.material_contract_allocations
  alter column source_type set default 'contract',
  alter column source_type set not null,
  alter column applied_unit_price_krw_per_kg set not null,
  alter column contract_id drop not null,
  add constraint material_contract_allocations_source_type_check
    check (source_type in ('contract', 'direct_price')),
  add constraint material_contract_allocations_source_values_check
    check (
      (source_type = 'contract' and contract_id is not null and direct_unit_price_krw_per_kg is null and applied_unit_price_krw_per_kg > 0)
      or
      (source_type = 'direct_price' and contract_id is null and direct_unit_price_krw_per_kg > 0 and applied_unit_price_krw_per_kg = direct_unit_price_krw_per_kg)
    );

create index material_contract_allocations_source_status_idx
  on public.material_contract_allocations(source_type, status);

create or replace function public.protect_material_allocation_price_snapshot() returns trigger
language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  if new.source_type is distinct from old.source_type
    or new.contract_id is distinct from old.contract_id
    or new.direct_unit_price_krw_per_kg is distinct from old.direct_unit_price_krw_per_kg
    or new.applied_unit_price_krw_per_kg is distinct from old.applied_unit_price_krw_per_kg then
    raise exception 'Allocation source and applied price snapshot are immutable.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger protect_material_allocation_price_snapshot
before update on public.material_contract_allocations
for each row execute function public.protect_material_allocation_price_snapshot();

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
  if v_request.allocation_type <> 'project' and v_allocated+p_quantity_tons>v_request.quantity_tons+0.00005 then raise exception '미배정량을 초과할 수 없습니다.' using errcode='23514'; end if;
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
  if v_request.allocation_type <> 'project' and v_allocated+p_quantity_tons>v_request.quantity_tons+0.00005 then raise exception '미배정량을 초과할 수 없습니다.' using errcode='23514'; end if;
  insert into public.material_contract_allocations(contract_id,usage_request_id,allocation_type,project_id,destination_name,quantity_tons,allocation_date,status,created_by,source_type,direct_unit_price_krw_per_kg,applied_unit_price_krw_per_kg)
  values(null,v_request.id,v_request.allocation_type,v_request.project_id,v_request.destination_name,p_quantity_tons,v_request.usage_date,p_status,auth.uid(),'direct_price',p_direct_unit_price_krw_per_kg,p_direct_unit_price_krw_per_kg) returning * into v_result;
  insert into public.activity_logs(activity_type,action_type,target_type,target_id,project_id,employee_id,employee_name,employee_email,title,description,metadata)
  values('material_allocation_created','material_allocation_created','material_contract_allocation',v_result.id,v_request.project_id,v_employee.id,v_employee.name,v_employee.email,'직접단가 배정',to_char(p_quantity_tons,'FM999999999990.0000')||'t · '||to_char(p_direct_unit_price_krw_per_kg,'FM999999999990.####')||'원/kg',jsonb_build_object('usage_request_id',v_request.id,'allocation_id',v_result.id,'source_type','direct_price','quantity_tons',p_quantity_tons,'status',p_status,'applied_unit_price_krw_per_kg',p_direct_unit_price_krw_per_kg));
  return v_result;
end; $$;

revoke all on function public.allocate_material_usage_request_direct_price(uuid,numeric,numeric,text) from public;
grant execute on function public.allocate_material_usage_request_direct_price(uuid,numeric,numeric,text) to authenticated;
grant execute on function public.allocate_material_usage_request_direct_price(uuid,numeric,numeric,text) to service_role;

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
  if v_request.allocation_type <> 'project' and p_quantity_tons+0.00005 < v_allocated then raise exception '현재 %.3ft가 배정되어 요청량을 그보다 작게 줄일 수 없습니다.',v_allocated using errcode='23514'; end if;
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
  if v_request.allocation_type <> 'project' and p_quantity_tons+0.00005<v_allocated then raise exception '요청량은 현재 유효 배정량보다 작을 수 없습니다.' using errcode='23514'; end if;
  update public.material_usage_requests set quantity_tons=p_quantity_tons,updated_by=auth.uid(),updated_at=now() where id=v_request.id;
end; $$;

create or replace function public.save_material_contract_allocation(p_contract_id uuid, p_allocation_id uuid, p_allocation_type text, p_project_id bigint, p_destination_name text, p_quantity_tons numeric, p_allocation_date date, p_status text, p_purchase_order_no text, p_memo text, p_cancel boolean default false) returns public.material_contract_allocations
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_contract public.raw_material_contracts%rowtype; v_existing public.material_contract_allocations%rowtype; v_allocated numeric(16,4); v_result public.material_contract_allocations%rowtype;
begin
  if auth.uid() is null or not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into v_contract from public.raw_material_contracts where id=p_contract_id for update;
  if not found then raise exception '계약을 찾을 수 없습니다.' using errcode='P0002'; end if;
  if p_allocation_id is not null then select * into v_existing from public.material_contract_allocations where id=p_allocation_id and contract_id=p_contract_id and source_type='contract'; if not found then raise exception '해당 계약의 사용 이력을 찾을 수 없습니다.' using errcode='P0002'; end if; end if;
  if p_cancel then if p_allocation_id is null or v_existing.status='cancelled' then raise exception '취소할 수 없는 사용 이력입니다.' using errcode='22023'; end if; update public.material_contract_allocations set status='cancelled' where id=p_allocation_id returning * into v_result; return v_result; end if;
  if p_allocation_type not in ('project','factory','as','sample','etc') or p_status not in ('planned','confirmed') or p_quantity_tons is null or p_quantity_tons<=0 or p_quantity_tons<>round(p_quantity_tons,4) or p_allocation_date is null then raise exception '배정 입력값을 확인해주세요.' using errcode='22023'; end if;
  if p_allocation_type='project' and (p_project_id is null or not exists(select 1 from public.projects where id=p_project_id)) then raise exception '유효한 프로젝트가 필요합니다.' using errcode='P0002'; end if;
  if p_allocation_type<>'project' and (p_project_id is not null or (p_allocation_type<>'factory' and nullif(btrim(p_destination_name),'') is null)) then raise exception '사용처를 확인해주세요.' using errcode='22023'; end if;
  select coalesce(sum(quantity_tons),0) into v_allocated from public.material_contract_allocations where contract_id=p_contract_id and source_type='contract' and status in ('planned','confirmed') and (p_allocation_id is null or id<>p_allocation_id);
  if v_allocated+p_quantity_tons>v_contract.contract_quantity_ton+0.00005 then raise exception '계약 가용량을 초과할 수 없습니다.' using errcode='23514'; end if;
  if p_allocation_id is null then
    insert into public.material_contract_allocations(contract_id,allocation_type,project_id,destination_name,quantity_tons,allocation_date,status,purchase_order_no,memo,created_by,source_type,direct_unit_price_krw_per_kg,applied_unit_price_krw_per_kg)
    values(p_contract_id,p_allocation_type,case when p_allocation_type='project' then p_project_id end,case when p_allocation_type in ('project','factory') then null else nullif(btrim(p_destination_name),'') end,p_quantity_tons,p_allocation_date,p_status,nullif(btrim(p_purchase_order_no),''),nullif(btrim(p_memo),''),auth.uid(),'contract',null,v_contract.contract_price_krw_per_kg) returning * into v_result;
  else
    if v_existing.status='cancelled' then raise exception '취소된 사용 이력은 수정할 수 없습니다.' using errcode='22023'; end if;
    update public.material_contract_allocations set allocation_type=p_allocation_type,project_id=case when p_allocation_type='project' then p_project_id end,destination_name=case when p_allocation_type in ('project','factory') then null else nullif(btrim(p_destination_name),'') end,quantity_tons=p_quantity_tons,allocation_date=p_allocation_date,status=p_status,purchase_order_no=nullif(btrim(p_purchase_order_no),''),memo=nullif(btrim(p_memo),'') where id=p_allocation_id returning * into v_result;
  end if;
  return v_result;
end; $$;
