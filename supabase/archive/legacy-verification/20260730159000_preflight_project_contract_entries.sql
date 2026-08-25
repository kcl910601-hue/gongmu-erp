do $$
declare
  projects_id_type regtype;
begin
  if to_regclass('public.projects') is null then raise exception 'Missing public.projects'; end if;
  select atttypid::regtype into projects_id_type from pg_attribute where attrelid='public.projects'::regclass and attname='id' and not attisdropped;
  if projects_id_type <> 'bigint'::regtype then raise exception 'projects.id must be bigint, found %', projects_id_type; end if;
  if to_regprocedure('public.is_approved_erp_user()') is null then raise exception 'Missing is_approved_erp_user()'; end if;
  if to_regprocedure('public.is_approved_admin()') is null then raise exception 'Missing is_approved_admin()'; end if;
  if to_regclass('public.project_contract_entries') is not null then raise exception 'project_contract_entries already exists; inspect before migration'; end if;
  if exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='prepare_project_contract_entry') then raise exception 'Function name collision: prepare_project_contract_entry'; end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='project_contract_entries') then raise exception 'Policy collision detected'; end if;
end $$;
