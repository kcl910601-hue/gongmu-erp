-- Apply before deploying the contract editor. Existing amounts remain unchanged.
begin;

alter table public.project_contract_entries
  add column amount_input_mode text not null default 'delta',
  add column input_supply_amount_krw bigint,
  add column input_vat_amount_krw bigint,
  add constraint project_contract_input_check check (
    amount_input_mode in ('delta', 'total')
    and (input_supply_amount_krw is null or input_supply_amount_krw >= 0)
    and (input_vat_amount_krw is null or input_vat_amount_krw >= 0)
    and (amount_input_mode <> 'total' or (input_supply_amount_krw is not null and input_vat_amount_krw is not null))
  );

-- All browser mutations go through the atomic, permission-checking RPC below.
revoke insert, update on public.project_contract_entries from authenticated;

create or replace function public.prepare_project_contract_entry() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(new.project_id);
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.project_id is distinct from old.project_id
      or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
      raise exception '계약 식별정보와 등록 순서는 변경할 수 없습니다.' using errcode = '23514';
    end if;
    if old.status = 'void' then
      raise exception '무효 계약은 수정하거나 복원할 수 없습니다.' using errcode = '23514';
    end if;
    new.updated_by := auth.uid();
    new.updated_at := clock_timestamp();
  end if;
  new.total_amount_krw := new.supply_amount_krw + new.vat_amount_krw;
  return new;
end;
$$;

