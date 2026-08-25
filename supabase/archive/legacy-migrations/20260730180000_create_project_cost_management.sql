begin;

create table if not exists public.project_cost_categories (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  description text, sort_order integer not null default 0, is_active boolean not null default true,
  is_system boolean not null default false, created_by uuid, created_at timestamptz not null default now(),
  updated_by uuid, updated_at timestamptz not null default now(),
  constraint project_cost_categories_code_check check (code ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$' and char_length(code) <= 50),
  constraint project_cost_categories_name_check check (btrim(name) <> '' and char_length(name) <= 100),
  constraint project_cost_categories_description_check check (description is null or char_length(description) <= 500)
);

insert into public.project_cost_categories(code,name,sort_order,is_system) values
('subcontract','외주비',1,true),('transportation','운송비',2,true),('labor','노무비',3,true),
('installation','설치비',4,true),('as_service','AS 비용',5,true),('other','기타 비용',6,true)
on conflict (code) do nothing;

create table if not exists public.project_cost_entries (
  id uuid primary key default gen_random_uuid(), project_id bigint not null references public.projects(id) on update cascade on delete restrict,
  category_id uuid not null references public.project_cost_categories(id) on update cascade on delete restrict,
  cost_title text not null, cost_date date not null, recognition_date date, vendor_name text, document_number text,
  supply_amount_krw bigint not null, vat_amount_krw bigint not null, total_amount_krw bigint not null,
  status text not null default 'confirmed', payment_status text not null default 'unpaid', memo text,
  created_by uuid not null, created_at timestamptz not null default now(), updated_by uuid, updated_at timestamptz not null default now(),
  constraint project_cost_entries_status_check check (status in ('confirmed','void')),
  constraint project_cost_entries_payment_check check (payment_status in ('unpaid','partial','paid','not_applicable')),
  constraint project_cost_entries_title_check check (btrim(cost_title) <> '' and char_length(cost_title) <= 200),
  constraint project_cost_entries_vendor_check check (vendor_name is null or char_length(vendor_name) <= 200),
  constraint project_cost_entries_document_check check (document_number is null or char_length(document_number) <= 100),
  constraint project_cost_entries_amount_check check (supply_amount_krw >= 0 and vat_amount_krw >= 0 and total_amount_krw = supply_amount_krw + vat_amount_krw and (status <> 'confirmed' or total_amount_krw > 0)),
  constraint project_cost_entries_memo_check check (memo is null or char_length(memo) <= 2000)
);

create index if not exists project_cost_entries_project_date_idx on public.project_cost_entries(project_id,cost_date desc,created_at desc);
create index if not exists project_cost_entries_category_idx on public.project_cost_entries(category_id,status);

create or replace function public.prepare_project_cost_category()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='UPDATE' then
    if new.code is distinct from old.code or new.is_system is distinct from old.is_system or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
      raise exception 'Category code and system identity are immutable.' using errcode='55000';
    end if;
    new.updated_by:=auth.uid(); new.updated_at:=now();
  end if;
  return new;
end; $$;
drop trigger if exists prepare_project_cost_category on public.project_cost_categories;
create trigger prepare_project_cost_category before update on public.project_cost_categories for each row execute function public.prepare_project_cost_category();

create or replace function public.prepare_project_cost_entry()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' then
    if not exists(select 1 from public.project_cost_categories where id=new.category_id and is_active) then
      raise exception 'Inactive or missing cost category cannot be used.' using errcode='23514';
    end if;
    new.total_amount_krw:=new.supply_amount_krw+new.vat_amount_krw;
    if new.status<>'confirmed' then raise exception 'New cost entries must be confirmed.' using errcode='23514'; end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id or new.category_id is distinct from old.category_id
    or new.cost_date is distinct from old.cost_date or new.supply_amount_krw is distinct from old.supply_amount_krw
    or new.vat_amount_krw is distinct from old.vat_amount_krw or new.total_amount_krw is distinct from old.total_amount_krw
    or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'Core cost entry fields are immutable. Void and register a new entry.' using errcode='55000';
  end if;
  if old.status='void' and new.status<>'void' then raise exception 'A void cost entry cannot be restored.' using errcode='55000'; end if;
  new.updated_by:=auth.uid(); new.updated_at:=now(); return new;
end; $$;
drop trigger if exists prepare_project_cost_entry on public.project_cost_entries;
create trigger prepare_project_cost_entry before insert or update on public.project_cost_entries for each row execute function public.prepare_project_cost_entry();

alter table public.project_cost_categories enable row level security;
alter table public.project_cost_entries enable row level security;
create policy project_cost_categories_select_approved on public.project_cost_categories for select to authenticated using(public.is_approved_erp_user());
create policy project_cost_categories_insert_admin on public.project_cost_categories for insert to authenticated with check(public.is_approved_admin() and (created_by=auth.uid() or created_by is null));
create policy project_cost_categories_update_admin on public.project_cost_categories for update to authenticated using(public.is_approved_admin()) with check(public.is_approved_admin());
create policy project_cost_entries_select_approved on public.project_cost_entries for select to authenticated using(public.is_approved_erp_user());
create policy project_cost_entries_insert_admin on public.project_cost_entries for insert to authenticated with check(public.is_approved_admin() and created_by=auth.uid());
create policy project_cost_entries_update_admin on public.project_cost_entries for update to authenticated using(public.is_approved_admin()) with check(public.is_approved_admin());
revoke all on public.project_cost_categories,public.project_cost_entries from anon,authenticated;
grant select,insert,update on public.project_cost_categories,public.project_cost_entries to authenticated;
notify pgrst,'reload schema';
commit;
