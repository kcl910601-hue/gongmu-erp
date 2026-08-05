create table if not exists public.editing_locks (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null,
  resource_id text not null,
  employee_id bigint not null references public.employees(id) on delete cascade,
  lock_token uuid not null unique default gen_random_uuid(),
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '60 seconds'),
  constraint editing_locks_resource_type_check check (resource_type in ('project','task','personal_note','shipment','employee','comment','setting')),
  constraint editing_locks_resource_key_unique unique (resource_type, resource_id)
);

alter table public.editing_locks enable row level security;
revoke all on table public.editing_locks from anon, authenticated;

create or replace function public.assert_editing_lock_permission(p_resource_type text, p_resource_id text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id bigint;
  v_allowed boolean := false;
begin
  select id into v_employee_id from public.employees
  where auth_user_id = auth.uid() and active = true and approval_status = 'approved';
  if v_employee_id is null then raise exception 'permission denied'; end if;

  case p_resource_type
    when 'project' then
      v_allowed := p_resource_id ~ '^[0-9]+$' and public.can_manage_projects()
        and exists (select 1 from public.projects where id = p_resource_id::bigint);
    when 'task' then
      v_allowed := p_resource_id ~ '^[0-9]+$' and public.can_edit_tasks()
        and exists (select 1 from public.tasks where id = p_resource_id::bigint);
    when 'shipment' then
      v_allowed := p_resource_id ~ '^[0-9]+$' and public.can_edit_tasks()
        and exists (select 1 from public.shipments where id = p_resource_id::bigint);
    when 'employee' then
      v_allowed := p_resource_id ~ '^[0-9]+$' and public.is_approved_admin()
        and exists (select 1 from public.employees where id = p_resource_id::bigint);
    when 'setting' then
      v_allowed := public.can_manage_settings();
    when 'comment' then
      v_allowed := p_resource_id ~ '^[0-9]+$'
        and exists (select 1 from public.shared_comments where id = p_resource_id::bigint and author_id = v_employee_id);
    when 'personal_note' then
      v_allowed := p_resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (
          exists (select 1 from public.personal_notes where id = p_resource_id::uuid and user_id = auth.uid())
          or exists (
            select 1 from public.shared_items si
            join public.shared_item_members sim on sim.shared_item_id = si.id
            where si.item_id = p_resource_id::uuid and sim.employee_id = v_employee_id and sim.permission = 'edit'
          )
        );
    else v_allowed := false;
  end case;
  if not v_allowed then raise exception 'resource not editable'; end if;
  return v_employee_id;
end;
$$;

create or replace function public.acquire_editing_lock(p_resource_type text, p_resource_id text)
returns table(acquired boolean, lock_token uuid, employee_id bigint, employee_name text, expires_at timestamptz, is_mine boolean)
language plpgsql security definer set search_path = public
as $$
declare v_employee_id bigint; v_inserted integer;
begin
  v_employee_id := public.assert_editing_lock_permission(p_resource_type, p_resource_id);
  delete from public.editing_locks l where l.resource_type = p_resource_type and l.resource_id = p_resource_id and l.expires_at <= now();
  insert into public.editing_locks(resource_type, resource_id, employee_id)
  values (p_resource_type, p_resource_id, v_employee_id)
  on conflict (resource_type, resource_id) do nothing;
  get diagnostics v_inserted = row_count;
  return query select v_inserted = 1, l.lock_token, l.employee_id, e.name, l.expires_at, l.employee_id = v_employee_id
    from public.editing_locks l join public.employees e on e.id = l.employee_id
    where l.resource_type = p_resource_type and l.resource_id = p_resource_id;
end;
$$;

create or replace function public.heartbeat_editing_lock(p_lock_token uuid)
returns table(resource_type text, resource_id text, employee_id bigint, employee_name text, expires_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_employee_id bigint;
begin
  select id into v_employee_id from public.employees where auth_user_id = auth.uid() and active = true and approval_status = 'approved';
  return query update public.editing_locks l set heartbeat_at = now(), expires_at = now() + interval '60 seconds'
    from public.employees e where l.lock_token = p_lock_token and l.employee_id = v_employee_id and l.expires_at > now() and e.id = l.employee_id
    returning l.resource_type, l.resource_id, l.employee_id, e.name, l.expires_at;
end;
$$;

create or replace function public.release_editing_lock(p_lock_token uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_employee_id bigint; v_deleted integer;
begin
  select id into v_employee_id from public.employees where auth_user_id = auth.uid() and active = true and approval_status = 'approved';
  delete from public.editing_locks where lock_token = p_lock_token and employee_id = v_employee_id;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

create or replace function public.get_editing_lock_status(p_resource_type text, p_resource_id text)
returns table(employee_id bigint, employee_name text, expires_at timestamptz, is_mine boolean)
language plpgsql security definer set search_path = public
as $$
declare v_employee_id bigint;
begin
  v_employee_id := public.assert_editing_lock_permission(p_resource_type, p_resource_id);
  delete from public.editing_locks l where l.resource_type = p_resource_type and l.resource_id = p_resource_id and l.expires_at <= now();
  return query select l.employee_id, e.name, l.expires_at, l.employee_id = v_employee_id
    from public.editing_locks l join public.employees e on e.id = l.employee_id
    where l.resource_type = p_resource_type and l.resource_id = p_resource_id;
end;
$$;

revoke all on function public.assert_editing_lock_permission(text,text) from public;
revoke all on function public.acquire_editing_lock(text,text) from public;
revoke all on function public.heartbeat_editing_lock(uuid) from public;
revoke all on function public.release_editing_lock(uuid) from public;
revoke all on function public.get_editing_lock_status(text,text) from public;
grant execute on function public.acquire_editing_lock(text,text) to authenticated;
grant execute on function public.heartbeat_editing_lock(uuid) to authenticated;
grant execute on function public.release_editing_lock(uuid) to authenticated;
grant execute on function public.get_editing_lock_status(text,text) to authenticated;
