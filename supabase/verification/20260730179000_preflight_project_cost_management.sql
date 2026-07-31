do $$ declare project_type regtype; begin
  if to_regclass('public.projects') is null then raise exception 'Missing projects'; end if;
  select atttypid::regtype into project_type from pg_attribute where attrelid='public.projects'::regclass and attname='id' and not attisdropped;
  if project_type<>'bigint'::regtype then raise exception 'projects.id must be bigint'; end if;
  if to_regprocedure('public.is_approved_erp_user()') is null or to_regprocedure('public.is_approved_admin()') is null then raise exception 'Missing permission helper'; end if;
  if to_regclass('public.project_cost_categories') is not null or to_regclass('public.project_cost_entries') is not null then raise exception 'Cost table collision'; end if;
  if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('prepare_project_cost_category','prepare_project_cost_entry')) then raise exception 'Function collision'; end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename in ('project_cost_categories','project_cost_entries')) then raise exception 'Policy collision'; end if;
  if to_regclass('public.project_material_usages') is null or to_regclass('public.project_contract_entries') is null then raise exception 'Prior Sprint tables missing'; end if;
end $$;
