begin;

alter table public.activity_logs add column if not exists source_item_id uuid;
create index if not exists activity_logs_source_item_created_at_idx
  on public.activity_logs(source_item_id, created_at) where source_item_id is not null;

create or replace function public.can_view_shared_activity(p_item_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.personal_notes pn
    join public.employees e on e.auth_user_id = pn.user_id
    where pn.id = p_item_id and e.id = public.sharing_current_employee_id()
  ) or exists (
    select 1 from public.shared_items si
    join public.shared_item_members sim on sim.shared_item_id = si.id
    where si.item_id = p_item_id and sim.employee_id = public.sharing_current_employee_id()
  )
$$;

create or replace function public.record_shared_workspace_activity(
  p_item_id uuid,
  p_activity_type text,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_employee public.employees%rowtype; v_note public.personal_notes%rowtype; v_log_id bigint;
begin
  if p_activity_type not in (
    'personal_note_create','personal_note_update','personal_note_date_change','personal_note_delete',
    'share_invitation_create','share_invitation_accept','share_invitation_reject','share_invitation_cancel',
    'share_member_permission_change','share_member_remove',
    'shared_comment_create','shared_comment_update','shared_comment_delete'
  ) then raise exception 'invalid_activity_type'; end if;
  select * into v_employee from public.employees
  where auth_user_id = auth.uid() and active = true and approval_status = 'approved';
  if v_employee.id is null then raise exception 'not_authorized'; end if;
  select * into v_note from public.personal_notes where id = p_item_id;
  if v_note.id is null then raise exception 'item_not_found'; end if;
  if not (
    v_note.user_id = auth.uid()
    or exists (select 1 from public.shared_items si join public.shared_item_members sim on sim.shared_item_id = si.id where si.item_id = p_item_id and sim.employee_id = v_employee.id)
    or exists (select 1 from public.shared_items si join public.share_invitations inv on inv.shared_item_id = si.id where si.item_id = p_item_id and (inv.inviter_id = v_employee.id or inv.invitee_id = v_employee.id))
  ) then raise exception 'not_authorized'; end if;
  insert into public.activity_logs(
    activity_type, action_type, target_type, target_id, project_id, employee_id,
    employee_name, employee_email, title, description, metadata, source_item_id
  ) values (
    p_activity_type, p_activity_type, 'personal_note', null, null, v_employee.id,
    v_employee.name, v_employee.email,
    case p_activity_type
      when 'personal_note_create' then '일정 생성' when 'personal_note_update' then '일정 수정'
      when 'personal_note_date_change' then '날짜 변경' when 'personal_note_delete' then '원본 삭제'
      when 'share_invitation_create' then '공유 요청' when 'share_invitation_accept' then '공유 수락'
      when 'share_invitation_reject' then '공유 거절' when 'share_invitation_cancel' then '공유 요청 취소'
      when 'share_member_permission_change' then '참여자 권한 변경' when 'share_member_remove' then '공유 해제'
      when 'shared_comment_create' then '댓글 작성' when 'shared_comment_update' then '댓글 수정'
      when 'shared_comment_delete' then '댓글 삭제' else p_activity_type end,
    p_description, coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('personal_note_id', p_item_id), p_item_id
  ) returning id into v_log_id;
  return v_log_id;
end;
$$;

create or replace function public.log_personal_note_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_shared_workspace_activity(new.id, 'personal_note_create', coalesce(nullif(new.title, ''), new.content), '{}'::jsonb);
    return new;
  elsif tg_op = 'UPDATE' then
    if old.due_date is distinct from new.due_date then
      perform public.record_shared_workspace_activity(new.id, 'personal_note_date_change', null, jsonb_build_object('before', old.due_date, 'after', new.due_date));
    end if;
    if (old.note_type, old.title, old.content, old.is_completed, old.is_pinned, old.color, old.sort_order)
       is distinct from
       (new.note_type, new.title, new.content, new.is_completed, new.is_pinned, new.color, new.sort_order) then
      perform public.record_shared_workspace_activity(new.id, 'personal_note_update', null, jsonb_build_object('before_title', old.title, 'after_title', new.title));
    end if;
    return new;
  else
    perform public.record_shared_workspace_activity(old.id, 'personal_note_delete', coalesce(nullif(old.title, ''), old.content), '{}'::jsonb);
    return old;
  end if;
end;
$$;

create or replace function public.log_shared_comment_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item_id uuid;
begin
  select item_id into v_item_id from public.shared_items where id = coalesce(new.shared_item_id, old.shared_item_id);
  if not exists (select 1 from public.personal_notes where id = v_item_id) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'INSERT' then
    perform public.record_shared_workspace_activity(v_item_id, 'shared_comment_create', left(new.content, 120), jsonb_build_object('comment_id', new.id)); return new;
  elsif tg_op = 'UPDATE' then
    perform public.record_shared_workspace_activity(v_item_id, 'shared_comment_update', left(new.content, 120), jsonb_build_object('comment_id', new.id)); return new;
  else
    perform public.record_shared_workspace_activity(v_item_id, 'shared_comment_delete', left(old.content, 120), jsonb_build_object('comment_id', old.id)); return old;
  end if;
end;
$$;

create or replace function public.log_share_invitation_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item_id uuid; v_type text;
begin
  select item_id into v_item_id from public.shared_items where id = new.shared_item_id;
  if tg_op = 'INSERT' then v_type := 'share_invitation_create';
  elsif old.status is not distinct from new.status then return new;
  elsif new.status = 'accepted' then v_type := 'share_invitation_accept';
  elsif new.status = 'rejected' then v_type := 'share_invitation_reject';
  elsif new.status = 'cancelled' then v_type := 'share_invitation_cancel';
  else return new; end if;
  perform public.record_shared_workspace_activity(v_item_id, v_type, null, jsonb_build_object('invitee_id', new.invitee_id, 'permission', new.permission, 'status', new.status));
  return new;
end;
$$;

create or replace function public.log_shared_member_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item_id uuid;
begin
  select item_id into v_item_id from public.shared_items where id = coalesce(new.shared_item_id, old.shared_item_id);
  if not exists (select 1 from public.personal_notes where id = v_item_id) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'UPDATE' and old.permission is distinct from new.permission then
    perform public.record_shared_workspace_activity(v_item_id, 'share_member_permission_change', old.permission || ' → ' || new.permission, jsonb_build_object('employee_id', new.employee_id, 'before', old.permission, 'after', new.permission)); return new;
  elsif tg_op = 'DELETE' then
    perform public.record_shared_workspace_activity(v_item_id, 'share_member_remove', null, jsonb_build_object('employee_id', old.employee_id, 'permission', old.permission)); return old;
  end if;
  return new;
end;
$$;

-- Sprint 8-8A 함수의 별도 activity_logs INSERT를 제거하고 아래 trigger 한 곳에서만 기록합니다.
create or replace function public.create_share_invitation(p_item_id uuid, p_invitee_id bigint, p_permission text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_owner public.employees%rowtype; v_note public.personal_notes%rowtype;
  v_shared_item_id uuid; v_invitation_id uuid; v_item_type text;
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
  return v_invitation_id;
end;
$$;

drop trigger if exists log_personal_note_activity on public.personal_notes;
drop trigger if exists log_personal_note_delete_activity on public.personal_notes;
create trigger log_personal_note_activity after insert or update on public.personal_notes
for each row execute function public.log_personal_note_activity();
create trigger log_personal_note_delete_activity before delete on public.personal_notes
for each row execute function public.log_personal_note_activity();
drop trigger if exists log_shared_comment_activity on public.shared_comments;
drop trigger if exists log_shared_comment_delete_activity on public.shared_comments;
create trigger log_shared_comment_activity after insert or update on public.shared_comments
for each row execute function public.log_shared_comment_activity();
create trigger log_shared_comment_delete_activity before delete on public.shared_comments
for each row execute function public.log_shared_comment_activity();
drop trigger if exists log_share_invitation_activity on public.share_invitations;
create trigger log_share_invitation_activity after insert or update on public.share_invitations
for each row execute function public.log_share_invitation_activity();
drop trigger if exists log_shared_member_activity on public.shared_item_members;
drop trigger if exists log_shared_member_remove_activity on public.shared_item_members;
create trigger log_shared_member_activity after update on public.shared_item_members
for each row execute function public.log_shared_member_activity();
create trigger log_shared_member_remove_activity before delete on public.shared_item_members
for each row execute function public.log_shared_member_activity();

drop policy if exists activity_logs_select_erp_user on public.activity_logs;
create policy activity_logs_select_erp_user on public.activity_logs as permissive for select to authenticated
  using (
    public.is_approved_erp_user()
    and (source_item_id is null or public.can_view_shared_activity(source_item_id))
  );

grant execute on function public.can_view_shared_activity(uuid), public.record_shared_workspace_activity(uuid,text,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
