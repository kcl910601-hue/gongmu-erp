do $$
declare
  required_columns text[] := array['id','project_id','material_code','raw_material_contract_id','lme_market_price_id','pricing_basis','cost_reference_date','expected_quantity_kg','input_quantity','input_unit','applied_unit_price_krw_per_kg','processing_cost_snapshot','domestic_lme_snapshot','contract_price_snapshot','expected_cost_krw','memo','created_by','created_at','updated_by','updated_at'];
  column_name text;
begin
  if to_regclass('public.project_material_usages') is null then raise exception 'Missing table'; end if;
  foreach column_name in array required_columns loop
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='project_material_usages' and columns.column_name=column_name) then raise exception 'Missing column %', column_name; end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid='public.project_material_usages'::regclass) then raise exception 'RLS is disabled'; end if;
  if (select count(*) from pg_constraint where conrelid='public.project_material_usages'::regclass and contype='f') <> 4 then raise exception 'Expected four foreign keys'; end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename='project_material_usages') <> 3 then raise exception 'Expected SELECT/INSERT/UPDATE policies only'; end if;
  if has_table_privilege('anon','public.project_material_usages','SELECT') or has_table_privilege('anon','public.project_material_usages','INSERT') then raise exception 'anon privilege detected'; end if;
  if has_table_privilege('authenticated','public.project_material_usages','DELETE') then raise exception 'DELETE privilege detected'; end if;
  if not has_table_privilege('authenticated','public.project_material_usages','SELECT,INSERT,UPDATE') then raise exception 'Missing authenticated grants'; end if;
  if exists (select 1 from public.project_material_usages u left join public.projects p on p.id=u.project_id where p.id is null) then raise exception 'Orphan project'; end if;
  if exists (select 1 from public.project_material_usages u left join public.lme_materials m on m.code=u.material_code where m.code is null) then raise exception 'Orphan material'; end if;
  if exists (select 1 from public.project_material_usages where expected_quantity_kg<=0 or input_quantity<=0 or applied_unit_price_krw_per_kg<=0 or expected_cost_krw<0) then raise exception 'Invalid positive values'; end if;
  if exists (select 1 from public.project_material_usages where (pricing_basis='contract' and (raw_material_contract_id is null or contract_price_snapshot is null or lme_market_price_id is not null)) or (pricing_basis='market' and (lme_market_price_id is null or domestic_lme_snapshot is null or processing_cost_snapshot is null or raw_material_contract_id is not null))) then raise exception 'Invalid snapshot basis'; end if;
end $$;

-- API/RLS role verification must be executed with real admin, approved-user, and anon JWTs.
-- Do not insert arbitrary cost rows in production. Use local Supabase or a transaction that is rolled back.
