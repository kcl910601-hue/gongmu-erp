select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'accept_all_share_invitations';

select invitee_id, status, count(*)
from public.share_invitations
group by invitee_id, status
order by invitee_id, status;

select invitation.id, invitation.invitee_id, invitation.status,
       member.id as member_id, member.permission
from public.share_invitations invitation
left join public.shared_item_members member
  on member.shared_item_id = invitation.shared_item_id
 and member.employee_id = invitation.invitee_id
where invitation.status = 'accepted'
order by invitation.updated_at desc
limit 100;
