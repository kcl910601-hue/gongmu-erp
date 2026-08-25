begin;
select to_regclass('public.lme_materials'), to_regclass('public.lme_market_prices'), to_regclass('public.lme_market_kpi_cache'), to_regclass('public.lme_import_logs');
select code, name, is_active from public.lme_materials order by code;
select relname, relrowsecurity from pg_class where oid in ('public.lme_materials'::regclass, 'public.lme_market_prices'::regclass, 'public.lme_import_logs'::regclass);
select conname, contype from pg_constraint where conrelid = 'public.lme_market_prices'::regclass order by conname;
select policyname, cmd from pg_policies where schemaname = 'public' and tablename in ('lme_materials', 'lme_market_prices', 'lme_import_logs') order by tablename, policyname;
select count(*) as duplicate_keys from (select reference_month, round, material_code from public.lme_market_prices group by 1,2,3 having count(*) > 1) duplicate_rows;
select count(*) as invalid_months from public.lme_market_prices where reference_month <> date_trunc('month', reference_month)::date or reference_month <> date_trunc('month', reference_date)::date;
select count(*) as invalid_calculations from public.lme_market_prices where domestic_lme_krw_per_kg <> round(lme_al_usd_per_ton * exchange_rate_krw_per_usd / 1000, 4);
select * from public.lme_market_kpi_cache order by material_code;
select cache.material_code, cache.latest_reference_date, source.latest_reference_date as expected_latest
from public.lme_market_kpi_cache cache
join (select material_code, max(reference_date) latest_reference_date from public.lme_market_prices group by material_code) source using (material_code)
where cache.latest_reference_date <> source.latest_reference_date;
select has_table_privilege('anon', 'public.lme_market_prices', 'select') as anon_market_select,
       has_table_privilege('authenticated', 'public.lme_market_prices', 'update') as authenticated_market_update,
       has_table_privilege('authenticated', 'public.lme_market_prices', 'delete') as authenticated_market_delete;
select has_function_privilege('anon', 'public.import_lme_market_prices(jsonb,text,text,integer)', 'execute') as anon_import_execute,
       has_function_privilege('authenticated', 'public.import_lme_market_prices(jsonb,text,text,integer)', 'execute') as authenticated_import_execute;
rollback;
