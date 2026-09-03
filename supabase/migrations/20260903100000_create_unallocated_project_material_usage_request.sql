create or replace function public.create_unallocated_project_material_usage_request(
  p_project_id bigint,
  p_material_code text,
  p_quantity_tons numeric,
  p_usage_date date,
  p_purchase_order_no text default null,
  p_memo text default null,
  p_material_usage_group_id uuid default null
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
  if not exists(select 1 from public.projects where id = p_project_id) then
    raise exception '유효한 프로젝트가 필요합니다.' using errcode = '22023';
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
  if p_material_usage_group_id is not null and not exists (
    select 1 from public.material_usage_groups
    where id = p_material_usage_group_id and project_id = p_project_id and is_active = true
  ) then
    raise exception '프로젝트의 활성 사용 구분을 확인해주세요.' using errcode = '22023';
  end if;

  insert into public.material_usage_requests(
    material_code, allocation_type, project_id, quantity_tons, purchase_order_no,
    usage_date, memo, material_usage_group_id, created_by
  ) values (
    'AL', 'project', p_project_id, p_quantity_tons, nullif(btrim(p_purchase_order_no), ''),
    p_usage_date, nullif(btrim(p_memo), ''), p_material_usage_group_id, auth.uid()
  ) returning * into v_request;
  return v_request;
end;
$$;

revoke all on function public.create_unallocated_project_material_usage_request(bigint,text,numeric,date,text,text,uuid) from public;
grant execute on function public.create_unallocated_project_material_usage_request(bigint,text,numeric,date,text,text,uuid) to authenticated;
grant execute on function public.create_unallocated_project_material_usage_request(bigint,text,numeric,date,text,text,uuid) to service_role;
