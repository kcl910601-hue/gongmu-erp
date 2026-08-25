begin;
alter type public.partner_type add value if not exists 'glass';
commit;
begin;
alter table public.organizations add column if not exists memo text check(memo is null or char_length(memo)<=2000);

create table public.glass_cost_statements(
 id uuid primary key default gen_random_uuid(), vendor_organization_id bigint not null references public.organizations(id) on delete restrict,
 accounting_month date not null check(accounting_month=date_trunc('month',accounting_month)::date), invoice_number text,
 supply_amount_krw bigint not null check(supply_amount_krw>=0), vat_amount_krw bigint not null default 0 check(vat_amount_krw>=0),
 total_amount_krw bigint generated always as(supply_amount_krw+vat_amount_krw) stored, status text not null default 'active' check(status in('active','void')),
 memo text check(memo is null or char_length(memo)<=2000), created_by uuid not null references auth.users(id) on delete restrict,
 updated_by uuid references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(invoice_number is null or char_length(invoice_number)<=200)
);
create table public.glass_cost_allocations(
 id uuid primary key default gen_random_uuid(), statement_id uuid not null references public.glass_cost_statements(id) on delete restrict,
 project_id bigint not null references public.projects(id) on delete restrict, allocated_supply_amount_krw bigint not null check(allocated_supply_amount_krw>0),
 status text not null default 'active' check(status in('active','void')), memo text check(memo is null or char_length(memo)<=2000),
 created_by uuid not null references auth.users(id) on delete restrict, updated_by uuid references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(statement_id,project_id)
);
create table public.glass_cost_allocation_history(
 id bigint generated always as identity primary key, allocation_id uuid not null references public.glass_cost_allocations(id) on delete restrict,
 statement_id uuid not null references public.glass_cost_statements(id) on delete restrict, project_id bigint not null references public.projects(id) on delete restrict,
 action text not null check(action in('create','update','void','restore')), before_data jsonb, after_data jsonb,
 changed_by uuid not null references auth.users(id) on delete restrict, changed_at timestamptz not null default now()
);
create index glass_cost_statements_month_idx on public.glass_cost_statements(accounting_month);
create index glass_cost_statements_vendor_month_idx on public.glass_cost_statements(vendor_organization_id,accounting_month);
create index glass_cost_statements_status_month_idx on public.glass_cost_statements(status,accounting_month);
create index glass_cost_allocations_statement_idx on public.glass_cost_allocations(statement_id);
create index glass_cost_allocations_project_status_idx on public.glass_cost_allocations(project_id,status);
create index glass_cost_allocations_project_created_idx on public.glass_cost_allocations(project_id,created_at desc);
create index glass_cost_history_allocation_changed_idx on public.glass_cost_allocation_history(allocation_id,changed_at desc);

create function public.assert_glass_vendor() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if not exists(select 1 from public.organizations where id=new.vendor_organization_id and partner_type='glass') then raise exception '유리업체만 선택할 수 있습니다.' using errcode='23514'; end if; return new; end $$;
create trigger glass_cost_statements_assert_vendor before insert or update of vendor_organization_id on public.glass_cost_statements for each row execute function public.assert_glass_vendor();

