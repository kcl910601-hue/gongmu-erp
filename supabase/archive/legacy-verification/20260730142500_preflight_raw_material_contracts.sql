begin;
select to_regclass('public.suppliers') as suppliers,
       to_regclass('public.lme_materials') as lme_materials,
       to_regprocedure('public.is_approved_erp_user()') as approved_user_helper,
       to_regprocedure('public.is_approved_admin()') as admin_helper;
select count(*) as suppliers_count from public.suppliers;
select code, name, is_active from public.lme_materials order by code;
rollback;