create function public.save_project_contract_entry(
  p_project_id bigint, p_id uuid, p_entry jsonb,
  p_apply boolean default false, p_revision text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor public.employees%rowtype;
  target public.project_contract_entries%rowtype;
  row_value public.project_contract_entries%rowtype;
  old_row public.project_contract_entries%rowtype;
  before_rows jsonb;
  proposed_rows jsonb;
  after_rows jsonb := '[]';
  changes jsonb := '[]';
  revision text;
  before_supply bigint;
  before_vat bigint;
  running_supply bigint := 0;
  running_vat bigint := 0;
  delta_supply bigint;
  delta_vat bigint;
  input_supply bigint;
  input_vat bigint;
  direction integer;
  original_count integer;
  is_void boolean := coalesce(p_entry->>'action', '') = 'void';
  result jsonb;
begin
  if not public.is_approved_admin() or public.is_calendar_only_staff() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;
  if p_apply is null or p_entry is null or jsonb_typeof(p_entry) <> 'object' then
    raise exception '입력값을 확인해주세요.' using errcode = '23514';
  end if;
  select * into actor from public.employees where auth_user_id = auth.uid() and active and approval_status = 'approved';
  perform pg_advisory_xact_lock(p_project_id);
  perform 1 from public.projects where id = p_project_id;
  if not found then raise exception '프로젝트를 찾을 수 없습니다.' using errcode = '23514'; end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at, e.id), '[]') into before_rows
    from public.project_contract_entries e where project_id = p_project_id;
  revision := md5(before_rows::text || p_entry::text || coalesce(p_id::text, 'new'));
  if p_apply and (p_revision is null or p_revision is distinct from revision) then
    raise exception '계약 정보가 변경되었습니다. 변경내용을 다시 확인해주세요.' using errcode = '40001';
  end if;
  select coalesce(sum(case when entry_type = 'decrease' then -supply_amount_krw else supply_amount_krw end), 0),
    coalesce(sum(case when entry_type = 'decrease' then -vat_amount_krw else vat_amount_krw end), 0)
    into before_supply, before_vat from public.project_contract_entries where project_id = p_project_id and status = 'confirmed';

  if p_id is not null then
    select * into target from public.project_contract_entries where id = p_id and project_id = p_project_id;
    if not found then raise exception '계약 이력을 찾을 수 없습니다.' using errcode = '23514'; end if;
    if target.status = 'void' then raise exception '무효 계약은 수정할 수 없습니다.' using errcode = '23514'; end if;
  else
    if is_void then raise exception '계약을 선택해주세요.' using errcode = '23514'; end if;
    target.id := gen_random_uuid(); target.project_id := p_project_id;
    target.created_by := auth.uid(); target.created_at := clock_timestamp();
    target.updated_at := target.created_at; target.status := 'confirmed';
  end if;
  if is_void then
    target.status := 'void';
  else
    if p_entry->>'entry_type' is null or p_entry->>'entry_type' not in ('original', 'increase', 'decrease')
      or p_entry->>'amount_input_mode' is null or p_entry->>'amount_input_mode' not in ('delta', 'total') then
      raise exception '계약 유형과 입력 방식을 확인해주세요.' using errcode = '23514';
    end if;
    if p_id is not null and ((target.entry_type = 'original') <> (p_entry->>'entry_type' = 'original')) then
      raise exception '최초 계약과 변경 계약 간 유형 변경은 불가능합니다.' using errcode = '23514';
    end if;
    target.entry_type := p_entry->>'entry_type';
    target.amount_input_mode := case when target.entry_type = 'original' then 'delta' else p_entry->>'amount_input_mode' end;
    if coalesce(p_entry->>'supply_amount_krw', '') !~ '^[0-9]+$' or coalesce(p_entry->>'vat_amount_krw', '') !~ '^[0-9]+$' then
      raise exception '금액은 0 이상의 정수로 입력해주세요.' using errcode = '23514';
    end if;
    target.input_supply_amount_krw := (p_entry->>'supply_amount_krw')::bigint;
    target.input_vat_amount_krw := (p_entry->>'vat_amount_krw')::bigint;
    target.supply_amount_krw := target.input_supply_amount_krw;
    target.vat_amount_krw := target.input_vat_amount_krw;
    target.contract_title := btrim(p_entry->>'contract_title');
    target.contract_date := (p_entry->>'contract_date')::date;
    target.effective_date := (p_entry->>'effective_date')::date;
    target.document_number := nullif(btrim(p_entry->>'document_number'), '');
    target.memo := nullif(btrim(p_entry->>'memo'), '');
    if coalesce(target.contract_title, '') = '' or length(target.contract_title) > 200
      or target.contract_date is null or target.effective_date is null
      or length(target.document_number) > 100 or length(target.memo) > 2000 then
      raise exception '계약 제목·날짜·문서번호·비고를 확인해주세요.' using errcode = '23514';
    end if;
  end if;
  select coalesce(jsonb_agg(value), '[]') into proposed_rows from jsonb_array_elements(before_rows) where value->>'id' <> target.id::text;
  proposed_rows := proposed_rows || jsonb_build_array(to_jsonb(target));
  select count(*) into original_count from jsonb_populate_recordset(null::public.project_contract_entries, proposed_rows)
    where status = 'confirmed' and entry_type = 'original';
  if original_count > 1 or (original_count = 0 and exists (
    select 1 from jsonb_populate_recordset(null::public.project_contract_entries, proposed_rows) where status = 'confirmed'
  )) then raise exception '유효한 최초 계약이 정확히 1건 있어야 합니다. 최초 계약 무효 처리 전 변경 계약을 먼저 무효 처리해주세요.' using errcode = '23514'; end if;

  -- Stable registration order; editing contract dates does not reorder financial history.
  for row_value in select * from jsonb_populate_recordset(null::public.project_contract_entries, proposed_rows)
    order by (entry_type = 'original') desc, created_at, id
  loop
    select * into old_row from jsonb_populate_recordset(null::public.project_contract_entries, before_rows) where id = row_value.id;
    if row_value.status = 'confirmed' then
      input_supply := coalesce(row_value.input_supply_amount_krw, row_value.supply_amount_krw);
      input_vat := coalesce(row_value.input_vat_amount_krw, row_value.vat_amount_krw);
      if row_value.amount_input_mode = 'total' and row_value.entry_type <> 'original' then
        delta_supply := input_supply - running_supply;
        delta_vat := input_vat - running_vat;
        if (delta_supply > 0 and delta_vat < 0) or (delta_supply < 0 and delta_vat > 0) then
          raise exception '총 공급가액과 총 부가세의 증감 방향이 다릅니다. 입력값을 확인해주세요: %', row_value.contract_title using errcode = '23514';
        end if;
        row_value.entry_type := case when delta_supply < 0 or (delta_supply = 0 and delta_vat < 0) then 'decrease' else 'increase' end;
        row_value.supply_amount_krw := abs(delta_supply);
        row_value.vat_amount_krw := abs(delta_vat);
      end if;
      direction := case when row_value.entry_type = 'decrease' then -1 else 1 end;
      running_supply := running_supply + direction * row_value.supply_amount_krw;
      running_vat := running_vat + direction * row_value.vat_amount_krw;
      if running_supply < 0 or running_vat < 0 or running_supply::numeric + running_vat > 9007199254740991
        or row_value.supply_amount_krw::numeric + row_value.vat_amount_krw > 9007199254740991
        or (row_value.entry_type = 'original' and row_value.supply_amount_krw <= 0) then
        raise exception '수정 후 계약금액 또는 부가세가 허용 범위를 벗어납니다: %', row_value.contract_title using errcode = '23514';
      end if;
    end if;
    row_value.total_amount_krw := row_value.supply_amount_krw + row_value.vat_amount_krw;
    if row_value.id = target.id or to_jsonb(row_value) is distinct from to_jsonb(old_row) then
      changes := changes || jsonb_build_array(jsonb_build_object(
        'id', row_value.id, 'title', row_value.contract_title, 'is_target', row_value.id = target.id,
        'mode', row_value.amount_input_mode,
        'before_delta', case when old_row.id is null then null when old_row.status = 'void' then 0 when old_row.entry_type = 'decrease' then -old_row.supply_amount_krw else old_row.supply_amount_krw end,
        'after_delta', case when row_value.status = 'void' then 0 when row_value.entry_type = 'decrease' then -row_value.supply_amount_krw else row_value.supply_amount_krw end,
        'before_vat_delta', case when old_row.id is null then null when old_row.status = 'void' then 0 when old_row.entry_type = 'decrease' then -old_row.vat_amount_krw else old_row.vat_amount_krw end,
        'after_vat_delta', case when row_value.status = 'void' then 0 when row_value.entry_type = 'decrease' then -row_value.vat_amount_krw else row_value.vat_amount_krw end,
        'resulting_supply', running_supply, 'resulting_vat', running_vat));
    end if;
    after_rows := after_rows || jsonb_build_array(to_jsonb(row_value));
  end loop;
  result := jsonb_build_object('revision', revision, 'before_supply', before_supply, 'before_vat', before_vat,
    'after_supply', running_supply, 'after_vat', running_vat, 'changes', changes);
  if not p_apply then return result; end if;

  for row_value in select * from jsonb_populate_recordset(null::public.project_contract_entries, after_rows) loop
    select * into old_row from public.project_contract_entries where id = row_value.id;
    if old_row.id is null then
      insert into public.project_contract_entries select (row_value).*;
    elsif to_jsonb(row_value) is distinct from to_jsonb(old_row) then
      update public.project_contract_entries set entry_type = row_value.entry_type, contract_title = row_value.contract_title,
        contract_date = row_value.contract_date, effective_date = row_value.effective_date,
        document_number = row_value.document_number, memo = row_value.memo, status = row_value.status,
        supply_amount_krw = row_value.supply_amount_krw, vat_amount_krw = row_value.vat_amount_krw,
        amount_input_mode = row_value.amount_input_mode, input_supply_amount_krw = row_value.input_supply_amount_krw,
        input_vat_amount_krw = row_value.input_vat_amount_krw where id = row_value.id;
    end if;
  end loop;
  insert into public.activity_logs(activity_type, action_type, target_type, project_id, employee_id, employee_name, employee_email, title, metadata)
    values ('project_contract_change', 'project_contract_change', 'project_contract_entry', p_project_id,
      actor.id, actor.name, actor.email,
      case when is_void then '계약 무효 처리' when p_id is null then '계약 등록' else '계약 수정' end,
      result || jsonb_build_object('entry_id', target.id, 'before', before_rows, 'after', after_rows));
  return result;
end;
$$;
revoke all on function public.save_project_contract_entry(bigint, uuid, jsonb, boolean, text) from public, anon;
grant execute on function public.save_project_contract_entry(bigint, uuid, jsonb, boolean, text) to authenticated;
commit;
