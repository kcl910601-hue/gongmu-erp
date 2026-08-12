begin;

create or replace function public.get_share_invitation_titles(p_invitation_ids uuid[])
returns table(invitation_id uuid, item_title text)
language sql
stable
security definer
set search_path = public
as $$
  select invitation.id,
         coalesce(nullif(note.title, ''), nullif(note.content, ''), '제목 없음')
  from public.share_invitations invitation
  join public.shared_items shared_item on shared_item.id = invitation.shared_item_id
  join public.personal_notes note on note.id = shared_item.item_id
  where invitation.id = any(coalesce(p_invitation_ids, array[]::uuid[]))
    and (
      invitation.inviter_id = public.sharing_current_employee_id()
      or invitation.invitee_id = public.sharing_current_employee_id()
    );
$$;

revoke all on function public.get_share_invitation_titles(uuid[]) from public, anon;
grant execute on function public.get_share_invitation_titles(uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
