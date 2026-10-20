begin;
create table public.coating_extra_items (
 id uuid primary key,
 project_id bigint not null references public.projects(id) on delete restrict,
 vendor_organization_id bigint not null references public.organizations(id) on delete restrict,
 category text not null check (category in ('accessory','factory_stock','other')),
 item_name text not null check (char_length(btrim(item_name)) between 1 and 200),
 unit text not null check (unit in ('kg','m','EA','SET','lot')),
 quantity numeric(16,3) not null check (quantity > 0),
 unit_price_krw numeric(16,2) not null check (unit_price_krw > 0),
 expected_amount_krw bigint not null check (expected_amount_krw between 1 and 9007199254740991),
 memo text check (char_length(memo) <= 2000),
 status text not null default 'active' check (status in ('active','cancelled')),
 version integer not null default 1,
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index coating_extra_items_project_idx on public.coating_extra_items(project_id);
alter table public.coating_extra_items enable row level security;
create policy coating_extra_items_read on public.coating_extra_items for select to authenticated
 using (public.is_approved_erp_user() and not public.is_calendar_only_staff());
revoke all on public.coating_extra_items from anon, authenticated;
grant select on public.coating_extra_items to authenticated;

create function public.save_coating_extra_item(p_id uuid, p_project_id bigint, p_version integer, p_values jsonb, p_cancel boolean default false)
returns public.coating_extra_items language plpgsql security definer set search_path = public, pg_temp as $$
declare old_row public.coating_extra_items%rowtype; result public.coating_extra_items%rowtype;
 actor public.employees%rowtype; qty numeric; price numeric; amount numeric; vendor_id bigint;
begin
 if not public.is_approved_admin() or public.is_calendar_only_staff() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
 if p_id is null or p_project_id is null or p_version is null or p_version < 0 or p_cancel is null then raise exception '항목 정보를 확인해주세요.'; end if;
 perform 1 from public.projects where id=p_project_id;
 if not found then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('coating-extra:' || p_id::text,0));
 select * into old_row from public.coating_extra_items where id=p_id for update;
 if old_row.id is not null then
  if old_row.project_id<>p_project_id or old_row.version<>p_version or old_row.status<>'active' then raise exception '항목이 변경되었습니다. 다시 조회해주세요.' using errcode='40001'; end if;
 elsif p_version<>0 or p_cancel then raise exception '항목을 찾을 수 없습니다.' using errcode='40001'; end if;
 if p_cancel then
  update public.coating_extra_items set status='cancelled',version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id returning * into result;
 else
  vendor_id := (p_values->>'vendorId')::bigint;
  if not exists(select 1 from public.organizations where id=vendor_id and partner_type='coating' and (is_active or id=old_row.vendor_organization_id)) then raise exception '활성 도장업체를 선택해주세요.'; end if;
  qty := (p_values->>'quantity')::numeric; price := (p_values->>'unitPrice')::numeric;
  if qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty<=0 or qty>9999999999999.999 or qty<>round(qty,3)
   or price is null or price::text in ('NaN','Infinity','-Infinity') or price<=0 or price>99999999999999.99 or price<>round(price,2) then raise exception '수량은 소수 셋째 자리, 단가는 소수 둘째 자리까지 양수로 입력하세요.'; end if;
  amount := round(qty*price);
  if amount<1 or amount>9007199254740991 then raise exception '예상금액이 지원 범위를 초과했습니다.'; end if;
  if old_row.id is null then
   insert into public.coating_extra_items(id,project_id,vendor_organization_id,category,item_name,unit,quantity,unit_price_krw,expected_amount_krw,memo,created_by,updated_by)
   values(p_id,p_project_id,vendor_id,p_values->>'category',btrim(p_values->>'itemName'),p_values->>'unit',qty,price,amount,nullif(btrim(p_values->>'memo'),''),auth.uid(),auth.uid()) returning * into result;
  else
   update public.coating_extra_items set vendor_organization_id=vendor_id,category=p_values->>'category',item_name=btrim(p_values->>'itemName'),unit=p_values->>'unit',quantity=qty,unit_price_krw=price,expected_amount_krw=amount,memo=nullif(btrim(p_values->>'memo'),''),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id returning * into result;
  end if;
 end if;
 select * into actor from public.employees where auth_user_id=auth.uid() and active and approval_status='approved';
 insert into public.activity_logs(activity_type,action_type,target_type,target_id,project_id,employee_id,employee_name,employee_email,title,metadata)
 values('coating_plan_update','coating_plan_update','project',p_project_id,p_project_id,actor.id,actor.name,actor.email,
 case when p_cancel then '압출 외 도장 항목 취소' when old_row.id is null then '압출 외 도장 항목 등록' else '압출 외 도장 항목 수정' end,
 jsonb_build_object('coating_extra_item_id',p_id,'before',case when old_row.id is null then null else to_jsonb(old_row) end,'after',to_jsonb(result)));
 return result;
end; $$;
revoke all on function public.save_coating_extra_item(uuid,bigint,integer,jsonb,boolean) from public,anon;
grant execute on function public.save_coating_extra_item(uuid,bigint,integer,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
