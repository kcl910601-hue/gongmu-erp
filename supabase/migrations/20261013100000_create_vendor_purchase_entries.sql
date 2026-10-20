begin;

-- Additional invoice ledger only; glass/coating remain in their existing source tables.
create table public.vendor_purchase_entries (
  id uuid primary key default gen_random_uuid(),
  vendor_organization_id bigint not null references public.organizations(id),
  accounting_month date not null check (extract(day from accounting_month) = 1 and accounting_month between '1900-01-01' and '2099-12-01'),
  category text not null check (category in ('압출','가스켓','조립','부자재','기타')),
  invoice_number text check (length(invoice_number) between 1 and 100),
  supply_amount_krw bigint not null check (abs(supply_amount_krw::numeric) <= 1000000000000),
  vat_amount_krw bigint not null check (abs(vat_amount_krw::numeric) <= 1000000000000),
  memo text check (length(memo) <= 1000),
  status text not null default 'active' check (status in ('active','void')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index vendor_purchase_month_idx on public.vendor_purchase_entries(accounting_month, vendor_organization_id);
-- Identical rows cannot be imported twice, including concurrent/retried uploads.
create unique index vendor_purchase_duplicate_idx on public.vendor_purchase_entries
  (vendor_organization_id, accounting_month, category, coalesce(invoice_number,''), supply_amount_krw, vat_amount_krw)
  where status = 'active';
alter table public.vendor_purchase_entries enable row level security;
revoke all on public.vendor_purchase_entries from anon, authenticated;
grant select on public.vendor_purchase_entries to authenticated;
grant update(status) on public.vendor_purchase_entries to authenticated;
create policy vendor_purchase_read on public.vendor_purchase_entries for select to authenticated
  using(public.is_approved_erp_user() and not public.is_calendar_only_staff());
create policy vendor_purchase_void on public.vendor_purchase_entries for update to authenticated
  using(public.is_approved_admin() and not public.is_calendar_only_staff())
  with check(public.is_approved_admin() and not public.is_calendar_only_staff() and status = 'void');

create function public.audit_vendor_purchase() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.activity_logs(activity_type,action_type,target_type,title,employee_id,employee_name,metadata)
  select 'vendor_purchase_' || lower(tg_op), 'vendor_purchase_' || lower(tg_op), 'vendor_purchase',
    case when tg_op = 'INSERT' then '업체 매입 등록' else '업체 매입 무효' end,
    id,name,jsonb_build_object('entry_id',new.id,'after',to_jsonb(new),'before',case when tg_op = 'UPDATE' then to_jsonb(old) else null end)
  from public.employees where auth_user_id = auth.uid();
  return new;
end;
$$;
revoke all on function public.audit_vendor_purchase() from public,anon,authenticated;
create trigger vendor_purchase_audit after insert or update on public.vendor_purchase_entries
  for each row execute function public.audit_vendor_purchase();

create function public.import_vendor_purchases(p_rows jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb; v_vendor bigint; v_month date; v_count integer := 0;
begin
  if not public.is_approved_admin() or public.is_calendar_only_staff() then
    raise exception '관리자만 등록할 수 있습니다.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception '내역 배열이 필요합니다.'; end if;
  if jsonb_array_length(p_rows) not between 1 and 1000 then raise exception '1~1,000행을 입력해주세요.'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_count := v_count + 1;
    if coalesce(r->>'accounting_month','') !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-01$' then raise exception '%행: 귀속연월 오류',v_count; end if;
    if coalesce(r->>'supply_amount_krw','') !~ '^-?[0-9]+$' or coalesce(r->>'vat_amount_krw','') !~ '^-?[0-9]+$' then raise exception '%행: 금액 오류',v_count; end if;
    v_vendor := (r->>'vendor_organization_id')::bigint;
    v_month := (r->>'accounting_month')::date;
    if not exists(select 1 from public.organizations o join public.organization_categories c on c.id=o.category_id where o.id=v_vendor and c.code='partner') then
      raise exception '%행: 등록된 업체를 선택해주세요.',v_count;
    end if;
    insert into public.vendor_purchase_entries(vendor_organization_id,accounting_month,category,invoice_number,supply_amount_krw,vat_amount_krw,memo,created_by)
    values(v_vendor,v_month,r->>'category',nullif(btrim(r->>'invoice_number'),''),(r->>'supply_amount_krw')::bigint,(r->>'vat_amount_krw')::bigint,nullif(btrim(r->>'memo'),''),auth.uid());
  end loop;
  return v_count;
exception when unique_violation then raise exception '%행: 같은 업체·연월·분류·계산서번호·금액의 내역이 이미 있습니다. 중복을 제거해주세요.',v_count;
end;
$$;
revoke all on function public.import_vendor_purchases(jsonb) from public,anon;
grant execute on function public.import_vendor_purchases(jsonb) to authenticated;
commit;
