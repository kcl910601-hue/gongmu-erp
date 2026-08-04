select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in (
    'personal_notes',
    'shared_item_members',
    'share_invitations',
    'shared_comments',
    'activity_logs',
    'notification_reads'
  )
order by tablename;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'personal_notes',
    'shared_item_members',
    'share_invitations',
    'shared_comments',
    'activity_logs',
    'notification_reads'
  )
order by tablename;
