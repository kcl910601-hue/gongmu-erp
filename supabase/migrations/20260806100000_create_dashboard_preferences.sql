begin;

create table if not exists public.dashboard_preferences (
  employee_id bigint primary key references public.employees(id) on delete cascade,
  cards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint dashboard_preferences_cards_array_check check (jsonb_typeof(cards) = 'array')
);

alter table public.dashboard_preferences enable row level security;

drop policy if exists dashboard_preferences_select_own on public.dashboard_preferences;
create policy dashboard_preferences_select_own on public.dashboard_preferences for select to authenticated
using (exists (select 1 from public.employees e where e.id = employee_id and e.auth_user_id = auth.uid() and e.active is true and e.approval_status = 'approved'));

drop policy if exists dashboard_preferences_insert_own on public.dashboard_preferences;
create policy dashboard_preferences_insert_own on public.dashboard_preferences for insert to authenticated
with check (exists (select 1 from public.employees e where e.id = employee_id and e.auth_user_id = auth.uid() and e.active is true and e.approval_status = 'approved'));

drop policy if exists dashboard_preferences_update_own on public.dashboard_preferences;
create policy dashboard_preferences_update_own on public.dashboard_preferences for update to authenticated
using (exists (select 1 from public.employees e where e.id = employee_id and e.auth_user_id = auth.uid() and e.active is true and e.approval_status = 'approved'))
with check (exists (select 1 from public.employees e where e.id = employee_id and e.auth_user_id = auth.uid() and e.active is true and e.approval_status = 'approved'));

drop policy if exists dashboard_preferences_delete_own on public.dashboard_preferences;
create policy dashboard_preferences_delete_own on public.dashboard_preferences for delete to authenticated
using (exists (select 1 from public.employees e where e.id = employee_id and e.auth_user_id = auth.uid() and e.active is true and e.approval_status = 'approved'));

grant select, insert, update, delete on public.dashboard_preferences to authenticated;
notify pgrst, 'reload schema';
commit;
