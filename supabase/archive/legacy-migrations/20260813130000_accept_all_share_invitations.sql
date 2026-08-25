create or replace function public.accept_all_share_invitations()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee_id bigint;
  v_requested integer := 0;
  v_accepted integer := 0;
begin
  v_employee_id := public.sharing_current_employee_id();
  if v_employee_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  with pending as materialized (
    select invitation.id, invitation.shared_item_id, invitation.permission
    from public.share_invitations invitation
    where invitation.invitee_id = v_employee_id
      and invitation.status = 'pending'
    order by invitation.created_at asc, invitation.id asc
    for update
  ), inserted_members as (
    insert into public.shared_item_members(shared_item_id, employee_id, permission)
    select pending.shared_item_id, v_employee_id, pending.permission
    from pending
    on conflict (shared_item_id, employee_id) do nothing
  ), accepted as (
    update public.share_invitations invitation
    set status = 'accepted', responded_at = now(), updated_at = now()
    from pending
    where invitation.id = pending.id
      and invitation.invitee_id = v_employee_id
      and invitation.status = 'pending'
    returning invitation.id
  )
  select (select count(*) from pending), (select count(*) from accepted)
  into v_requested, v_accepted;

  return jsonb_build_object(
    'requested', v_requested,
    'accepted', v_accepted,
    'skipped', greatest(v_requested - v_accepted, 0),
    'failed', 0
  );
end;
$$;

revoke all on function public.accept_all_share_invitations() from public, anon;
grant execute on function public.accept_all_share_invitations() to authenticated;
notify pgrst, 'reload schema';
