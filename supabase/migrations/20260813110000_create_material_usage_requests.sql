begin;

create table if not exists public.material_usage_requests (
  id uuid primary key default gen_random_uuid(),
  material_code text not null references public.lme_materials(code) on update cascade on delete restrict,
  allocation_type text not null check (allocation_type in ('project','factory','as','sample','etc')),
  project_id bigint references public.projects(id) on update cascade on delete restrict,
  destination_name text,
  quantity_tons numeric(16,4) not null check (quantity_tons > 0),
  purchase_order_no text,
  usage_date date not null,
  memo text,
  status text not null default 'active' check (status in ('active','cancelled')),
  created_by uuid not null references auth.users(id) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on update cascade on delete restrict,
  updated_at timestamptz not null default now(),
  constraint material_usage_requests_target_check check (
    (allocation_type = 'project' and project_id is not null and destination_name is null)
    or (allocation_type = 'factory' and project_id is null and destination_name is null)
    or (allocation_type in ('as','sample','etc') and project_id is null and nullif(btrim(destination_name),'') is not null)
  ),
  constraint material_usage_requests_text_check check (
    (destination_name is null or char_length(destination_name) <= 200)
    and (purchase_order_no is null or char_length(purchase_order_no) <= 100)
    and (memo is null or char_length(memo) <= 2000)
  )
);

alter table public.material_contract_allocations
  add column if not exists usage_request_id uuid references public.material_usage_requests(id) on update cascade on delete restrict;

create index if not exists material_usage_requests_material_status_idx on public.material_usage_requests(material_code, status, usage_date desc);
create index if not exists material_usage_requests_project_idx on public.material_usage_requests(project_id) where project_id is not null;
create index if not exists material_contract_allocations_usage_request_idx on public.material_contract_allocations(usage_request_id, status) where usage_request_id is not null;

alter table public.material_usage_requests enable row level security;
create policy material_usage_requests_select_approved on public.material_usage_requests for select to authenticated using (public.is_approved_erp_user());
revoke all on public.material_usage_requests from anon, authenticated;
grant select on public.material_usage_requests to authenticated;

