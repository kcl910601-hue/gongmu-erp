select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'dashboard_preferences'
order by ordinal_position;

select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'dashboard_preferences'
order by policyname;
