create table if not exists public.user_favorite_projects (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  project_id bigint not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (auth_user_id, project_id)
);

create index if not exists user_favorite_projects_user_created_idx
  on public.user_favorite_projects (auth_user_id, created_at desc);

alter table public.user_favorite_projects enable row level security;

create policy user_favorite_projects_select_own
  on public.user_favorite_projects
  for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy user_favorite_projects_insert_own
  on public.user_favorite_projects
  for insert
  to authenticated
  with check (auth_user_id = auth.uid());

create policy user_favorite_projects_delete_own
  on public.user_favorite_projects
  for delete
  to authenticated
  using (auth_user_id = auth.uid());

create policy user_favorite_projects_update_own
  on public.user_favorite_projects
  for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
