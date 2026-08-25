-- Run after 20260803150000_create_shared_workspace.sql.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('shared_items', 'share_invitations', 'shared_item_members')
order by table_name;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('personal_notes', 'shared_items', 'share_invitations', 'shared_item_members')
order by tablename, policyname;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'create_share_invitation', 'respond_share_invitation',
    'cancel_share_invitation', 'remove_shared_member',
    'update_shared_member_permission', 'can_view_shared_note',
    'can_edit_shared_note', 'sharing_can_access_item'
  )
order by routine_name;

-- The result must remain zero: sharing never creates a personal_notes copy.
select item_id, count(*) as original_note_count
from public.shared_items
join public.personal_notes on personal_notes.id = shared_items.item_id
group by item_id
having count(*) <> 1;
