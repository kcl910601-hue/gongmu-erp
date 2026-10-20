-- Prepared only. Apply separately after review; existing actual costs are unchanged.
begin;

create table public.coating_plans (
  id uuid primary key,
  project_id bigint not null references public.projects(id) on delete restrict,
  vendor_organization_id bigint not null references public.organizations(id) on delete restrict,
  weight_basis text not null check (weight_basis in ('ordered', 'allocated')),
  pricing_unit text not null check (pricing_unit in ('kg', 'm')),
  target_weight_kg numeric(16,1) not null check (target_weight_kg > 0),
  pricing_quantity numeric(16,3) not null check (pricing_quantity > 0),
  unit_price_krw numeric(16,2) not null check (unit_price_krw > 0),
  expected_amount_krw bigint not null check (expected_amount_krw between 1 and 9007199254740991),
  sources jsonb not null check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) > 0),
  memo text check (memo is null or char_length(memo) <= 2000),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coating_plans_project_status_idx on public.coating_plans(project_id, status);
alter table public.coating_plans enable row level security;
create policy coating_plans_read on public.coating_plans for select to authenticated
  using (public.is_approved_erp_user());
revoke all on public.coating_plans from anon, authenticated;
grant select on public.coating_plans to authenticated;

-- One row per AL usage request. Never add the requested weight to allocated weight.
create function public.coating_source_snapshots(p_project_id bigint) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(source || jsonb_build_object('fingerprint', md5(source::text)) order by source->>'requestId'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'requestId', r.id, 'groupId', r.material_usage_group_id,
      'groupName', coalesce(g.name, '차수 미지정'),
      'purchaseOrderNo', r.purchase_order_no, 'usageDate', r.usage_date,
      'orderedKg', r.quantity_tons * 1000,
      'plannedKg', coalesce(sum(a.quantity_tons) filter (where a.status = 'planned'), 0) * 1000,
      'confirmedKg', coalesce(sum(a.quantity_tons) filter (where a.status = 'confirmed'), 0) * 1000,
      'allocatedKg', coalesce(sum(a.quantity_tons), 0) * 1000
    ) as source
    from public.material_usage_requests r
    left join public.material_usage_groups g on g.id = r.material_usage_group_id
    left join public.material_contract_allocations a on a.usage_request_id = r.id
      and a.status in ('planned', 'confirmed')
    where public.is_approved_erp_user() and r.project_id = p_project_id
      and r.allocation_type = 'project' and r.material_code = 'AL' and r.status = 'active'
    group by r.id, g.name
  ) sources;
$$;

create function public.get_coating_plan_context(p_project_id bigint) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if not public.is_approved_erp_user() then raise exception '승인된 사용자만 조회할 수 있습니다.' using errcode = '42501'; end if;
  if not exists(select 1 from public.projects where id = p_project_id) then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
  select jsonb_build_object(
    'sources', public.coating_source_snapshots(p_project_id),
    'plans', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('vendor_name', o.name) order by p.created_at desc)
      from public.coating_plans p join public.organizations o on o.id = p.vendor_organization_id where p.project_id = p_project_id), '[]'::jsonb),
    'vendors', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'is_active', is_active) order by name)
      from public.organizations where partner_type = 'coating'), '[]'::jsonb),
    'actualCostKrw', coalesce((select sum(a.allocated_supply_amount_krw)
      from public.coating_cost_allocations a join public.coating_cost_statements s on s.id = a.statement_id
      where a.project_id = p_project_id and a.status = 'active' and s.status = 'active'), 0)
  ) into result;
  return result;
end;
$$;

-- All writes go through this RPC: version checks, capacity checks and snapshots are atomic.
create function public.save_coating_plan(
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

revoke all on function public.coating_source_snapshots(bigint), public.get_coating_plan_context(bigint), public.save_coating_plan(uuid,integer,bigint,bigint,text,text,numeric,numeric,jsonb,text,boolean) from public, anon;
grant execute on function public.coating_source_snapshots(bigint), public.get_coating_plan_context(bigint), public.save_coating_plan(uuid,integer,bigint,bigint,text,text,numeric,numeric,jsonb,text,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
