create extension if not exists pgcrypto;

create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  predecessor_task_id bigint not null references public.tasks(id) on delete cascade,
  successor_task_id bigint not null references public.tasks(id) on delete cascade,
  dependency_type text not null default 'FS' check (dependency_type = 'FS'),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  constraint task_dependencies_different_tasks check (predecessor_task_id <> successor_task_id),
  constraint task_dependencies_unique_fs unique (predecessor_task_id, successor_task_id, dependency_type)
);

create index if not exists task_dependencies_predecessor_idx on public.task_dependencies(predecessor_task_id);
create index if not exists task_dependencies_successor_idx on public.task_dependencies(successor_task_id);
alter table public.task_dependencies enable row level security;

create policy task_dependencies_select_authenticated on public.task_dependencies for select to authenticated using (true);
create policy task_dependencies_insert_editors on public.task_dependencies for insert to authenticated with check (
  created_by = auth.uid() and exists (
    select 1 from public.employees as e where e.auth_user_id = auth.uid() and e.active is true and e.role in ('admin', 'manager', 'staff')
  )
);
create policy task_dependencies_delete_editors on public.task_dependencies for delete to authenticated using (
  exists (
    select 1 from public.employees as e where e.auth_user_id = auth.uid() and e.active is true and e.role in ('admin', 'manager', 'staff')
  )
);

create or replace function public.create_task_dependency(p_predecessor_task_id bigint, p_successor_task_id bigint)
returns public.task_dependencies
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_dependency public.task_dependencies;
begin
  if p_predecessor_task_id = p_successor_task_id then raise exception 'A task cannot depend on itself.'; end if;
  if not exists (
    select 1 from public.employees as e where e.auth_user_id = auth.uid() and e.active is true and e.role in ('admin', 'manager', 'staff')
  ) then raise exception 'Task dependency update permission is required.'; end if;
  if not exists (
    select 1 from public.tasks as predecessor
    join public.tasks as successor on successor.id = p_successor_task_id
    where predecessor.id = p_predecessor_task_id and predecessor.project_id = successor.project_id
  ) then raise exception 'Dependencies are allowed only between tasks in the same project.'; end if;
  if exists (
    with recursive successors(task_id) as (
      select td.successor_task_id from public.task_dependencies as td where td.predecessor_task_id = p_successor_task_id
      union
      select td.successor_task_id from public.task_dependencies as td join successors as path on td.predecessor_task_id = path.task_id
    ) select 1 from successors as path where path.task_id = p_predecessor_task_id
  ) then raise exception 'This dependency would create a cycle.'; end if;

  insert into public.task_dependencies as td (predecessor_task_id, successor_task_id, dependency_type, created_by)
  values (p_predecessor_task_id, p_successor_task_id, 'FS', auth.uid())
  on conflict on constraint task_dependencies_unique_fs
  do update set dependency_type = excluded.dependency_type
  returning * into v_dependency;
  return v_dependency;
end;
$$;

revoke all on function public.create_task_dependency(bigint, bigint) from public, anon;
grant execute on function public.create_task_dependency(bigint, bigint) to authenticated;
