create table public.user_favorite_projects (
  auth_user_id uuid not null,
  project_id bigint not null,
  created_at timestamptz not null default now(),
  constraint user_favorite_projects_pkey primary key (auth_user_id, project_id),
  constraint user_favorite_projects_auth_user_id_fkey
    foreign key (auth_user_id) references auth.users(id) on delete cascade,
  constraint user_favorite_projects_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade
);

create index user_favorite_projects_user_created_idx
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

revoke all on table public.user_favorite_projects from anon;
revoke update on table public.user_favorite_projects from authenticated;
grant select, insert, delete on table public.user_favorite_projects to authenticated;
grant all on table public.user_favorite_projects to service_role;
