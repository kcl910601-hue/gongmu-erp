begin;

alter table public.reference_tasks
  add column if not exists title text not null default '요청받은 작업',
  add column if not exists due_date date,
  add column if not exists priority text not null default 'normal';

alter table public.reference_tasks drop constraint if exists reference_tasks_title_check;
alter table public.reference_tasks add constraint reference_tasks_title_check check (char_length(btrim(title)) between 1 and 200);
alter table public.reference_tasks drop constraint if exists reference_tasks_priority_check;
alter table public.reference_tasks add constraint reference_tasks_priority_check check (priority in ('low', 'normal', 'high'));

drop function if exists public.create_reference_task(bigint);
create function public.create_reference_task(
  p_comment_id bigint,
  p_title text,
  p_due_date date default null,
  p_priority text default 'normal'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_employee_id bigint; v_comment public.shared_comments%rowtype; v_task_id uuid;
begin
  v_employee_id := public.sharing_current_employee_id();
  if v_employee_id is null then raise exception 'not_authorized'; end if;
  if nullif(btrim(p_title), '') is null or char_length(btrim(p_title)) > 200 then raise exception 'invalid_title'; end if;
  if p_priority not in ('low', 'normal', 'high') then raise exception 'invalid_priority'; end if;
  select * into v_comment from public.shared_comments where id = p_comment_id;
  if v_comment.id is null then raise exception 'comment_not_found'; end if;
  if not public.can_comment_shared_item(v_comment.shared_item_id) then raise exception 'not_authorized'; end if;
  insert into public.reference_tasks(comment_id, shared_item_id, created_by, assigned_to, title, due_date, priority)
  values (v_comment.id, v_comment.shared_item_id, v_employee_id, v_employee_id, btrim(p_title), p_due_date, p_priority)
  on conflict (assigned_to, comment_id) where comment_id is not null
  do update set assigned_to = excluded.assigned_to
  returning id into v_task_id;
  return v_task_id;
end;
$$;

create or replace function public.update_reference_task(
  p_task_id uuid,
  p_title text,
  p_due_date date,
  p_priority text,
  p_completed boolean
)
returns void language plpgsql security definer set search_path = public as $$
declare v_employee_id bigint;
begin
  v_employee_id := public.sharing_current_employee_id();
  if v_employee_id is null then raise exception 'not_authorized'; end if;
  if nullif(btrim(p_title), '') is null or char_length(btrim(p_title)) > 200 then raise exception 'invalid_title'; end if;
  if p_priority not in ('low', 'normal', 'high') then raise exception 'invalid_priority'; end if;
  update public.reference_tasks set
    title = btrim(p_title), due_date = p_due_date, priority = p_priority,
    status = case when p_completed then 'completed' else 'pending' end,
    completed_at = case when p_completed then coalesce(completed_at, now()) else null end
  where id = p_task_id and assigned_to = v_employee_id;
  if not found then raise exception 'task_not_found'; end if;
end;
$$;

revoke all on function public.create_reference_task(bigint,text,date,text), public.update_reference_task(uuid,text,date,text,boolean) from public, anon;
grant execute on function public.create_reference_task(bigint,text,date,text), public.update_reference_task(uuid,text,date,text,boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
