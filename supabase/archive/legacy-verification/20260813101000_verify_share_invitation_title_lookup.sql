select p.proname, p.prosecdef, has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_share_invitation_titles';

select id, shared_item_id, inviter_id, invitee_id, status, permission, created_at, responded_at, updated_at
from public.share_invitations
order by created_at desc
limit 20;
