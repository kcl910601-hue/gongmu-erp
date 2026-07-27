-- Link projects to the partner organization master while retaining the legacy text value.

begin;

alter table public.projects
  add column if not exists assembly_vendor_organization_id bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_assembly_vendor_organization_id_fkey'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_assembly_vendor_organization_id_fkey
      foreign key (assembly_vendor_organization_id)
      references public.organizations(id)
      on update cascade
      on delete restrict;
  end if;
end
$$;

create index if not exists projects_assembly_vendor_organization_id_idx
  on public.projects (assembly_vendor_organization_id);

-- Connect legacy projects by normalized partner name without changing their display text.
update public.projects project
set assembly_vendor_organization_id = organization.id
from public.organizations organization
join public.organization_categories category
  on category.id = organization.category_id
where project.assembly_vendor_organization_id is null
  and project.assembly_vendor is not null
  and category.code = 'partner'
  and lower(btrim(project.assembly_vendor)) = lower(btrim(organization.name));

create or replace function public.sync_project_assembly_vendor_organization()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_organization_id bigint;
  v_organization_name text;
begin
  if new.assembly_vendor_organization_id is not null then
    select organization.id, organization.name
      into v_organization_id, v_organization_name
    from public.organizations organization
    join public.organization_categories category
      on category.id = organization.category_id
    where organization.id = new.assembly_vendor_organization_id
      and category.code = 'partner';

    if v_organization_id is null then
      raise exception using
        message = '선택한 협력업체를 찾을 수 없습니다.',
        errcode = '23503';
    end if;

    new.assembly_vendor := v_organization_name;
  elsif nullif(btrim(new.assembly_vendor), '') is not null then
    select organization.id, organization.name
      into v_organization_id, v_organization_name
    from public.organizations organization
    join public.organization_categories category
      on category.id = organization.category_id
    where category.code = 'partner'
      and lower(btrim(organization.name)) = lower(btrim(new.assembly_vendor))
    order by organization.sort_order, organization.name
    limit 1;

    if v_organization_id is not null then
      new.assembly_vendor_organization_id := v_organization_id;
      new.assembly_vendor := v_organization_name;
    end if;
  else
    new.assembly_vendor := null;
    new.assembly_vendor_organization_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists projects_sync_assembly_vendor_organization
  on public.projects;

create trigger projects_sync_assembly_vendor_organization
before insert or update of assembly_vendor_organization_id, assembly_vendor
on public.projects
for each row
execute function public.sync_project_assembly_vendor_organization();

commit;