create function public.log_glass_cost_activity(p_type text,p_statement uuid,p_project bigint,p_title text,p_metadata jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.employees%rowtype; begin select * into e from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
 insert into public.activity_logs(activity_type,action_type,target_type,target_id,project_id,employee_id,employee_name,employee_email,title,metadata)
 values(p_type,p_type,'glass_cost_statement',null,p_project,e.id,e.name,e.email,p_title,coalesce(p_metadata,'{}')||jsonb_build_object('statement_id',p_statement)); end $$;
revoke all on function public.log_glass_cost_activity(text,uuid,bigint,text,jsonb) from public,anon,authenticated;

create function public.save_glass_cost_statement(p_id uuid,p_vendor bigint,p_month date,p_invoice text,p_supply bigint,p_vat bigint,p_memo text)
returns public.glass_cost_statements language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.glass_cost_statements%rowtype; result public.glass_cost_statements%rowtype; allocated bigint; begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date or p_supply is null or p_supply<0 or p_vat is null or p_vat<0 then raise exception '연월과 금액을 확인해주세요.' using errcode='22023'; end if;
 if p_id is null then
  if not exists(select 1 from public.organizations where id=p_vendor and partner_type='glass' and is_active) then raise exception '활성 유리업체를 선택해주세요.' using errcode='23514'; end if;
  insert into public.glass_cost_statements(vendor_organization_id,accounting_month,invoice_number,supply_amount_krw,vat_amount_krw,memo,created_by) values(p_vendor,p_month,nullif(btrim(p_invoice),''),p_supply,p_vat,nullif(btrim(p_memo),''),auth.uid()) returning * into result;
  perform public.log_glass_cost_activity('glass_cost_statement_create',result.id,null,'유리 계산서 등록',jsonb_build_object('after',to_jsonb(result)));
 else
  select * into old from public.glass_cost_statements where id=p_id for update; if not found or old.status<>'active' then raise exception '수정 가능한 계산서가 없습니다.' using errcode='P0002'; end if;
  select coalesce(sum(allocated_supply_amount_krw),0) into allocated from public.glass_cost_allocations where statement_id=p_id and status='active'; if p_supply<allocated then raise exception '공급가액은 배분합계보다 작을 수 없습니다.' using errcode='23514'; end if;
  if p_vendor<>old.vendor_organization_id and not exists(select 1 from public.organizations where id=p_vendor and partner_type='glass' and is_active) then raise exception '활성 유리업체를 선택해주세요.' using errcode='23514'; end if;
  update public.glass_cost_statements set vendor_organization_id=p_vendor,accounting_month=p_month,invoice_number=nullif(btrim(p_invoice),''),supply_amount_krw=p_supply,vat_amount_krw=p_vat,memo=nullif(btrim(p_memo),''),updated_by=auth.uid(),updated_at=now() where id=p_id returning * into result;
  perform public.log_glass_cost_activity('glass_cost_statement_update',result.id,null,'유리 계산서 수정',jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(result)));
 end if; return result; end $$;

create function public.void_glass_cost_statement(p_id uuid) returns public.glass_cost_statements language plpgsql security definer set search_path=public,pg_temp as $$ declare result public.glass_cost_statements%rowtype; begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 update public.glass_cost_statements set status='void',updated_by=auth.uid(),updated_at=now() where id=p_id and status='active' returning * into result; if not found then raise exception '계산서를 찾을 수 없습니다.' using errcode='P0002'; end if;
 perform public.log_glass_cost_activity('glass_cost_statement_void',result.id,null,'유리 계산서 무효','{}'); return result; end $$;

create function public.save_glass_cost_allocation(p_statement uuid,p_project bigint,p_amount bigint,p_memo text,p_action text default 'save') returns public.glass_cost_allocations language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.glass_cost_statements%rowtype; old public.glass_cost_allocations%rowtype; result public.glass_cost_allocations%rowtype; other_total bigint; history_action text; begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 select * into s from public.glass_cost_statements where id=p_statement for update; if not found or s.status<>'active' then raise exception '활성 계산서를 찾을 수 없습니다.' using errcode='P0002'; end if;
 if not exists(select 1 from public.projects where id=p_project) then raise exception '프로젝트를 찾을 수 없습니다.' using errcode='P0002'; end if;
 select * into old from public.glass_cost_allocations where statement_id=p_statement and project_id=p_project;
 if p_action='void' then if not found or old.status<>'active' then raise exception '무효 처리할 배분이 없습니다.' using errcode='P0002'; end if; update public.glass_cost_allocations set status='void',updated_by=auth.uid(),updated_at=now() where id=old.id returning * into result; history_action:='void';
 else if p_amount is null or p_amount<=0 then raise exception '배분금액은 0보다 커야 합니다.' using errcode='22023'; end if;
  select coalesce(sum(allocated_supply_amount_krw),0) into other_total from public.glass_cost_allocations where statement_id=p_statement and status='active' and (old.id is null or id<>old.id);
  if other_total+p_amount>s.supply_amount_krw then raise exception '배분합계는 공급가액을 초과할 수 없습니다.' using errcode='23514'; end if;
  if old.id is null then insert into public.glass_cost_allocations(statement_id,project_id,allocated_supply_amount_krw,memo,created_by) values(p_statement,p_project,p_amount,nullif(btrim(p_memo),''),auth.uid()) returning * into result; history_action:='create';
  else update public.glass_cost_allocations set allocated_supply_amount_krw=p_amount,memo=nullif(btrim(p_memo),''),status='active',updated_by=auth.uid(),updated_at=now() where id=old.id returning * into result; history_action:=case when old.status='void' then 'restore' else 'update' end; end if; end if;
 insert into public.glass_cost_allocation_history(allocation_id,statement_id,project_id,action,before_data,after_data,changed_by) values(result.id,p_statement,p_project,history_action,case when old.id is null then null else to_jsonb(old) end,to_jsonb(result),auth.uid());
 perform public.log_glass_cost_activity('glass_cost_allocation_'||history_action,p_statement,p_project,'유리 원가 배분 '||history_action,jsonb_build_object('allocation_id',result.id,'before',case when old.id is null then null else to_jsonb(old) end,'after',to_jsonb(result))); return result; end $$;

