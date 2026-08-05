begin;

create table if not exists public.reference_tasks (
  id uuid primary key default gen_random_uuid(),
  comment_id bigint references public.shared_comments(id) on delete set null,
  shared_item_id uuid references public.shared_items(id) on delete set null,
  created_by bigint not null references public.employees(id) on delete restrict,
  assigned_to bigint not null references public.employees(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists reference_tasks_assignee_comment_unique
  on public.reference_tasks(assigned_to, comment_id)
  where comment_id is not null;
create index if not exists reference_tasks_assignee_status_created_idx
  on public.reference_tasks(assigned_to, status, created_at desc);

alter table public.reference_tasks enable row level security;
drop policy if exists reference_tasks_select_own on public.reference_tasks;
create policy reference_tasks_select_own on public.reference_tasks for select to authenticated
  using (assigned_to = public.sharing_current_employee_id());

create or replace function public.create_reference_task(p_comment_id bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_employee_id bigint; v_comment public.shared_comments%rowtype; v_task_id uuid;
begin
  v_employee_id := public.sharing_current_employee_id();
  if v_employee_id is null then raise exception 'not_authorized'; end if;
  select * into v_comment from public.shared_comments where id = p_comment_id;
  if v_comment.id is null then raise exception 'comment_not_found'; end if;
  if not public.can_comment_shared_item(v_comment.shared_item_id) then raise exception 'not_authorized'; end if;
  insert into public.reference_tasks(comment_id, shared_item_id, created_by, assigned_to)
  values (v_comment.id, v_comment.shared_item_id, v_employee_id, v_employee_id)
  on conflict (assigned_to, comment_id) where comment_id is not null
  do update set assigned_to = excluded.assigned_to
  returning id into v_task_id;
  return v_task_id;
end;
$$;

create or replace function public.set_reference_task_status(p_task_id uuid, p_completed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_employee_id bigint;
begin
  v_employee_id := public.sharing_current_employee_id();
  update public.reference_tasks
  set status = case when p_completed then 'completed' else 'pending' end,
      completed_at = case when p_completed then now() else null end
  where id = p_task_id and assigned_to = v_employee_id;
  if not found then raise exception 'task_not_found'; end if;
end;
$$;

create or replace function public.delete_reference_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_employee_id bigint;
begin
  v_employee_id := public.sharing_current_employee_id();
  delete from public.reference_tasks where id = p_task_id and assigned_to = v_employee_id;
  if not found then raise exception 'task_not_found'; end if;
end;
$$;

revoke all on public.reference_tasks from anon, authenticated;
grant select on public.reference_tasks to authenticated;
revoke all on function public.create_reference_task(bigint), public.set_reference_task_status(uuid,boolean), public.delete_reference_task(uuid) from public, anon;
grant execute on function public.create_reference_task(bigint), public.set_reference_task_status(uuid,boolean), public.delete_reference_task(uuid) to authenticated;

alter table public.reference_tasks replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reference_tasks') then
    alter publication supabase_realtime add table public.reference_tasks;
  end if;
exception when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
commit;
