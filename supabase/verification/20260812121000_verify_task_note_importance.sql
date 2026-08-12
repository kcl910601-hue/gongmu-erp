select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'task_notes' and column_name = 'is_important';

select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_notes';

select count(*) filter (where is_important) as important_notes,
       count(*) filter (where not is_important) as normal_notes
from public.task_notes;
