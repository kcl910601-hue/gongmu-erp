begin;
alter type public.partner_type add value if not exists 'accessory';
commit;

begin;
create table public.accessory_items(
 id uuid primary key default gen_random_uuid(), code text not null unique,
 name text not null check(char_length(btrim(name)) between 1 and 200), specification text,
 unit text not null check(unit in('EA','M','SET')), origin_type text not null check(origin_type in('domestic','imported')),
 price_basis text not null check(price_basis in('KRW_DIRECT','FOREIGN_CURRENCY')),
 currency text not null check(currency in('KRW','USD')), current_unit_price numeric(18,4) not null check(current_unit_price>=0),
 vendor_organization_id bigint references public.organizations(id) on delete restrict,
 is_active boolean not null default true, memo text check(memo is null or char_length(memo)<=2000), sort_order integer not null default 0 check(sort_order>=0),
 created_by uuid not null references auth.users(id) on delete restrict, updated_by uuid references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((price_basis='KRW_DIRECT' and currency='KRW') or (price_basis='FOREIGN_CURRENCY' and currency='USD'))
);
create table public.accessory_price_history(
 id bigint generated always as identity primary key, accessory_item_id uuid not null references public.accessory_items(id) on delete restrict,
 old_unit_price numeric(18,4), new_unit_price numeric(18,4) not null, old_currency text, new_currency text not null,
 memo text, changed_by uuid not null references auth.users(id) on delete restrict, changed_at timestamptz not null default now()
);
create table public.project_accessory_usages(
 id uuid primary key default gen_random_uuid(), project_id bigint not null references public.projects(id) on delete restrict,
 accessory_item_id uuid not null references public.accessory_items(id) on delete restrict, usage_date date not null,
 quantity numeric(18,4) not null check(quantity>0), snapshot_unit text not null,
 snapshot_origin_type text not null, snapshot_price_basis text not null, snapshot_currency text not null,
 snapshot_unit_price numeric(18,4) not null check(snapshot_unit_price>=0), snapshot_exchange_rate numeric(18,4),
 snapshot_krw_unit_price bigint not null check(snapshot_krw_unit_price>=0), total_cost_krw bigint not null check(total_cost_krw>=0),
 memo text check(memo is null or char_length(memo)<=2000), status text not null default 'active' check(status in('active','void')),
 created_by uuid not null references auth.users(id) on delete restrict, updated_by uuid references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((snapshot_price_basis='KRW_DIRECT' and snapshot_currency='KRW' and snapshot_exchange_rate is null) or (snapshot_price_basis='FOREIGN_CURRENCY' and snapshot_currency='USD' and snapshot_exchange_rate>0)),
 check(snapshot_unit<>'M' or quantity=round(quantity,4)), check(snapshot_unit='M' or quantity=trunc(quantity))
);
create index accessory_items_vendor_active_idx on public.accessory_items(vendor_organization_id,is_active);
create index accessory_items_active_sort_idx on public.accessory_items(is_active,sort_order,code);
create index accessory_price_history_item_changed_idx on public.accessory_price_history(accessory_item_id,changed_at desc);
create index project_accessory_usages_project_status_idx on public.project_accessory_usages(project_id,status);
create index project_accessory_usages_project_date_idx on public.project_accessory_usages(project_id,usage_date desc);
create index project_accessory_usages_item_status_idx on public.project_accessory_usages(accessory_item_id,status);

create function public.assert_accessory_vendor() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if new.vendor_organization_id is not null and not exists(select 1 from public.organizations where id=new.vendor_organization_id and partner_type='accessory') then raise exception '부자재업체만 선택할 수 있습니다.' using errcode='23514'; end if; return new; end $$;
create trigger accessory_items_assert_vendor before insert or update of vendor_organization_id on public.accessory_items for each row execute function public.assert_accessory_vendor();

