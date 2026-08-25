begin;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  description text null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value, description)
values (
  'maintenance_mode',
  jsonb_build_object(
    'enabled', false,
    'message', '현재 시스템 점검 중입니다.',
    'updated_at', null,
    'updated_by_name', null
  ),
  'ERP 전역 시스템 점검모드 설정'
)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select_erp_user on public.app_settings;
drop policy if exists app_settings_insert_admin on public.app_settings;
drop policy if exists app_settings_update_admin on public.app_settings;

create policy app_settings_select_erp_user on public.app_settings
  for select to authenticated
  using (public.is_approved_erp_user());

create policy app_settings_insert_admin on public.app_settings
  for insert to authenticated
  with check (public.is_approved_admin() and updated_by = auth.uid());

create policy app_settings_update_admin on public.app_settings
  for update to authenticated
  using (public.is_approved_admin())
  with check (public.is_approved_admin() and updated_by = auth.uid());

grant select, insert, update on table public.app_settings to authenticated;
revoke delete on table public.app_settings from authenticated;

commit;
