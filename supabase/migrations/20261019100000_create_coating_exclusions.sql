begin;

create table public.coating_exclusions (
  request_id uuid primary key references public.material_usage_requests(id) on delete restrict,
  project_id bigint not null references public.projects(id) on delete restrict,
  weight_kg numeric(16,1) not null check (weight_kg >= 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  version integer not null default 1 check (version > 0),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);
create index coating_exclusions_project_idx on public.coating_exclusions(project_id);
alter table public.coating_exclusions enable row level security;
create policy coating_exclusions_read on public.coating_exclusions for select to authenticated
  using (public.is_approved_erp_user());
revoke all on public.coating_exclusions from anon, authenticated;
grant select on public.coating_exclusions to authenticated;

create function public.save_coating_exclusion(
  p_project_id bigint, p_request_id uuid, p_version integer,
  p_weight_kg numeric, p_reason text, p_fingerprint text
) returns public.coating_exclusions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  old_row public.coating_exclusions%rowtype;
  result public.coating_exclusions%rowtype;
  source jsonb;
  used_weight numeric;
  employee public.employees%rowtype;
begin
  if not public.is_approved_admin() or public.is_calendar_only_staff() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;
  if p_weight_kg is null or p_weight_kg < 0 or p_weight_kg > 999999999999999.9 or p_weight_kg <> round(p_weight_kg, 1)
    or p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then
    raise exception '0 이상인 0.1kg 단위 중량과 제외·해제 사유를 입력해주세요.';
  end if;
  -- Same lock order as save_coating_plan: project, request, allocations.
  perform pg_advisory_xact_lock(hashtextextended('coating-plan:' || p_project_id::text, 0));
  perform 1 from public.material_usage_requests where id = p_request_id and project_id = p_project_id for update;
  if not found then raise exception '이 현장의 발주를 찾을 수 없습니다.'; end if;
  perform 1 from public.material_contract_allocations where usage_request_id = p_request_id order by id for share;
  select * into old_row from public.coating_exclusions where request_id = p_request_id for update;
  if p_version is null or p_version <> coalesce(old_row.version, 0) then
    raise exception '다른 사용자가 변경했습니다. 다시 조회해주세요.' using errcode = '40001';
  end if;
  if p_weight_kg > 0 then
    select value into source from jsonb_array_elements(public.coating_source_snapshots(p_project_id))
      where value->>'requestId' = p_request_id::text;
    if source is null or (source->>'fingerprint') is distinct from p_fingerprint then
      raise exception '원본 정보가 변경되었습니다. 다시 조회해주세요.' using errcode = '40001';
    end if;
    select coalesce(sum((s->>'weightKg')::numeric), 0) into used_weight
      from public.coating_plans p cross join lateral jsonb_array_elements(p.sources) s
      where p.project_id = p_project_id and p.status = 'active' and s->>'requestId' = p_request_id::text;
    if p_weight_kg + used_weight > (source->>'allocatedKg')::numeric then
      raise exception '압출 배정 중량에서 도장 배정한 물량을 제외한 잔량을 초과했습니다.' using errcode = '23514';
    end if;
  end if;
  insert into public.coating_exclusions(request_id, project_id, weight_kg, reason, version, updated_by)
    values(p_request_id, p_project_id, p_weight_kg, btrim(p_reason), 1, auth.uid())
    on conflict (request_id) do update set weight_kg = excluded.weight_kg, reason = excluded.reason,
      version = coating_exclusions.version + 1, updated_by = auth.uid(), updated_at = now()
    returning * into result;
  select * into employee from public.employees where auth_user_id = auth.uid() and active and approval_status = 'approved';
  insert into public.activity_logs(activity_type, action_type, target_type, target_id, project_id, employee_id, employee_name, employee_email, title, metadata)
    values('coating_exclusion_update', 'coating_exclusion_update', 'project', p_project_id, p_project_id,
      employee.id, employee.name, employee.email,
      case when p_weight_kg = 0 then '도장 제외 해제' else '도장 제외 물량 변경' end,
      jsonb_build_object('request_id', p_request_id, 'before', case when old_row.request_id is null then null else to_jsonb(old_row) end, 'after', to_jsonb(result)));
  return result;
end;
$$;

revoke all on function public.save_coating_exclusion(bigint,uuid,integer,numeric,text,text) from public, anon;
grant execute on function public.save_coating_exclusion(bigint,uuid,integer,numeric,text,text) to authenticated;

-- The revised save_coating_plan below also subtracts excluded weight for both bases.
create or replace function public.save_coating_plan(
  p_id uuid, p_version integer, p_project_id bigint, p_vendor_id bigint,
  p_weight_basis text, p_unit text, p_length_m numeric, p_unit_price numeric,
  p_sources jsonb, p_memo text, p_cancel boolean default false
) returns public.coating_plans
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  old_row public.coating_plans%rowtype;
  result public.coating_plans%rowtype;
  employee public.employees%rowtype;
  source jsonb; current_source jsonb; snapshots jsonb;
  saved_sources jsonb := '[]'::jsonb;
  request_ids uuid[]; weight numeric; used_weight numeric; capacity numeric;
  total_weight numeric := 0; quantity numeric; amount numeric;
begin
  if not public.is_approved_admin() or public.is_calendar_only_staff() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;
  if p_id is null or p_version is null or p_version < 0 or p_project_id is null then raise exception '배정 정보를 확인해주세요.'; end if;
  if not exists(select 1 from public.projects where id = p_project_id) then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('coating-plan:' || p_project_id::text, 0));
  select * into old_row from public.coating_plans where id = p_id for update;
  if old_row.id is not null then
    if old_row.project_id <> p_project_id or old_row.version <> p_version or old_row.status <> 'active' then
      raise exception '다른 사용자가 변경했습니다. 다시 조회해주세요.' using errcode = '40001';
    end if;
  elsif p_version <> 0 or p_cancel then
    raise exception '배정을 찾을 수 없습니다. 다시 조회해주세요.' using errcode = '40001';
  end if;

  if p_cancel then
    update public.coating_plans set status = 'cancelled', version = version + 1, updated_at = now(), updated_by = auth.uid()
      where id = p_id returning * into result;
  else
    if not exists(select 1 from public.organizations where id = p_vendor_id and partner_type = 'coating'
      and (is_active or p_vendor_id = old_row.vendor_organization_id)) then raise exception '활성 도장업체를 선택해주세요.'; end if;
    if p_weight_basis is null or p_weight_basis not in ('ordered', 'allocated') or p_unit is null or p_unit not in ('kg', 'm') then raise exception '중량 기준과 계산 단위를 확인해주세요.'; end if;
    if p_unit_price is null or p_unit_price <= 0 or p_unit_price > 99999999999999.99 or p_unit_price <> round(p_unit_price, 2) then raise exception '단가는 0보다 큰 숫자이며 소수 둘째 자리까지 입력할 수 있습니다.'; end if;
    if p_memo is not null and char_length(p_memo) > 2000 then raise exception '메모는 2,000자 이내로 입력해주세요.'; end if;
    if p_sources is null or jsonb_typeof(p_sources) <> 'array' then raise exception '압출 발주를 선택해주세요.'; end if;
    if jsonb_array_length(p_sources) = 0 or jsonb_array_length(p_sources) > 100 then raise exception '압출 발주는 1~100건을 선택해주세요.'; end if;
    select array_agg((entry->>'requestId')::uuid order by entry->>'requestId') into request_ids from jsonb_array_elements(p_sources) entry;
    if array_position(request_ids, null) is not null or cardinality(request_ids) <> (select count(distinct id) from unnest(request_ids) id) then raise exception '중복되거나 잘못된 발주입니다.'; end if;
    -- Source mutations lock these requests too. Lock in a stable order.
    perform 1 from public.material_usage_requests where id = any(request_ids) order by id for update;
    perform 1 from public.material_contract_allocations where usage_request_id = any(request_ids) order by id for share;
    snapshots := public.coating_source_snapshots(p_project_id);
    for source in select value from jsonb_array_elements(p_sources) loop
      select value into current_source from jsonb_array_elements(snapshots) where value->>'requestId' = source->>'requestId';
      if current_source is null then raise exception '취소되었거나 이 프로젝트의 AL 발주가 아닙니다. 다시 조회해주세요.' using errcode = '40001'; end if;
      if (source->'snapshot'->>'fingerprint') is distinct from (current_source->>'fingerprint') then
        raise exception '원본 중량 또는 발주 정보가 변경되었습니다. 최신 중량을 다시 가져와 확인해주세요.' using errcode = '40001';
      end if;
      weight := (source->>'weightKg')::numeric;
      if weight is null or weight <= 0 or weight > 999999999999999.9 or weight <> round(weight, 1) then raise exception '도장 대상 중량은 0보다 큰 0.1kg 단위로 입력해주세요.'; end if;
      select coalesce(sum((s->>'weightKg')::numeric), 0) into used_weight
        from public.coating_plans p cross join lateral jsonb_array_elements(p.sources) s
        where p.project_id = p_project_id and p.status = 'active' and p.id <> p_id and s->>'requestId' = source->>'requestId';
      capacity := (current_source->>(case when p_weight_basis = 'ordered' then 'orderedKg' else 'allocatedKg' end))::numeric;
      capacity := capacity - coalesce((select weight_kg from public.coating_exclusions where request_id = (source->>'requestId')::uuid), 0);
      if used_weight + weight > capacity then raise exception '선택한 기준 중량에서 이미 도장 배정한 물량을 제외한 잔량을 초과했습니다.' using errcode = '23514'; end if;
      total_weight := total_weight + weight;
      saved_sources := saved_sources || jsonb_build_array(jsonb_build_object('requestId', source->>'requestId', 'weightKg', weight, 'snapshot', current_source));
    end loop;
    quantity := case when p_unit = 'kg' then total_weight else p_length_m end;
    if quantity is null or quantity <= 0 or quantity > 9999999999999.999 or quantity <> round(quantity, 3) then raise exception '계산 수량은 0보다 큰 숫자이며 소수 셋째 자리까지 입력할 수 있습니다.'; end if;
    amount := round(quantity * p_unit_price);
    if amount < 1 or amount > 9007199254740991 then raise exception '예상금액이 지원 범위를 벗어났습니다.'; end if;
    if old_row.id is null then
      insert into public.coating_plans(id, project_id, vendor_organization_id, weight_basis, pricing_unit, target_weight_kg, pricing_quantity, unit_price_krw, expected_amount_krw, sources, memo, created_by, updated_by)
        values(p_id, p_project_id, p_vendor_id, p_weight_basis, p_unit, total_weight, quantity, p_unit_price, amount::bigint, saved_sources, nullif(btrim(p_memo), ''), auth.uid(), auth.uid()) returning * into result;
    else
      update public.coating_plans set vendor_organization_id = p_vendor_id, weight_basis = p_weight_basis, pricing_unit = p_unit,
        target_weight_kg = total_weight, pricing_quantity = quantity, unit_price_krw = p_unit_price, expected_amount_krw = amount::bigint,
        sources = saved_sources, memo = nullif(btrim(p_memo), ''), version = version + 1, updated_at = now(), updated_by = auth.uid()
        where id = p_id returning * into result;
    end if;
  end if;
  select * into employee from public.employees where auth_user_id = auth.uid() and active and approval_status = 'approved';
  insert into public.activity_logs(activity_type, action_type, target_type, target_id, project_id, employee_id, employee_name, employee_email, title, metadata)
    values('coating_plan_update', 'coating_plan_update', 'project', p_project_id, p_project_id, employee.id, employee.name, employee.email,
      case when p_cancel then '도장 배정 취소' when old_row.id is null then '도장 배정 등록' else '도장 배정 수정' end,
      jsonb_build_object('coating_plan_id', p_id, 'before', case when old_row.id is null then null else to_jsonb(old_row) end, 'after', to_jsonb(result)));
  return result;
end;
$$;


notify pgrst, 'reload schema';
commit;