create function public.log_accessory_activity(p_type text,p_project bigint,p_title text,p_metadata jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.employees%rowtype; begin select * into e from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
 insert into public.activity_logs(activity_type,action_type,target_type,target_id,project_id,employee_id,employee_name,employee_email,title,metadata)
 values(p_type,p_type,'project_accessory_usage',null,p_project,e.id,e.name,e.email,p_title,coalesce(p_metadata,'{}')); end $$;
revoke all on function public.log_accessory_activity(text,bigint,text,jsonb) from public,anon,authenticated;

create function public.save_accessory_item(p_id uuid,p_code text,p_name text,p_specification text,p_unit text,p_origin text,p_price_basis text,p_currency text,p_unit_price numeric,p_vendor bigint,p_active boolean,p_memo text,p_sort integer)
returns public.accessory_items language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.accessory_items%rowtype; result public.accessory_items%rowtype; generated_code text; begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 if p_name is null or btrim(p_name)='' or p_unit not in('EA','M','SET') or p_origin not in('domestic','imported') or p_price_basis not in('KRW_DIRECT','FOREIGN_CURRENCY') or p_unit_price is null or p_unit_price<0 then raise exception '부자재 정보를 확인해주세요.' using errcode='22023'; end if;
 if (p_price_basis='KRW_DIRECT' and p_currency<>'KRW') or (p_price_basis='FOREIGN_CURRENCY' and p_currency<>'USD') then raise exception '가격방식과 통화를 확인해주세요.' using errcode='22023'; end if;
 if p_vendor is not null and not exists(select 1 from public.organizations where id=p_vendor and partner_type='accessory' and is_active) then raise exception '활성 부자재업체를 선택해주세요.' using errcode='23514'; end if;
 if p_id is null then
  perform pg_advisory_xact_lock(hashtext('accessory_item_code'));
  generated_code:=coalesce(nullif(upper(btrim(p_code)),''),'ACC-'||lpad((coalesce((select max(substring(code from '[0-9]+$')::integer) from public.accessory_items where code~'^ACC-[0-9]+$'),0)+1)::text,4,'0'));
  insert into public.accessory_items(code,name,specification,unit,origin_type,price_basis,currency,current_unit_price,vendor_organization_id,is_active,memo,sort_order,created_by)
  values(generated_code,btrim(p_name),nullif(btrim(p_specification),''),p_unit,p_origin,p_price_basis,p_currency,p_unit_price,p_vendor,coalesce(p_active,true),nullif(btrim(p_memo),''),coalesce(p_sort,0),auth.uid()) returning * into result;
  insert into public.accessory_price_history(accessory_item_id,new_unit_price,new_currency,memo,changed_by) values(result.id,result.current_unit_price,result.currency,'최초 단가',auth.uid());
 else
  select * into old from public.accessory_items where id=p_id for update; if not found then raise exception '부자재를 찾을 수 없습니다.' using errcode='P0002'; end if;
  update public.accessory_items set code=coalesce(nullif(upper(btrim(p_code)),''),old.code),name=btrim(p_name),specification=nullif(btrim(p_specification),''),unit=p_unit,origin_type=p_origin,price_basis=p_price_basis,currency=p_currency,current_unit_price=p_unit_price,vendor_organization_id=p_vendor,is_active=p_active,memo=nullif(btrim(p_memo),''),sort_order=coalesce(p_sort,0),updated_by=auth.uid(),updated_at=now() where id=p_id returning * into result;
  if old.current_unit_price is distinct from result.current_unit_price or old.currency is distinct from result.currency then insert into public.accessory_price_history(accessory_item_id,old_unit_price,new_unit_price,old_currency,new_currency,memo,changed_by) values(result.id,old.current_unit_price,result.current_unit_price,old.currency,result.currency,result.memo,auth.uid()); end if;
 end if; return result; end $$;

create function public.save_project_accessory_usage(p_id uuid,p_project bigint,p_item uuid,p_usage_date date,p_quantity numeric,p_unit_price numeric,p_exchange_rate numeric,p_memo text)
returns public.project_accessory_usages language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.accessory_items%rowtype; old public.project_accessory_usages%rowtype; result public.project_accessory_usages%rowtype; krw_unit bigint; total bigint; begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 if p_quantity is null or p_quantity<=0 or p_unit_price is null or p_unit_price<0 or p_usage_date is null then raise exception '사용일, 수량과 단가를 확인해주세요.' using errcode='22023'; end if;
 if not exists(select 1 from public.projects where id=p_project) then raise exception '프로젝트를 찾을 수 없습니다.' using errcode='P0002'; end if;
 if p_id is null then select * into item from public.accessory_items where id=p_item and is_active; else select * into old from public.project_accessory_usages where id=p_id for update; if not found or old.status<>'active' then raise exception '수정 가능한 사용내역이 없습니다.' using errcode='P0002'; end if; if old.project_id<>p_project or old.accessory_item_id<>p_item then raise exception '프로젝트와 부자재는 변경할 수 없습니다.' using errcode='23514'; end if; select * into item from public.accessory_items where id=old.accessory_item_id; item.unit:=old.snapshot_unit; item.origin_type:=old.snapshot_origin_type; item.price_basis:=old.snapshot_price_basis; item.currency:=old.snapshot_currency; end if;
 if not found then raise exception '사용 가능한 부자재를 찾을 수 없습니다.' using errcode='P0002'; end if;
 if item.unit in('EA','SET') and p_quantity<>trunc(p_quantity) then raise exception 'EA와 SET 수량은 정수여야 합니다.' using errcode='22023'; end if;
 if item.price_basis='FOREIGN_CURRENCY' then if p_exchange_rate is null or p_exchange_rate<=0 then raise exception '적용환율을 입력해주세요.' using errcode='22023'; end if; krw_unit:=round(p_unit_price*p_exchange_rate); else p_exchange_rate:=null; krw_unit:=round(p_unit_price); end if;
 total:=round(p_quantity*krw_unit); if total<0 then raise exception '총원가를 계산할 수 없습니다.' using errcode='22003'; end if;
 if p_id is null then insert into public.project_accessory_usages(project_id,accessory_item_id,usage_date,quantity,snapshot_unit,snapshot_origin_type,snapshot_price_basis,snapshot_currency,snapshot_unit_price,snapshot_exchange_rate,snapshot_krw_unit_price,total_cost_krw,memo,created_by) values(p_project,item.id,p_usage_date,p_quantity,item.unit,item.origin_type,item.price_basis,item.currency,p_unit_price,p_exchange_rate,krw_unit,total,nullif(btrim(p_memo),''),auth.uid()) returning * into result; perform public.log_accessory_activity('accessory_usage_create',p_project,'부자재 소진 등록',jsonb_build_object('usage_id',result.id,'after',to_jsonb(result)));
 else update public.project_accessory_usages set usage_date=p_usage_date,quantity=p_quantity,snapshot_unit_price=p_unit_price,snapshot_exchange_rate=p_exchange_rate,snapshot_krw_unit_price=krw_unit,total_cost_krw=total,memo=nullif(btrim(p_memo),''),updated_by=auth.uid(),updated_at=now() where id=p_id returning * into result; perform public.log_accessory_activity('accessory_usage_update',p_project,'부자재 소진 수정',jsonb_build_object('usage_id',result.id,'before',to_jsonb(old),'after',to_jsonb(result))); end if;
 return result; end $$;

create function public.void_project_accessory_usage(p_id uuid) returns public.project_accessory_usages language plpgsql security definer set search_path=public,pg_temp as $$ declare old public.project_accessory_usages%rowtype; result public.project_accessory_usages%rowtype; begin
 if not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if; select * into old from public.project_accessory_usages where id=p_id for update; if not found or old.status<>'active' then raise exception '무효 처리할 사용내역이 없습니다.' using errcode='P0002'; end if; update public.project_accessory_usages set status='void',updated_by=auth.uid(),updated_at=now() where id=p_id returning * into result; perform public.log_accessory_activity('accessory_usage_void',result.project_id,'부자재 소진 무효',jsonb_build_object('usage_id',result.id,'before',to_jsonb(old),'after',to_jsonb(result))); return result; end $$;

revoke all on function public.save_accessory_item(uuid,text,text,text,text,text,text,text,numeric,bigint,boolean,text,integer),public.save_project_accessory_usage(uuid,bigint,uuid,date,numeric,numeric,numeric,text),public.void_project_accessory_usage(uuid) from public,anon;
grant execute on function public.save_accessory_item(uuid,text,text,text,text,text,text,text,numeric,bigint,boolean,text,integer),public.save_project_accessory_usage(uuid,bigint,uuid,date,numeric,numeric,numeric,text),public.void_project_accessory_usage(uuid) to authenticated;
alter table public.accessory_items enable row level security; alter table public.accessory_price_history enable row level security; alter table public.project_accessory_usages enable row level security;
create policy accessory_items_read on public.accessory_items for select to authenticated using(public.is_approved_erp_user()); create policy accessory_price_history_read on public.accessory_price_history for select to authenticated using(public.is_approved_erp_user()); create policy project_accessory_usages_read on public.project_accessory_usages for select to authenticated using(public.is_approved_erp_user());
revoke all on public.accessory_items,public.accessory_price_history,public.project_accessory_usages from anon,authenticated; grant select on public.accessory_items,public.accessory_price_history,public.project_accessory_usages to authenticated;

alter table public.editing_locks drop constraint if exists editing_locks_resource_type_check;
alter table public.editing_locks add constraint editing_locks_resource_type_check check(resource_type in('project','task','personal_note','shipment','employee','comment','setting','material_usage_request','material_usage_group','glass_cost_statement','coating_cost_statement','accessory_item','project_accessory_usage'));
create or replace function public.assert_editing_lock_permission(p_resource_type text,p_resource_id text) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$ declare eid bigint; allowed boolean:=false; begin
 select id into eid from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved'; if eid is null then raise exception 'permission denied'; end if;
 case p_resource_type when 'project' then allowed:=p_resource_id~'^[0-9]+$' and public.can_manage_projects() and exists(select 1 from public.projects where id=p_resource_id::bigint); when 'task' then allowed:=p_resource_id~'^[0-9]+$' and public.can_edit_tasks() and exists(select 1 from public.tasks where id=p_resource_id::bigint); when 'shipment' then allowed:=p_resource_id~'^[0-9]+$' and public.can_edit_tasks() and exists(select 1 from public.shipments where id=p_resource_id::bigint); when 'employee' then allowed:=p_resource_id~'^[0-9]+$' and public.is_approved_admin(); when 'setting' then allowed:=public.can_manage_settings(); when 'comment' then allowed:=p_resource_id~'^[0-9]+$'; when 'personal_note' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$'; when 'material_usage_request' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin(); when 'material_usage_group' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin(); when 'glass_cost_statement' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin() and exists(select 1 from public.glass_cost_statements where id=p_resource_id::uuid and status='active'); when 'coating_cost_statement' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin() and exists(select 1 from public.coating_cost_statements where id=p_resource_id::uuid and status='active'); when 'accessory_item' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin() and exists(select 1 from public.accessory_items where id=p_resource_id::uuid); when 'project_accessory_usage' then allowed:=p_resource_id~*'^[0-9a-f-]{36}$' and public.is_approved_admin() and exists(select 1 from public.project_accessory_usages where id=p_resource_id::uuid and status='active'); else allowed:=false; end case;
 if not allowed then raise exception 'resource not editable'; end if; return eid; end $$;
alter table public.accessory_items replica identity full; alter table public.project_accessory_usages replica identity full;
do $$ begin if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='accessory_items') then alter publication supabase_realtime add table public.accessory_items; end if; if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='project_accessory_usages') then alter publication supabase_realtime add table public.project_accessory_usages; end if; exception when undefined_object then null; end $$;
notify pgrst,'reload schema';
commit;