create or replace function public.get_material_usage_requests(p_project_id bigint default null)
returns table (
  id uuid, material_code text, allocation_type text, project_id bigint, destination_name text,
  quantity_tons numeric, purchase_order_no text, usage_date date, memo text, status text,
  allocated_tons numeric, unallocated_tons numeric, allocation_state text, created_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.id, r.material_code, r.allocation_type, r.project_id, r.destination_name,
    r.quantity_tons, r.purchase_order_no, r.usage_date, r.memo, r.status,
    coalesce(sum(a.quantity_tons) filter (where a.status in ('planned','confirmed')),0)::numeric,
    greatest(r.quantity_tons - coalesce(sum(a.quantity_tons) filter (where a.status in ('planned','confirmed')),0),0)::numeric,
    case when coalesce(sum(a.quantity_tons) filter (where a.status in ('planned','confirmed')),0) <= 0 then 'unallocated'
      when coalesce(sum(a.quantity_tons) filter (where a.status in ('planned','confirmed')),0) + 0.00005 < r.quantity_tons then 'partially_allocated'
      else 'fully_allocated' end,
    r.created_at
  from public.material_usage_requests r
  left join public.material_contract_allocations a on a.usage_request_id = r.id
  where public.is_approved_erp_user() and (p_project_id is null or r.project_id = p_project_id)
  group by r.id order by r.usage_date desc, r.created_at desc
$$;

create or replace function public.create_material_usage_request(
  p_starting_contract_id uuid, p_allocation_type text, p_project_id bigint, p_destination_name text,
  p_quantity_tons numeric, p_usage_date date, p_status text, p_purchase_order_no text, p_memo text,
  p_strategy text, p_expected_starting_available numeric default null, p_increase_reason text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_employee public.employees%rowtype; v_start public.raw_material_contracts%rowtype; v_request_id uuid;
  v_contract record; v_allocated numeric(16,4) := 0; v_available numeric(16,4); v_take numeric(16,4);
  v_start_available numeric(16,4); v_increase numeric(16,4) := 0; v_allocation_id uuid; v_plan jsonb := '[]'::jsonb;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role <> 'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  if p_strategy not in ('auto_split','increase_contract','leave_unallocated') then raise exception '배정 전략을 확인해주세요.' using errcode='22023'; end if;
  if p_status not in ('planned','confirmed') or p_quantity_tons is null or p_quantity_tons <= 0 or p_quantity_tons <> round(p_quantity_tons,4) then raise exception '요청량 또는 상태를 확인해주세요.' using errcode='22023'; end if;
  select * into v_start from public.raw_material_contracts where id=p_starting_contract_id;
  if not found or v_start.status <> 'active' then raise exception '활성 계약을 찾을 수 없습니다.' using errcode='P0002'; end if;
  if p_allocation_type='project' and (p_project_id is null or not exists(select 1 from public.projects where id=p_project_id)) then raise exception '유효한 프로젝트가 필요합니다.' using errcode='22023'; end if;
  if p_allocation_type not in ('project','factory','as','sample','etc') then raise exception '사용 구분을 확인해주세요.' using errcode='22023'; end if;
  perform 1 from public.raw_material_contracts where material_code=v_start.material_code and status='active' order by id for update;
  select * into v_start from public.raw_material_contracts where id=p_starting_contract_id;
  select greatest(v_start.contract_quantity_ton-coalesce(sum(a.quantity_tons) filter(where a.status in ('planned','confirmed')),0),0)
    into v_start_available from public.raw_material_contracts c left join public.material_contract_allocations a on a.contract_id=c.id where c.id=v_start.id group by c.id;
  if p_expected_starting_available is not null and abs(v_start_available-p_expected_starting_available)>0.00005 then raise exception '계약 가용량이 변경되었습니다. 배정 계획을 다시 확인해주세요.' using errcode='40001'; end if;

  if p_strategy='increase_contract' then
    v_increase := greatest(p_quantity_tons-v_start_available,0);
    if v_increase > 0 and nullif(btrim(p_increase_reason),'') is null then raise exception '계약 증액 사유가 필요합니다.' using errcode='22023'; end if;
    if v_increase > 0 then
      perform set_config('app.material_contract_quantity_increase','on',true);
      update public.raw_material_contracts set contract_quantity_ton=contract_quantity_ton+v_increase, remaining_quantity_ton=remaining_quantity_ton+v_increase, updated_by=auth.uid() where id=v_start.id;
      perform set_config('app.material_contract_quantity_increase','off',true);
      insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
      values('material_contract_quantity_increased','material_contract_quantity_increased','raw_material_contract',v_employee.id,v_employee.name,v_employee.email,'원자재 계약 물량 증액',btrim(p_increase_reason),jsonb_build_object('contract_id',v_start.id,'before_quantity_ton',v_start.contract_quantity_ton,'increase_quantity_ton',v_increase,'after_quantity_ton',v_start.contract_quantity_ton+v_increase,'reason',btrim(p_increase_reason)));
      v_start_available := v_start_available+v_increase;
    end if;
  end if;

  insert into public.material_usage_requests(material_code,allocation_type,project_id,destination_name,quantity_tons,purchase_order_no,usage_date,memo,created_by)
  values(v_start.material_code,p_allocation_type,case when p_allocation_type='project' then p_project_id end,case when p_allocation_type in ('as','sample','etc') then nullif(btrim(p_destination_name),'') end,p_quantity_tons,nullif(btrim(p_purchase_order_no),''),p_usage_date,nullif(btrim(p_memo),''),auth.uid()) returning id into v_request_id;

  for v_contract in
    select c.*, greatest(c.contract_quantity_ton-coalesce(sum(a.quantity_tons) filter(where a.status in ('planned','confirmed')),0),0)::numeric(16,4) available
    from public.raw_material_contracts c left join public.material_contract_allocations a on a.contract_id=c.id
    where c.material_code=v_start.material_code and c.status='active' and (p_strategy='auto_split' or c.id=v_start.id)
    group by c.id order by case when c.id=v_start.id then 0 else 1 end,c.effective_start_date,c.id
  loop
    exit when v_allocated >= p_quantity_tons;
    if v_contract.id <> v_start.id then
      perform 1 from public.raw_material_contracts where id=v_contract.id for update;
      select greatest(c.contract_quantity_ton-coalesce(sum(a.quantity_tons) filter(where a.status in ('planned','confirmed')),0),0)
      into v_available from public.raw_material_contracts c left join public.material_contract_allocations a on a.contract_id=c.id where c.id=v_contract.id group by c.id;
    else v_available := greatest(v_start_available,0); end if;
    v_take := least(v_available,p_quantity_tons-v_allocated);
    if v_take <= 0 then continue; end if;
    insert into public.material_contract_allocations(contract_id,usage_request_id,allocation_type,project_id,destination_name,quantity_tons,allocation_date,status,purchase_order_no,memo,created_by)
    values(v_contract.id,v_request_id,p_allocation_type,case when p_allocation_type='project' then p_project_id end,case when p_allocation_type in ('as','sample','etc') then nullif(btrim(p_destination_name),'') end,v_take,p_usage_date,p_status,null,null,auth.uid()) returning id into v_allocation_id;
    perform public.record_material_allocation_activity(v_contract.id,v_allocation_id,'material_allocation_created','사용요청 계약 배정',null,'배정',null,jsonb_build_object('usage_request_id',v_request_id,'quantity_tons',v_take,'status',p_status),null,to_char(v_take,'FM999999999990.0000')||'t');
    v_plan := v_plan || jsonb_build_array(jsonb_build_object('contract_id',v_contract.id,'allocation_id',v_allocation_id,'quantity_tons',v_take,'price_krw_per_kg',v_contract.contract_price_krw_per_kg));
    v_allocated := v_allocated+v_take;
  end loop;
  return jsonb_build_object('usage_request_id',v_request_id,'requested_tons',p_quantity_tons,'allocated_tons',v_allocated,'unallocated_tons',greatest(p_quantity_tons-v_allocated,0),'allocations',v_plan,'increased_tons',v_increase);
end;
$$;

create or replace function public.allocate_material_usage_request(
  p_usage_request_id uuid, p_contract_id uuid, p_quantity_tons numeric, p_status text, p_expected_available numeric default null
) returns public.material_contract_allocations language plpgsql security definer set search_path=public,pg_temp as $$
declare v_employee public.employees%rowtype; v_request public.material_usage_requests%rowtype; v_contract public.raw_material_contracts%rowtype; v_available numeric(16,4); v_allocated numeric(16,4); v_result public.material_contract_allocations%rowtype;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role<>'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into v_request from public.material_usage_requests where id=p_usage_request_id and status='active' for update;
  if not found then raise exception '사용요청을 찾을 수 없습니다.' using errcode='P0002'; end if;
  select * into v_contract from public.raw_material_contracts where id=p_contract_id and material_code=v_request.material_code and status='active' for update;
  if not found then raise exception '동일 원자재의 활성 계약이 필요합니다.' using errcode='P0002'; end if;
  if p_status not in ('planned','confirmed') or p_quantity_tons is null or p_quantity_tons<=0 or p_quantity_tons<>round(p_quantity_tons,4) then raise exception '배정값을 확인해주세요.' using errcode='22023'; end if;
  select greatest(v_contract.contract_quantity_ton-coalesce(sum(quantity_tons) filter(where status in ('planned','confirmed')),0),0) into v_available from public.material_contract_allocations where contract_id=v_contract.id;
  select coalesce(sum(quantity_tons) filter(where status in ('planned','confirmed')),0) into v_allocated from public.material_contract_allocations where usage_request_id=v_request.id;
  if p_expected_available is not null and abs(v_available-p_expected_available)>0.00005 then raise exception '계약 가용량이 변경되었습니다. 배정 계획을 다시 확인해주세요.' using errcode='40001'; end if;
  if p_quantity_tons>v_available+0.00005 or v_allocated+p_quantity_tons>v_request.quantity_tons+0.00005 then raise exception '가용량 또는 미배정량을 초과할 수 없습니다.' using errcode='23514'; end if;
  insert into public.material_contract_allocations(contract_id,usage_request_id,allocation_type,project_id,destination_name,quantity_tons,allocation_date,status,created_by)
  values(v_contract.id,v_request.id,v_request.allocation_type,v_request.project_id,v_request.destination_name,p_quantity_tons,v_request.usage_date,p_status,auth.uid()) returning * into v_result;
  perform public.record_material_allocation_activity(v_contract.id,v_result.id,'material_allocation_created','미배정 물량 추가 배정',null,'배정',null,jsonb_build_object('usage_request_id',v_request.id,'quantity_tons',p_quantity_tons,'status',p_status),null,to_char(p_quantity_tons,'FM999999999990.0000')||'t');
  return v_result;
end; $$;

create or replace function public.update_material_usage_request_quantity(p_usage_request_id uuid,p_quantity_tons numeric)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_request public.material_usage_requests%rowtype; v_allocated numeric(16,4); begin
  if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into v_request from public.material_usage_requests where id=p_usage_request_id and status='active' for update;
  if not found or p_quantity_tons is null or p_quantity_tons<=0 or p_quantity_tons<>round(p_quantity_tons,4) then raise exception '요청량을 확인해주세요.' using errcode='22023'; end if;
  select coalesce(sum(quantity_tons) filter(where status in ('planned','confirmed')),0) into v_allocated from public.material_contract_allocations where usage_request_id=v_request.id;
  if p_quantity_tons+0.00005<v_allocated then raise exception '요청량은 현재 유효 배정량보다 작을 수 없습니다.' using errcode='23514'; end if;
  update public.material_usage_requests set quantity_tons=p_quantity_tons,updated_by=auth.uid(),updated_at=now() where id=v_request.id;
end; $$;

create or replace function public.prepare_raw_material_contract()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then new.remaining_quantity_ton:=new.contract_quantity_ton;
  else
    if new.supplier_id is distinct from old.supplier_id or new.material_code is distinct from old.material_code or new.contract_name is distinct from old.contract_name or new.contract_year is distinct from old.contract_year or new.contract_price_krw_per_kg is distinct from old.contract_price_krw_per_kg or new.processing_cost_krw_per_kg is distinct from old.processing_cost_krw_per_kg or new.effective_start_date is distinct from old.effective_start_date or new.effective_end_date is distinct from old.effective_end_date or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then raise exception 'Core contract terms are immutable. Register a new contract instead.' using errcode='55000'; end if;
    if new.contract_quantity_ton is distinct from old.contract_quantity_ton and coalesce(current_setting('app.material_contract_quantity_increase',true),'')<>'on' then raise exception '계약 물량은 증액 RPC로만 변경할 수 있습니다.' using errcode='55000'; end if;
    if new.contract_quantity_ton < old.contract_quantity_ton then raise exception '계약 물량은 감소시킬 수 없습니다.' using errcode='22023'; end if;
    new.updated_at:=now(); new.updated_by:=auth.uid();
  end if; return new;
end; $$;

revoke all on function public.get_material_usage_requests(bigint), public.create_material_usage_request(uuid,text,bigint,text,numeric,date,text,text,text,text,numeric,text), public.allocate_material_usage_request(uuid,uuid,numeric,text,numeric), public.update_material_usage_request_quantity(uuid,numeric) from public,anon;
grant execute on function public.get_material_usage_requests(bigint), public.create_material_usage_request(uuid,text,bigint,text,numeric,date,text,text,text,text,numeric,text), public.allocate_material_usage_request(uuid,uuid,numeric,text,numeric), public.update_material_usage_request_quantity(uuid,numeric) to authenticated;
alter table public.material_usage_requests replica identity full;
do $$ begin if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='material_usage_requests') then alter publication supabase_realtime add table public.material_usage_requests; end if; exception when undefined_object then null; end $$;
notify pgrst,'reload schema';
commit;
