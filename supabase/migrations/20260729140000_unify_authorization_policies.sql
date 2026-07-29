-- Sprint 5-11A: align UI/API/RPC/RLS authorization with lib/permissions.ts.

begin;

create or replace function public.has_erp_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.employees
    where auth_user_id = auth.uid()
      and active is true
      and approval_status = 'approved'
      and role = any(p_roles)
  );
$$;

create or replace function public.is_approved_erp_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_erp_role(array['admin', 'manager', 'staff', 'viewer']);
$$;

create or replace function public.can_manage_projects()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_erp_role(array['admin', 'manager']);
$$;

create or replace function public.can_edit_tasks()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_erp_role(array['admin', 'manager', 'staff']);
$$;

create or replace function public.can_manage_settings()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_erp_role(array['admin', 'manager']);
$$;

create or replace function public.is_approved_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_erp_role(array['admin']);
$$;

revoke all on function public.has_erp_role(text[]) from public, anon;
revoke all on function public.is_approved_erp_user() from public, anon;
revoke all on function public.can_manage_projects() from public, anon;
revoke all on function public.can_edit_tasks() from public, anon;
revoke all on function public.can_manage_settings() from public, anon;
revoke all on function public.is_approved_admin() from public, anon;
grant execute on function public.has_erp_role(text[]) to authenticated;
grant execute on function public.is_approved_erp_user() to authenticated;
grant execute on function public.can_manage_projects() to authenticated;
grant execute on function public.can_edit_tasks() to authenticated;
grant execute on function public.can_manage_settings() to authenticated;
grant execute on function public.is_approved_admin() to authenticated;

drop policy if exists project_sections_select_authenticated on public.project_sections;
drop policy if exists project_sections_insert_authenticated on public.project_sections;
drop policy if exists project_sections_update_authenticated on public.project_sections;
drop policy if exists project_sections_delete_authenticated on public.project_sections;
create policy project_sections_select_erp_user on public.project_sections
  for select to authenticated using (public.is_approved_erp_user());
create policy project_sections_insert_project_manager on public.project_sections
  for insert to authenticated with check (public.can_manage_projects());
create policy project_sections_update_project_manager on public.project_sections
  for update to authenticated using (public.can_manage_projects()) with check (public.can_manage_projects());
create policy project_sections_delete_project_manager on public.project_sections
  for delete to authenticated using (public.can_manage_projects());

drop policy if exists organization_categories_select_authenticated on public.organization_categories;
drop policy if exists organizations_select_authenticated on public.organizations;
drop policy if exists organizations_insert_approved_admin on public.organizations;
drop policy if exists organizations_update_approved_admin on public.organizations;
create policy organization_categories_select_erp_user on public.organization_categories
  for select to authenticated using (public.is_approved_erp_user());
create policy organizations_select_erp_user on public.organizations
  for select to authenticated using (public.is_approved_erp_user());
create policy organizations_insert_settings_manager on public.organizations
  for insert to authenticated with check (public.can_manage_settings());
create policy organizations_update_settings_manager on public.organizations
  for update to authenticated using (public.can_manage_settings()) with check (public.can_manage_settings());
grant select on table public.organization_categories to authenticated;
grant select, insert, update on table public.organizations to authenticated;
revoke delete on table public.organizations from authenticated;

alter table public.task_templates enable row level security;
drop policy if exists task_templates_select_authenticated on public.task_templates;
create policy task_templates_select_erp_user on public.task_templates
  for select to authenticated using (public.is_approved_erp_user());
create policy task_templates_insert_settings_manager on public.task_templates
  for insert to authenticated with check (public.can_manage_settings());
create policy task_templates_update_settings_manager on public.task_templates
  for update to authenticated using (public.can_manage_settings()) with check (public.can_manage_settings());
grant select, insert, update on table public.task_templates to authenticated;
revoke delete on table public.task_templates from authenticated;

