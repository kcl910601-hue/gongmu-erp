-- Partner organization management permissions.
-- Existing organization master tables and project text compatibility are preserved.

begin;

create unique index if not exists organizations_category_normalized_name_uidx
  on public.organizations (category_id, lower(btrim(name)));

alter table public.organization_categories enable row level security;
alter table public.organizations enable row level security;

drop policy if exists organizations_insert_approved_admin on public.organizations;
create policy organizations_insert_approved_admin
  on public.organizations
  for insert
  to authenticated
  with check (public.is_approved_admin());

drop policy if exists organizations_update_approved_admin on public.organizations;
create policy organizations_update_approved_admin
  on public.organizations
  for update
  to authenticated
  using (public.is_approved_admin())
  with check (public.is_approved_admin());

grant select, insert, update on table public.organizations to authenticated;
grant select on table public.organization_categories to authenticated;
revoke delete on table public.organizations from authenticated;
revoke all on table public.organizations from anon;
revoke all on table public.organization_categories from anon;

commit;

