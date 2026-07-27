create extension if not exists pgcrypto;

create table if not exists public.project_schedule_memos (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on delete cascade,
  memo_date date not null,
  content text not null check (length(btrim(content)) > 0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, memo_date)
);

create table if not exists public.task_schedule_memos (
  id uuid primary key default gen_random_uuid(),
  task_id bigint not null references public.tasks(id) on delete cascade,
  content text not null check (length(btrim(content)) > 0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id)
);

create index if not exists project_schedule_memos_project_id_idx
  on public.project_schedule_memos(project_id, memo_date);
create index if not exists task_schedule_memos_task_id_idx
  on public.task_schedule_memos(task_id);

alter table public.project_schedule_memos enable row level security;
alter table public.task_schedule_memos enable row level security;

create policy project_schedule_memos_select_authenticated
  on public.project_schedule_memos for select to authenticated using (true);
create policy project_schedule_memos_insert_authenticated
  on public.project_schedule_memos for insert to authenticated
  with check (created_by = auth.uid());
create policy project_schedule_memos_update_authenticated
  on public.project_schedule_memos for update to authenticated
  using (true) with check (true);
create policy project_schedule_memos_delete_authenticated
  on public.project_schedule_memos for delete to authenticated using (true);

create policy task_schedule_memos_select_authenticated
  on public.task_schedule_memos for select to authenticated using (true);
create policy task_schedule_memos_insert_authenticated
  on public.task_schedule_memos for insert to authenticated
  with check (created_by = auth.uid());
create policy task_schedule_memos_update_authenticated
  on public.task_schedule_memos for update to authenticated
  using (true) with check (true);
create policy task_schedule_memos_delete_authenticated
  on public.task_schedule_memos for delete to authenticated using (true);
