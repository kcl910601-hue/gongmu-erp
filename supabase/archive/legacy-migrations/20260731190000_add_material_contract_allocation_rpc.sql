begin;

create or replace function public.save_material_contract_allocation(
  p_contract_id uuid,
  p_allocation_id uuid,
  p_project_id bigint,
  p_quantity_tons numeric,
  p_allocation_date date,
  p_status text,
  p_purchase_order_no text default null,
  p_memo text default null,
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

  select * into v_contract
  from public.raw_material_contracts
  where id = p_contract_id
  for update;
  if not found then
    raise exception '계약을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  if p_allocation_id is not null then
    select * into v_existing
    from public.material_contract_allocations
    where id = p_allocation_id and contract_id = p_contract_id;
    if not found then
      raise exception '해당 계약의 배정 이력을 찾을 수 없습니다.' using errcode = 'P0002';
    end if;
  end if;

  if p_cancel then
    if p_allocation_id is null or v_existing.status = 'cancelled' then
      raise exception '취소할 수 없는 배정입니다.' using errcode = '22023';
    end if;
    update public.material_contract_allocations
    set status = 'cancelled'
    where id = p_allocation_id and contract_id = p_contract_id
    returning * into v_result;
    return v_result;
  end if;

  if p_status not in ('planned', 'confirmed') then
    raise exception '배정 상태는 planned 또는 confirmed여야 합니다.' using errcode = '22023';
  end if;
  if p_quantity_tons is null or p_quantity_tons <= 0 or p_quantity_tons <> round(p_quantity_tons, 4) then
    raise exception '배정 톤수는 0보다 큰 소수점 4자리 이하 값이어야 합니다.' using errcode = '22023';
  end if;
  if p_allocation_date is null then
    raise exception '배정일이 필요합니다.' using errcode = '22023';
  end if;
  if nullif(btrim(p_purchase_order_no), '') is not null and char_length(btrim(p_purchase_order_no)) > 100 then
    raise exception '발주번호는 100자 이하여야 합니다.' using errcode = '22023';
  end if;
  if nullif(btrim(p_memo), '') is not null and char_length(btrim(p_memo)) > 2000 then
    raise exception '메모는 2000자 이하여야 합니다.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception '프로젝트를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select coalesce(sum(quantity_tons), 0) into v_allocated
  from public.material_contract_allocations
  where contract_id = p_contract_id
    and status in ('planned', 'confirmed')
    and (p_allocation_id is null or id <> p_allocation_id);

  if v_allocated + p_quantity_tons > v_contract.contract_quantity_ton + 0.00005 then
    raise exception '현재 배정 가능한 물량은 %t입니다. %t를 배정할 수 없습니다.',
      to_char(greatest(v_contract.contract_quantity_ton - v_allocated, 0), 'FM999999999990.0000'),
      to_char(p_quantity_tons, 'FM999999999990.0000') using errcode = '23514';
  end if;

  if p_allocation_id is null then
    insert into public.material_contract_allocations (
      contract_id, project_id, quantity_tons, allocation_date, status,
      purchase_order_no, memo, created_by
    ) values (
      p_contract_id, p_project_id, p_quantity_tons, p_allocation_date, p_status,
      nullif(btrim(p_purchase_order_no), ''), nullif(btrim(p_memo), ''), auth.uid()
    ) returning * into v_result;
  else
    if v_existing.status = 'cancelled' then
      raise exception '취소된 배정은 수정할 수 없습니다.' using errcode = '22023';
    end if;
    update public.material_contract_allocations
    set project_id = p_project_id,
        quantity_tons = p_quantity_tons,
        allocation_date = p_allocation_date,
        status = p_status,
        purchase_order_no = nullif(btrim(p_purchase_order_no), ''),
        memo = nullif(btrim(p_memo), '')
    where id = p_allocation_id and contract_id = p_contract_id
    returning * into v_result;
  end if;

  return v_result;
end;
$$;

revoke all on function public.save_material_contract_allocation(uuid, uuid, bigint, numeric, date, text, text, text, boolean) from public, anon;
grant execute on function public.save_material_contract_allocation(uuid, uuid, bigint, numeric, date, text, text, text, boolean) to authenticated;

commit;
