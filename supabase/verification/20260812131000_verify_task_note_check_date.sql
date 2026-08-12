select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'task_notes' and column_name = 'check_date';

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'task_notes' and indexname = 'task_notes_check_date_idx';

select count(*) filter (where check_date is null) as without_check_date,
       count(*) filter (where check_date is not null) as with_check_date
from public.task_notes;
