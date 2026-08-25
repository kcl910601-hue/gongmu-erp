do $$
declare
  project_id_type regtype;
begin
  if to_regclass('public.projects') is null then raise exception 'Missing public.projects'; end if;
  if to_regclass('public.lme_materials') is null then raise exception 'Missing public.lme_materials'; end if;
  if to_regclass('public.raw_material_contracts') is null then raise exception 'Missing public.raw_material_contracts'; end if;
  if to_regclass('public.lme_market_prices') is null then raise exception 'Missing public.lme_market_prices'; end if;
  if to_regprocedure('public.is_approved_erp_user()') is null then raise exception 'Missing is_approved_erp_user()'; end if;
  if to_regprocedure('public.is_approved_admin()') is null then raise exception 'Missing is_approved_admin()'; end if;

  select atttypid::regtype into project_id_type
  from pg_attribute where attrelid = 'public.projects'::regclass and attname = 'id' and not attisdropped;
  if project_id_type <> 'bigint'::regtype then
    raise exception 'projects.id must be bigint, found %', project_id_type;
  end if;

  if not exists (select 1 from pg_attribute where attrelid = 'public.lme_materials'::regclass and attname = 'code' and atttypid = 'text'::regtype) then raise exception 'lme_materials.code must be text'; end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.raw_material_contracts'::regclass and attname = 'id' and atttypid = 'uuid'::regtype) then raise exception 'raw_material_contracts.id must be uuid'; end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.lme_market_prices'::regclass and attname = 'id' and atttypid = 'uuid'::regtype) then raise exception 'lme_market_prices.id must be uuid'; end if;
end $$;