revoke all on function public.save_glass_cost_statement(uuid,bigint,date,text,bigint,bigint,text),public.void_glass_cost_statement(uuid),public.save_glass_cost_allocation(uuid,bigint,bigint,text,text) from public,anon;
grant execute on function public.save_glass_cost_statement(uuid,bigint,date,text,bigint,bigint,text),public.void_glass_cost_statement(uuid),public.save_glass_cost_allocation(uuid,bigint,bigint,text,text) to authenticated;
alter table public.glass_cost_statements enable row level security; alter table public.glass_cost_allocations enable row level security; alter table public.glass_cost_allocation_history enable row level security;
create policy glass_statements_read on public.glass_cost_statements for select to authenticated using(public.is_approved_erp_user()); create policy glass_allocations_read on public.glass_cost_allocations for select to authenticated using(public.is_approved_erp_user()); create policy glass_history_read on public.glass_cost_allocation_history for select to authenticated using(public.is_approved_erp_user());
revoke all on public.glass_cost_statements,public.glass_cost_allocations,public.glass_cost_allocation_history from anon,authenticated; grant select on public.glass_cost_statements,public.glass_cost_allocations,public.glass_cost_allocation_history to authenticated;

alter table public.editing_locks drop constraint if exists editing_locks_resource_type_check; alter table public.editing_locks add constraint editing_locks_resource_type_check check(resource_type in('project','task','personal_note','shipment','employee','comment','setting','material_usage_request','material_usage_group','glass_cost_statement'));
create or replace function public.assert_editing_lock_permission(p_resource_type text,p_resource_id text) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$ declare eid bigint; allowed boolean:=false; begin
 select id into eid from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved'; if eid is null then raise exception 'permission denied'; end if;
 case p_resource_type when 'project' then allowed:=p_resource_id~'^[0-9]+$' and public.can_manage_projects() and exists(select 1 from public.projects where id=p_resource_id::bigint); when 'task' then allowed:=p_resource_id~'^[0-9]+$' and public.can_edit_tasks() and exists(select 1 from public.tasks where id=p_resource_id::bigint); when 'shipment' then allowed:=p_resource_id~'^[0-9]+$' and public.can_edit_tasks() and exists(select 1 from public.shipments where id=p_resource_id::bigint); when 'employee' then allowed:=p_resource_id~'^[0-9]+$' and public.is_approved_admin(); when 'setting' then allowed:=public.can_manage_settings(); when 'comment' then allowed:=p_resource_id~'^[0-9]+$'; when 'personal_note' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$'; when 'material_usage_request' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin(); when 'material_usage_group' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin(); when 'glass_cost_statement' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin() and exists(select 1 from public.glass_cost_statements where id=p_resource_id::uuid and status='active'); else allowed:=false; end case;
 if not allowed then raise exception 'resource not editable'; end if; return eid; end $$;
alter table public.glass_cost_statements replica identity full; alter table public.glass_cost_allocations replica identity full;
do $$ begin if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='glass_cost_statements') then alter publication supabase_realtime add table public.glass_cost_statements; end if; if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='glass_cost_allocations') then alter publication supabase_realtime add table public.glass_cost_allocations; end if; exception when undefined_object then null; end $$;
notify pgrst,'reload schema'; commit;
