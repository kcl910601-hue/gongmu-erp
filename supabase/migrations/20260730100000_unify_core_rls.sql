-- Sprint 5-11B: replace legacy core-table policies with the ERP role model.

begin;

create table if not exists public.rls_policy_backups (
  captured_for text not null,
  captured_at timestamptz not null default now(),
  schemaname text not null,
  tablename text not null,
  policyname text not null,
  permissive text not null,
  roles name[] not null,
  cmd text not null,
  qual text,
  with_check text,
  primary key (captured_for, schemaname, tablename, policyname)
);

revoke all on table public.rls_policy_backups from public, anon, authenticated;

insert into public.rls_policy_backups (
  captured_for, schemaname, tablename, policyname,
  permissive, roles, cmd, qual, with_check
)
select
  'sprint-5-11b', schemaname, tablename, policyname,
  permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = any(array['projects', 'tasks', 'shipments', 'activity_logs'])
on conflict do nothing;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array['projects', 'tasks', 'shipments', 'activity_logs'])
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.shipments enable row level security;
alter table public.activity_logs enable row level security;

create policy projects_select_erp_user
  on public.projects as permissive for select to authenticated
  using (public.is_approved_erp_user());
create policy projects_insert_manager
  on public.projects as permissive for insert to authenticated
  with check (public.can_manage_projects());
create policy projects_update_manager
  on public.projects as permissive for update to authenticated
  using (public.can_manage_projects())
  with check (public.can_manage_projects());
create policy projects_delete_admin
  on public.projects as permissive for delete to authenticated
  using (public.is_approved_admin());

create policy tasks_select_erp_user
  on public.tasks as permissive for select to authenticated
  using (public.is_approved_erp_user());
create policy tasks_insert_editor
  on public.tasks as permissive for insert to authenticated
  with check (public.can_edit_tasks());
create policy tasks_update_editor
  on public.tasks as permissive for update to authenticated
  using (public.can_edit_tasks())
  with check (public.can_edit_tasks());
create policy tasks_delete_admin
  on public.tasks as permissive for delete to authenticated
  using (public.is_approved_admin());

create policy shipments_select_erp_user
  on public.shipments as permissive for select to authenticated
  using (public.is_approved_erp_user());
create policy shipments_insert_editor
  on public.shipments as permissive for insert to authenticated
  with check (public.can_edit_tasks());
create policy shipments_update_editor
  on public.shipments as permissive for update to authenticated
  using (public.can_edit_tasks())
  with check (public.can_edit_tasks());
create policy shipments_delete_admin
  on public.shipments as permissive for delete to authenticated
  using (public.is_approved_admin());

create policy activity_logs_select_erp_user
  on public.activity_logs as permissive for select to authenticated
  using (public.is_approved_erp_user());
create policy activity_logs_insert_editor
  on public.activity_logs as permissive for insert to authenticated
  with check (public.can_edit_tasks());

revoke all on table public.projects, public.tasks, public.shipments, public.activity_logs from anon;
grant select, insert, update, delete on table public.projects, public.tasks, public.shipments to authenticated;
grant select, insert on table public.activity_logs to authenticated;
revoke update, delete on table public.activity_logs from authenticated;

-- delete_project_task is SECURITY DEFINER, so it must enforce Admin separately.
create or replace function public.delete_project_task(p_task_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.tasks%rowtype;
  v_project_status text;
  v_unlinked_shipments integer := 0;
  v_deleted integer := 0;
begin
  if not public.is_approved_admin() then
    raise exception using message = '업무 삭제 권한이 없습니다.', errcode = '42501';
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception using message = '삭제할 업무를 찾을 수 없습니다.', errcode = 'P0002';
  end if;

  update public.shipments set task_id = null where task_id = p_task_id;
  get diagnostics v_unlinked_shipments = row_count;

  delete from public.tasks where id = p_task_id;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception using message = '업무가 삭제되지 않았습니다.', errcode = 'P0001';
  end if;

  with ordered as (
    select id,
      row_number() over (
        partition by project_section_id
        order by task_order nulls last, id
      )::integer as next_order
    from public.tasks
    where project_id = v_task.project_id
  )
  update public.tasks task
  set task_order = ordered.next_order
  from ordered
  where task.id = ordered.id
    and task.task_order is distinct from ordered.next_order;

  select case
    when count(*) = 0 then 'pending'
    when bool_and(coalesce(status, 'pending') in ('completed', '완료')) then 'completed'
    when bool_or(coalesce(status, 'pending') in ('in_progress', '진행중', 'completed', '완료')) then 'in_progress'
    else 'pending'
  end into v_project_status
  from public.tasks
  where project_id = v_task.project_id;

  update public.projects
  set status = v_project_status, updated_at = now()
  where id = v_task.project_id;

  return jsonb_build_object(
    'deleted_task_id', v_task.id,
    'project_id', v_task.project_id,
    'project_status', v_project_status,
    'unlinked_shipment_count', v_unlinked_shipments
  );
end;
$$;

revoke all on function public.delete_project_task(bigint) from public, anon;
grant execute on function public.delete_project_task(bigint) to authenticated;

commit;
