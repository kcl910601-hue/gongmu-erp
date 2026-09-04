create or replace function public.create_unallocated_factory_material_usage_request(
  p_material_code text,
  p_quantity_tons numeric,
  p_usage_date date,
  p_purchase_order_no text default null,
  p_memo text default null
) returns public.material_usage_requests
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_employee public.employees%rowtype;
  v_request public.material_usage_requests%rowtype;
begin
  select * into v_employee from public.employees
  where auth_user_id = auth.uid() and active = true and approval_status = 'approved';
  if v_employee.id is null or v_employee.role <> 'admin' then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;
  if upper(btrim(coalesce(p_material_code, ''))) <> 'AL' then
    raise exception '알루미늄 발주만 등록할 수 있습니다.' using errcode = '22023';
  end if;
  if p_quantity_tons is null or p_quantity_tons <= 0 or p_quantity_tons <> round(p_quantity_tons, 4) or p_usage_date is null then
    raise exception '발주량 또는 사용일을 확인해주세요.' using errcode = '22023';
  end if;
  if char_length(coalesce(nullif(btrim(p_purchase_order_no), ''), '')) > 100 or char_length(coalesce(nullif(btrim(p_memo), ''), '')) > 2000 then
    raise exception '발주번호 또는 메모 길이를 확인해주세요.' using errcode = '22023';
  end if;

  insert into public.material_usage_requests(
    material_code, allocation_type, project_id, destination_name, quantity_tons,
    purchase_order_no, usage_date, memo, created_by
  ) values (
    'AL', 'factory', null, null, p_quantity_tons,
    nullif(btrim(p_purchase_order_no), ''), p_usage_date, nullif(btrim(p_memo), ''), auth.uid()
  ) returning * into v_request;
  return v_request;
end;
$$;

revoke all on function public.create_unallocated_factory_material_usage_request(text,numeric,date,text,text) from public;
grant execute on function public.create_unallocated_factory_material_usage_request(text,numeric,date,text,text) to authenticated;
grant execute on function public.create_unallocated_factory_material_usage_request(text,numeric,date,text,text) to service_role;
