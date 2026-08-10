begin;

alter table public.material_contract_allocations
  drop constraint if exists material_contract_allocations_target_check;

alter table public.material_contract_allocations
  add constraint material_contract_allocations_target_check check (
    (allocation_type = 'project' and project_id is not null and destination_name is null)
    or
    (allocation_type = 'factory' and project_id is null)
    or
    (allocation_type in ('as', 'sample', 'etc') and project_id is null and nullif(btrim(destination_name), '') is not null)
  );

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
  else
    if v_existing.status = 'cancelled' then raise exception '취소된 사용 이력은 수정할 수 없습니다.' using errcode = '22023'; end if;
    update public.material_contract_allocations set
      allocation_type = p_allocation_type,
      project_id = case when p_allocation_type = 'project' then p_project_id else null end,
      destination_name = case when p_allocation_type in ('project', 'factory') then null else nullif(btrim(p_destination_name), '') end,
      quantity_tons = p_quantity_tons, allocation_date = p_allocation_date, status = p_status,
      purchase_order_no = nullif(btrim(p_purchase_order_no), ''), memo = nullif(btrim(p_memo), '')
    where id = p_allocation_id and contract_id = p_contract_id returning * into v_result;
  end if;
  return v_result;
end;
$$;

revoke all on function public.save_material_contract_allocation(uuid, uuid, text, bigint, text, numeric, date, text, text, text, boolean) from public, anon;
grant execute on function public.save_material_contract_allocation(uuid, uuid, text, bigint, text, numeric, date, text, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
