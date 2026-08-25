-- Run this read-only preflight before the repair migration and save the result.

select now() as captured_at,
       to_regclass('public.lme_price_records') as lme_table,
       to_regclass('public.lme_status_thresholds') as threshold_table,
       to_regclass('public.suppliers') as suppliers_table,
       (select count(*) from public.lme_price_records) as lme_row_count_before_repair;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'lme_price_records'
order by ordinal_position;

select conname, contype, convalidated, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.lme_price_records'::regclass
order by conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'lme_price_records'
order by indexname;

select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = any(array['lme_price_records', 'lme_status_thresholds', 'suppliers'])
order by tablename, cmd, policyname;

