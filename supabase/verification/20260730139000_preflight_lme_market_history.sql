begin;
select to_regprocedure('public.is_approved_erp_user()') as approved_user_helper,
       to_regprocedure('public.is_approved_admin()') as admin_helper;
select count(*) as legacy_lme_rows from public.lme_price_records;
rollback;
