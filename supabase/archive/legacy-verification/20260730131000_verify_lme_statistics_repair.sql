-- Read-only verification after 20260730130000_repair_lme_statistics_schema.sql.

-- 1, 14. Table existence and post-repair row count. Compare this count with the preflight count.
select to_regclass('public.suppliers') as suppliers_table,
       to_regclass('public.lme_price_records') as lme_price_records_table,
       (select count(*) from public.lme_price_records) as lme_row_count_after_repair;

-- 2, 7. Required columns. missing_required_columns must be empty.
with required(column_name) as (values
  ('id'), ('reference_date'), ('reference_month'), ('round'), ('supplier_id'),
  ('lme_al_usd_per_ton'), ('exchange_rate_krw_per_usd'), ('domestic_lme_krw_per_kg'),
  ('processing_cost_krw_per_kg'), ('standard_cost_krw_per_kg'), ('applied_price_krw_per_kg'),
  ('difference_krw_per_kg'), ('difference_rate'), ('status'), ('effective_start_date'),
  ('effective_end_date'), ('quantity_ton'), ('source_url'), ('memo'), ('created_by'),
  ('created_by_name'), ('created_at'), ('updated_by'), ('updated_at'), ('revision'),
  ('supersedes_id'), ('is_current')
), actual as (
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'lme_price_records'
)
select array_agg(required.column_name order by required.column_name) as missing_required_columns
from required left join actual using (column_name)
where actual.column_name is null;

-- 3, 4. Both FK columns must be uuid.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (('lme_price_records', 'supplier_id'), ('suppliers', 'id'))
order by table_name;

-- 5, 6. Named FK and its PostgREST-discoverable column relationship.
select conname as constraint_name,
       conrelid::regclass as source_table,
       confrelid::regclass as target_table,
       pg_get_constraintdef(oid) as definition,
       convalidated as validated
from pg_constraint
where conrelid = 'public.lme_price_records'::regclass
  and contype = 'f'
  and conname = 'lme_price_records_supplier_id_fkey';

-- 8. Partial unique index must contain WHERE is_current.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'lme_price_records'
  and indexname = 'lme_price_records_current_month_round_supplier_uidx';

-- 9, 10. Trigger and function.
select trigger_name, event_manipulation, action_timing, action_statement
from information_schema.triggers
where event_object_schema = 'public' and event_object_table = 'lme_price_records';
select n.nspname as function_schema, p.proname, p.prosecdef as security_definer,
       pg_get_function_result(p.oid) as result_type,
       p.proconfig as function_config
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'calculate_lme_price_record';

-- 11, 12. RLS and expected policies.
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

-- 13. Every anon privilege must be false.
select table_name,
  has_table_privilege('anon', format('public.%I', table_name), 'SELECT') as anon_select,
  has_table_privilege('anon', format('public.%I', table_name), 'INSERT') as anon_insert,
  has_table_privilege('anon', format('public.%I', table_name), 'UPDATE') as anon_update,
  has_table_privilege('anon', format('public.%I', table_name), 'DELETE') as anon_delete
from unnest(array['suppliers', 'lme_status_thresholds', 'lme_price_records']) as tables(table_name);

-- 15, 16. Both counts must be zero.
select count(*) as null_supplier_id_count
from public.lme_price_records where supplier_id is null;
select count(*) as broken_supplier_fk_count
from public.lme_price_records record
left join public.suppliers supplier on supplier.id = record.supplier_id
where supplier.id is null;

-- 17. Must return no rows.
select reference_month, round, supplier_id, count(*) as current_count
from public.lme_price_records
where is_current
group by reference_month, round, supplier_id
having count(*) > 1;

-- 18. Revision numbers must be contiguous and supersedes_id must point to the prior row.
with chain as (
  select id, reference_month, round, supplier_id, revision, supersedes_id,
    lag(id) over (partition by reference_month, round, supplier_id order by revision) as expected_supersedes_id,
    row_number() over (partition by reference_month, round, supplier_id order by revision) as expected_revision
  from public.lme_price_records
)
select * from chain
where revision <> expected_revision
   or supersedes_id is distinct from expected_supersedes_id;

-- 19. Must be zero.
select count(*) as invalid_reference_month_count
from public.lme_price_records
where reference_month <> date_trunc('month', reference_date)::date;

-- 20. Pure sample calculation: expected 4629.9313 / 4829.9313 / 170.0687 / 3.5211.
with sample as (
  select 3159.5::numeric as lme, 1465.4::numeric as exchange_rate,
         200::numeric as processing_cost, 5000::numeric as applied_price
), calculated as (
  select round(lme * exchange_rate / 1000, 4) as domestic_lme,
         round(lme * exchange_rate / 1000 + processing_cost, 4) as standard_cost,
         applied_price from sample
)
select domestic_lme, standard_cost,
       round(applied_price - standard_cost, 4) as difference,
       case when standard_cost = 0 then 0 else round((applied_price - standard_cost) / standard_cost * 100, 4) end as difference_rate
from calculated;

-- Stored calculations must match the same formulas. Must be zero.
select count(*) as stored_calculation_mismatch_count
from public.lme_price_records
where domestic_lme_krw_per_kg <> round(lme_al_usd_per_ton * exchange_rate_krw_per_usd / 1000, 4)
   or standard_cost_krw_per_kg <> round(lme_al_usd_per_ton * exchange_rate_krw_per_usd / 1000 + processing_cost_krw_per_kg, 4)
   or difference_krw_per_kg <> round(applied_price_krw_per_kg - standard_cost_krw_per_kg, 4)
   or difference_rate <> case when standard_cost_krw_per_kg = 0 then 0 else round(difference_krw_per_kg / standard_cost_krw_per_kg * 100, 4) end;
