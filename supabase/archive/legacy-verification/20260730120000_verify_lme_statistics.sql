-- Run after 20260730120000_create_lme_price_records.sql.

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = any(array['suppliers', 'lme_status_thresholds', 'lme_price_records'])
order by c.relname;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = any(array['suppliers', 'lme_status_thresholds', 'lme_price_records'])
order by tablename, cmd, policyname;

select table_name,
  has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') as can_select,
  has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT') as has_insert_grant,
  has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE') as has_update_grant,
  has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') as has_delete_grant,
  has_table_privilege('authenticated', format('public.%I', table_name), 'TRUNCATE') as can_truncate
from unnest(array['suppliers', 'lme_status_thresholds', 'lme_price_records']) as tables(table_name)
order by table_name;

select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.lme_price_records'::regclass
order by conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = any(array['suppliers', 'lme_price_records'])
order by tablename, indexname;

