begin;

create table if not exists public.shared_items (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('schedule', 'todo', 'memo')),
  item_id uuid not null references public.personal_notes(id) on delete cascade,
  owner_id bigint not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_type, item_id),
  unique (item_id)
);

create table if not exists public.share_invitations (
  id uuid primary key default gen_random_uuid(),
  shared_item_id uuid not null references public.shared_items(id) on delete cascade,
  inviter_id bigint not null references public.employees(id) on delete restrict,
  invitee_id bigint not null references public.employees(id) on delete restrict,
  permission text not null check (permission in ('view', 'edit')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (inviter_id <> invitee_id)
);

create unique index if not exists share_invitations_pending_unique
  on public.share_invitations(shared_item_id, invitee_id)
  where status = 'pending';
create index if not exists share_invitations_invitee_status_idx
  on public.share_invitations(invitee_id, status, created_at desc);
create index if not exists share_invitations_inviter_status_idx
  on public.share_invitations(inviter_id, status, created_at desc);

create table if not exists public.shared_item_members (
  id uuid primary key default gen_random_uuid(),
  shared_item_id uuid not null references public.shared_items(id) on delete cascade,
  employee_id bigint not null references public.employees(id) on delete restrict,
  permission text not null check (permission in ('view', 'edit')),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (shared_item_id, employee_id)
);

create or replace function public.sharing_current_employee_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.employees
  where auth_user_id = auth.uid()
    and active = true
    and approval_status = 'approved'
  limit 1
$$;

create or replace function public.can_view_shared_note(note_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shared_items si
    join public.shared_item_members sim on sim.shared_item_id = si.id
    where si.item_id = note_id
      and sim.employee_id = public.sharing_current_employee_id()
  )
$$;

create or replace function public.can_edit_shared_note(note_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shared_items si
    join public.shared_item_members sim on sim.shared_item_id = si.id
    where si.item_id = note_id
      and sim.employee_id = public.sharing_current_employee_id()
      and sim.permission = 'edit'
  )
$$;

create or replace function public.sharing_can_access_item(p_shared_item_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shared_items where id = p_shared_item_id and owner_id = public.sharing_current_employee_id())
    or exists (select 1 from public.shared_item_members where shared_item_id = p_shared_item_id and employee_id = public.sharing_current_employee_id())
    or exists (select 1 from public.share_invitations where shared_item_id = p_shared_item_id and (inviter_id = public.sharing_current_employee_id() or invitee_id = public.sharing_current_employee_id()))
$$;

drop policy if exists personal_notes_select_own on public.personal_notes;
drop policy if exists personal_notes_update_own on public.personal_notes;
drop policy if exists personal_notes_delete_own on public.personal_notes;
create policy personal_notes_select_owner_or_member on public.personal_notes
  for select to authenticated
  using (user_id = auth.uid() or public.can_view_shared_note(id));
create policy personal_notes_update_owner_or_editor on public.personal_notes
  for update to authenticated
  using (user_id = auth.uid() or public.can_edit_shared_note(id))
  with check (user_id = auth.uid() or public.can_edit_shared_note(id));
create policy personal_notes_delete_owner_only on public.personal_notes
  for delete to authenticated using (user_id = auth.uid());

alter table public.shared_items enable row level security;
alter table public.share_invitations enable row level security;
alter table public.shared_item_members enable row level security;

create policy shared_items_select_related on public.shared_items
  for select to authenticated using (public.sharing_can_access_item(id));
create policy share_invitations_select_related on public.share_invitations
  for select to authenticated using (inviter_id = public.sharing_current_employee_id() or invitee_id = public.sharing_current_employee_id());
create policy shared_item_members_select_related on public.shared_item_members
  for select to authenticated using (public.sharing_can_access_item(shared_item_id));

create or replace function public.create_share_invitation(p_item_id uuid, p_invitee_id bigint, p_permission text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner public.employees%rowtype;
  v_note public.personal_notes%rowtype;
  v_shared_item_id uuid;
  v_invitation_id uuid;
  v_item_type text;
begin
  if p_permission not in ('view', 'edit') then raise exception 'invalid_permission'; end if;
  select * into v_owner from public.employees where auth_user_id = auth.uid() and active = true and approval_status = 'approved';
  if v_owner.id is null then raise exception 'not_authorized'; end if;
  select * into v_note from public.personal_notes where id = p_item_id and user_id = auth.uid();
  if v_note.id is null then raise exception 'owner_only'; end if;
  if p_invitee_id = v_owner.id then raise exception 'cannot_share_with_self'; end if;
  if not exists (select 1 from public.employees where id = p_invitee_id and active = true and approval_status = 'approved' and auth_user_id is not null) then raise exception 'inactive_invitee'; end if;
  v_item_type := case when v_note.note_type = 'todo' then 'todo' when v_note.note_type = 'reminder' then 'schedule' else 'memo' end;
  insert into public.shared_items(item_type, item_id, owner_id)
  values (v_item_type, p_item_id, v_owner.id)
  on conflict (item_id) do update set updated_at = now()
  returning id into v_shared_item_id;
  if exists (select 1 from public.shared_item_members where shared_item_id = v_shared_item_id and employee_id = p_invitee_id) then raise exception 'already_member'; end if;
  insert into public.share_invitations(shared_item_id, inviter_id, invitee_id, permission)
  values (v_shared_item_id, v_owner.id, p_invitee_id, p_permission)
  returning id into v_invitation_id;
  insert into public.activity_logs(activity_type, action_type, target_type, target_id, employee_id, employee_name, employee_email, title, description, metadata)
  values ('share_invitation_create', 'share_invitation_create', v_item_type, null, v_owner.id, v_owner.name, v_owner.email, '공유 요청 전송', coalesce(nullif(v_note.title, ''), v_note.content), jsonb_build_object('item_id', p_item_id, 'invitation_id', v_invitation_id, 'invitee_id', p_invitee_id, 'permission', p_permission));
  return v_invitation_id;
end;
$$;

create or replace function public.respond_share_invitation(p_invitation_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_employee_id bigint; v_invitation public.share_invitations%rowtype;
begin
  v_employee_id := public.sharing_current_employee_id();
  update public.share_invitations set status = case when p_accept then 'accepted' else 'rejected' end, responded_at = now(), updated_at = now()
  where id = p_invitation_id and invitee_id = v_employee_id and status = 'pending'
  returning * into v_invitation;
  if v_invitation.id is null then raise exception 'invitation_not_pending'; end if;
  if p_accept then
    insert into public.shared_item_members(shared_item_id, employee_id, permission)
    values (v_invitation.shared_item_id, v_employee_id, v_invitation.permission)
    on conflict (shared_item_id, employee_id) do nothing;
  end if;
end;
$$;

create or replace function public.cancel_share_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.share_invitations set status = 'cancelled', updated_at = now()
  where id = p_invitation_id and inviter_id = public.sharing_current_employee_id() and status = 'pending';
  if not found then raise exception 'invitation_not_pending'; end if;
end;
$$;

create or replace function public.remove_shared_member(p_shared_item_id uuid, p_employee_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.shared_items where id = p_shared_item_id and owner_id = public.sharing_current_employee_id()) then raise exception 'owner_only'; end if;
  delete from public.shared_item_members where shared_item_id = p_shared_item_id and employee_id = p_employee_id;
end;
$$;

create or replace function public.update_shared_member_permission(p_shared_item_id uuid, p_employee_id bigint, p_permission text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_permission not in ('view', 'edit') then raise exception 'invalid_permission'; end if;
  if not exists (select 1 from public.shared_items where id = p_shared_item_id and owner_id = public.sharing_current_employee_id()) then raise exception 'owner_only'; end if;
  update public.shared_item_members set permission = p_permission where shared_item_id = p_shared_item_id and employee_id = p_employee_id;
  if not found then raise exception 'member_not_found'; end if;
end;
$$;

revoke all on public.shared_items, public.share_invitations, public.shared_item_members from anon, authenticated;
grant select on public.shared_items, public.share_invitations, public.shared_item_members to authenticated;
grant execute on function public.sharing_current_employee_id(), public.can_view_shared_note(uuid), public.can_edit_shared_note(uuid), public.sharing_can_access_item(uuid), public.create_share_invitation(uuid,bigint,text), public.respond_share_invitation(uuid,boolean), public.cancel_share_invitation(uuid), public.remove_shared_member(uuid,bigint), public.update_shared_member_permission(uuid,bigint,text) to authenticated;

notify pgrst, 'reload schema';
commit;
