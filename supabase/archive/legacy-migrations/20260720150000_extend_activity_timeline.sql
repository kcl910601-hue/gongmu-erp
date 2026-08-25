-- Sprint 5-1 Activity Timeline
-- 기존 action_type/target_type/target_id/employee_email 컬럼은 호환을 위해 유지합니다.

alter table public.activity_logs
  add column if not exists activity_type text,
  add column if not exists employee_id bigint,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.activity_logs
set activity_type = action_type
where activity_type is null;

alter table public.activity_logs
  alter column activity_type set not null;

create index if not exists activity_logs_created_at_idx
  on public.activity_logs (created_at desc);

create index if not exists activity_logs_project_created_at_idx
  on public.activity_logs (project_id, created_at desc)
  where project_id is not null;
