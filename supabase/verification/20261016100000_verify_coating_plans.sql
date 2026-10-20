-- Execute as the database operator. All test rows and audit records are rolled back.
begin;
create temporary table coating_plan_checks(name text, passed boolean) on commit drop;
grant insert, select on coating_plan_checks to authenticated;
select set_config('request.jwt.claim.sub', (
  select auth_user_id::text from public.employees where role = 'admin' and active
    and approval_status = 'approved' and auth_user_id is not null limit 1
), true);
set local role authenticated;

do $$
declare
  pid bigint; vid bigint; rid uuid; sid uuid := gen_random_uuid(); mid uuid := gen_random_uuid();
  snapshot jsonb; input jsonb; changed_input jsonb; ctx jsonb; weight numeric;
  row_data public.coating_plans%rowtype; failed boolean;
begin
  select project_id, id into pid, rid from public.material_usage_requests
    where material_code = 'AL' and allocation_type = 'project' and status = 'active' and quantity_tons >= 0.001
    and not exists(select 1 from public.coating_plans p where p.project_id = material_usage_requests.project_id and p.status = 'active')
    order by id limit 1;
  select id into vid from public.organizations where partner_type = 'coating' and is_active order by id limit 1;
  if pid is null or vid is null then raise exception '검증할 활성 AL 발주 또는 도장업체가 없습니다.'; end if;
  ctx := public.get_coating_plan_context(pid);
  select value into snapshot from jsonb_array_elements(ctx->'sources') where value->>'requestId' = rid::text;
  if snapshot is null then raise exception '발주 중량 조회 실패'; end if;
  if (snapshot->>'allocatedKg')::numeric <> (snapshot->>'plannedKg')::numeric + (snapshot->>'confirmedKg')::numeric then raise exception '배정 중량 합계 오류'; end if;
  insert into coating_plan_checks values ('승인 사용자 조회·발주/예정/확정 중량', true);
  weight := least(10, floor((snapshot->>'orderedKg')::numeric / 4 * 10) / 10);
  input := jsonb_build_array(jsonb_build_object('requestId', rid, 'weightKg', weight, 'snapshot', snapshot));

  row_data := public.save_coating_plan(sid, 0, pid, vid, 'ordered', 'kg', null, 1500, input, 'rollback verification');
  if row_data.expected_amount_krw <> round(weight * 1500) or row_data.target_weight_kg <> weight or row_data.version <> 1 then raise exception 'kg 계산 저장 실패'; end if;
  insert into coating_plan_checks values ('kg 단가 등록·서버 금액 계산', true);

  begin
    perform public.save_coating_plan(sid, 0, pid, vid, 'ordered', 'kg', null, 1500, input, null);
    raise exception '구버전 저장이 차단되지 않았습니다.';
  exception when serialization_failure then insert into coating_plan_checks values ('동시 수정·중복 등록 차단', true);
  end;
  changed_input := jsonb_set(input, '{0,snapshot,fingerprint}', '"outdated"'::jsonb);
  begin
    perform public.save_coating_plan(mid, 0, pid, vid, 'ordered', 'kg', null, 1500, changed_input, null);
    raise exception '오래된 원본이 차단되지 않았습니다.';
  exception when serialization_failure then insert into coating_plan_checks values ('오래된 원본 중량 차단', true);
  end;
  changed_input := jsonb_set(input, '{0,weightKg}', snapshot->'orderedKg');
  begin
    perform public.save_coating_plan(mid, 0, pid, vid, 'ordered', 'kg', null, 1500, changed_input, null);
    raise exception '초과 배정이 차단되지 않았습니다.';
  exception when check_violation then insert into coating_plan_checks values ('기배정 물량 포함 잔량 초과 차단', true);
  end;
  failed := false;
  begin perform public.save_coating_plan(mid, 0, pid, vid, 'ordered', 'kg', null, 1500, input || input, null);
  exception when raise_exception then failed := true;
  end;
  if not failed then raise exception '동일 발주 중복 선택 차단 실패'; end if;
  insert into coating_plan_checks values ('동일 발주 중복 선택 차단', true);

  row_data := public.save_coating_plan(sid, 1, pid, vid, 'ordered', 'm', 12.345, 1234.56, input, 'rollback verification');
  if row_data.expected_amount_krw <> 15241 or row_data.pricing_quantity <> 12.345 or row_data.target_weight_kg <> weight or row_data.sources <> input then raise exception 'm 계산 또는 중량 보존 실패'; end if;
  insert into coating_plan_checks values ('m 단가 수정·별도 중량 보존', true);
  row_data := public.save_coating_plan(sid, 2, pid, null, null, null, null, null, '[]', null, true);
  if row_data.status <> 'cancelled' or row_data.version <> 3 then raise exception '취소 실패'; end if;
  row_data := public.save_coating_plan(mid, 0, pid, vid, 'ordered', 'kg', null, 1500,
    jsonb_set(input, '{0,weightKg}', snapshot->'orderedKg'), 'rollback verification');
  insert into coating_plan_checks values ('취소 후 잔량 복원', true);
  if (public.get_coating_plan_context(pid)->>'actualCostKrw')::numeric <> (ctx->>'actualCostKrw')::numeric then raise exception '실제원가가 변경되었습니다.'; end if;
  insert into coating_plan_checks values ('예상금액·실제원가 분리', true);
  if has_table_privilege('authenticated', 'public.coating_plans', 'INSERT') or has_table_privilege('authenticated', 'public.coating_plans', 'UPDATE') or has_table_privilege('authenticated', 'public.coating_plans', 'DELETE') then raise exception '직접 쓰기 권한이 열려 있습니다.'; end if;
  if has_function_privilege('anon', 'public.save_coating_plan(uuid,integer,bigint,bigint,text,text,numeric,numeric,jsonb,text,boolean)', 'EXECUTE') then raise exception '익명 실행 권한이 열려 있습니다.'; end if;
  insert into coating_plan_checks values ('직접 쓰기·익명 RPC 차단', true);
end;
$$;

-- No employee is associated with this random subject; no existing account is modified.
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
do $$ begin
  begin perform public.get_coating_plan_context(1); raise exception '미승인 사용자 조회 차단 실패';
  exception when insufficient_privilege then insert into coating_plan_checks values ('미승인 사용자 조회 차단', true); end;
  begin perform public.save_coating_plan(gen_random_uuid(), 0, 1, null, null, null, null, null, '[]', null); raise exception '미승인 사용자 저장 차단 실패';
  exception when insufficient_privilege then insert into coating_plan_checks values ('미승인 사용자 저장 차단', true); end;
end $$;
select * from coating_plan_checks order by name;
rollback;
