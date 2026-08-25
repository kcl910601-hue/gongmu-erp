-- Add partner roles without changing existing project or contract identifiers.
begin;

do $$
begin
  create type public.partner_type as enum ('supplier', 'assembly');
exception
  when duplicate_object then null;
end
$$;

alter table public.organizations
  add column if not exists partner_type public.partner_type;

-- Before this migration, every organization in the partner category was an
-- assembly master. Internal organizations remain NULL.
update public.organizations organization
set partner_type = 'assembly'
from public.organization_categories category
where category.id = organization.category_id
  and category.code = 'partner'
  and organization.partner_type is null;

-- Allow the same normalized name once per partner role while preserving the
-- original uniqueness rule for internal organizations.
drop index if exists public.organizations_category_normalized_name_uidx;

create unique index if not exists organizations_internal_normalized_name_uidx
  on public.organizations (category_id, lower(btrim(name)))
  where partner_type is null;

create unique index if not exists organizations_partner_type_normalized_name_uidx
  on public.organizations (category_id, partner_type, lower(btrim(name)))
  where partner_type is not null;

-- Keep suppliers UUIDs and all raw-material/LME contract FKs unchanged. The
-- added link only connects each legacy supplier to its supplier organization.
alter table public.suppliers
  add column if not exists organization_id bigint;

insert into public.organizations (
  category_id, name, function_code, partner_type, sort_order, is_active
)
select category.id, supplier.name, 'partner', 'supplier', 100, supplier.is_active
from public.suppliers supplier
cross join public.organization_categories category
where category.code = 'partner'
on conflict (category_id, partner_type, lower(btrim(name)))
  where partner_type is not null
do update set
  is_active = excluded.is_active,
  updated_at = now();

update public.suppliers supplier
set organization_id = organization.id,
    updated_at = now()
from public.organizations organization
join public.organization_categories category
  on category.id = organization.category_id
where category.code = 'partner'
  and organization.partner_type = 'supplier'
  and lower(btrim(organization.name)) = lower(btrim(supplier.name))
  and supplier.organization_id is distinct from organization.id;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'suppliers_organization_id_fkey'
      and conrelid = 'public.suppliers'::regclass
  ) then
    alter table public.suppliers
      add constraint suppliers_organization_id_fkey
      foreign key (organization_id) references public.organizations(id)
      on update cascade on delete restrict;
  end if;
end
$$;

alter table public.suppliers
  alter column organization_id set not null;

create unique index if not exists suppliers_organization_id_uidx
  on public.suppliers (organization_id);

create index if not exists organizations_partner_type_idx
  on public.organizations (partner_type, is_active, sort_order, name)
  where partner_type is not null;

create or replace function public.assert_supplier_organization()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.organizations organization
    join public.organization_categories category
      on category.id = organization.category_id
    where organization.id = new.organization_id
      and organization.partner_type = 'supplier'
      and category.code = 'partner'
  ) then
    raise exception '구매처 타입의 협력업체만 suppliers에 연결할 수 있습니다.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists suppliers_assert_supplier_organization on public.suppliers;
create trigger suppliers_assert_supplier_organization
before insert or update of organization_id on public.suppliers
for each row execute function public.assert_supplier_organization();

create or replace function public.sync_supplier_from_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.partner_type = 'supplier' then
    insert into public.suppliers (name, is_active, organization_id, updated_at)
    values (new.name, new.is_active, new.id, now())
    on conflict (organization_id) do update set
      name = excluded.name,
      is_active = excluded.is_active,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_sync_supplier_master on public.organizations;
create trigger organizations_sync_supplier_master
after insert or update of name, is_active, partner_type on public.organizations
for each row execute function public.sync_supplier_from_organization();

create or replace function public.assert_project_assembly_organization()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.organizations organization
    where organization.id = new.organization_id
      and organization.partner_type = 'assembly'
      and organization.is_active is true
  ) then
    raise exception '조립처 타입의 활성 협력업체만 프로젝트에 연결할 수 있습니다.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists project_assembly_vendors_assert_assembly on public.project_assembly_vendors;
create trigger project_assembly_vendors_assert_assembly
before insert or update of organization_id on public.project_assembly_vendors
for each row execute function public.assert_project_assembly_organization();

create or replace function public.assert_valid_assembly_vendor_ids(p_vendor_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids bigint[] := coalesce(p_vendor_ids, array[]::bigint[]);
begin
  if cardinality(v_ids) <> (select count(distinct id) from unnest(v_ids) id) then
    raise exception using message = '조립처가 중복되었습니다.', errcode = '22023';
  end if;

  if cardinality(v_ids) <> (
    select count(*) from public.organizations organization
    where organization.id = any(v_ids)
      and organization.partner_type = 'assembly'
      and organization.is_active is true
  ) then
    raise exception using message = '활성 조립처가 아닌 업체가 포함되었습니다.', errcode = '23514';
  end if;
end;
$$;

revoke all on function public.assert_valid_assembly_vendor_ids(bigint[])
  from public, anon, authenticated;

create or replace function public.protect_referenced_partner_type()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.partner_type is distinct from old.partner_type and (
    exists (
      select 1 from public.project_assembly_vendors
      where organization_id = old.id
    )
    or exists (
      select 1 from public.suppliers
      where organization_id = old.id
    )
  ) then
    raise exception '사용 중인 협력업체의 타입은 변경할 수 없습니다.' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_protect_referenced_partner_type on public.organizations;
create trigger organizations_protect_referenced_partner_type
before update of partner_type on public.organizations
for each row execute function public.protect_referenced_partner_type();

notify pgrst, 'reload schema';
commit;