drop policy if exists project_schedule_memos_select_authenticated on public.project_schedule_memos;
drop policy if exists project_schedule_memos_insert_authenticated on public.project_schedule_memos;
drop policy if exists project_schedule_memos_update_authenticated on public.project_schedule_memos;
drop policy if exists project_schedule_memos_delete_authenticated on public.project_schedule_memos;
create policy project_schedule_memos_select_erp_user on public.project_schedule_memos
  for select to authenticated using (public.is_approved_erp_user());
create policy project_schedule_memos_insert_editor on public.project_schedule_memos
  for insert to authenticated with check (created_by = auth.uid() and public.can_edit_tasks());
create policy project_schedule_memos_update_editor on public.project_schedule_memos
  for update to authenticated using (public.can_edit_tasks()) with check (public.can_edit_tasks());
create policy project_schedule_memos_delete_editor on public.project_schedule_memos
  for delete to authenticated using (public.can_edit_tasks());

drop policy if exists task_schedule_memos_select_authenticated on public.task_schedule_memos;
drop policy if exists task_schedule_memos_insert_authenticated on public.task_schedule_memos;
drop policy if exists task_schedule_memos_update_authenticated on public.task_schedule_memos;
drop policy if exists task_schedule_memos_delete_authenticated on public.task_schedule_memos;
create policy task_schedule_memos_select_erp_user on public.task_schedule_memos
  for select to authenticated using (public.is_approved_erp_user());
create policy task_schedule_memos_insert_editor on public.task_schedule_memos
  for insert to authenticated with check (created_by = auth.uid() and public.can_edit_tasks());
create policy task_schedule_memos_update_editor on public.task_schedule_memos
  for update to authenticated using (public.can_edit_tasks()) with check (public.can_edit_tasks());
create policy task_schedule_memos_delete_editor on public.task_schedule_memos
  for delete to authenticated using (public.can_edit_tasks());

drop policy if exists task_tags_select_authenticated on public.task_tags;
drop policy if exists task_tags_insert_authenticated on public.task_tags;
drop policy if exists task_tags_delete_authenticated on public.task_tags;
create policy task_tags_select_erp_user on public.task_tags
  for select to authenticated using (public.is_approved_erp_user());
create policy task_tags_insert_editor on public.task_tags
  for insert to authenticated with check (created_by = auth.uid() and public.can_edit_tasks());
create policy task_tags_delete_editor on public.task_tags
  for delete to authenticated using (public.can_edit_tasks());

drop policy if exists task_dependencies_select_authenticated on public.task_dependencies;
drop policy if exists task_dependencies_insert_editors on public.task_dependencies;
drop policy if exists task_dependencies_delete_editors on public.task_dependencies;
create policy task_dependencies_select_erp_user on public.task_dependencies
  for select to authenticated using (public.is_approved_erp_user());
create policy task_dependencies_insert_editor on public.task_dependencies
  for insert to authenticated with check (created_by = auth.uid() and public.can_edit_tasks());
create policy task_dependencies_delete_editor on public.task_dependencies
  for delete to authenticated using (public.can_edit_tasks());

drop policy if exists task_notes_select_authenticated on public.task_notes;
drop policy if exists task_notes_insert_authenticated on public.task_notes;
drop policy if exists task_notes_update_owner_or_admin on public.task_notes;
drop policy if exists task_notes_delete_owner_or_admin on public.task_notes;
create policy task_notes_select_erp_user on public.task_notes
  for select to authenticated using (public.is_approved_erp_user());
create policy task_notes_insert_editor on public.task_notes
  for insert to authenticated with check (created_by = auth.uid() and public.can_edit_tasks());
create policy task_notes_update_owner_or_admin on public.task_notes
  for update to authenticated
  using (public.is_approved_admin() or (created_by = auth.uid() and public.can_edit_tasks()))
  with check (public.is_approved_admin() or (created_by = auth.uid() and public.can_edit_tasks()));
create policy task_notes_delete_owner_or_admin on public.task_notes
  for delete to authenticated
  using (public.is_approved_admin() or (created_by = auth.uid() and public.can_edit_tasks()));

commit;
