select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'shared_comment_reads'
order by ordinal_position;

select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'shared_comment_reads';

select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shared_comment_reads';

select has_function_privilege('authenticated', 'public.mark_shared_comments_read(uuid,bigint)', 'EXECUTE') as can_mark_read,
       has_function_privilege('authenticated', 'public.get_shared_comment_count_stats(uuid[])', 'EXECUTE') as can_read_stats;
