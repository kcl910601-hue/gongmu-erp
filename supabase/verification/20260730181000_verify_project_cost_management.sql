do $$ begin
  if to_regclass('public.project_cost_categories') is null or to_regclass('public.project_cost_entries') is null then raise exception 'Missing cost tables'; end if;
  if (select count(*) from public.project_cost_categories where code in ('subcontract','transportation','labor','installation','as_service','other'))<>6 then raise exception 'Missing seed categories'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.project_cost_categories'::regclass and contype='u') then raise exception 'Category UNIQUE missing'; end if;
  if (select count(*) from pg_constraint where conrelid='public.project_cost_entries'::regclass and contype='f')<>2 then raise exception 'Expected project/category FKs'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.project_cost_entries'::regclass and tgname='prepare_project_cost_entry' and not tgisinternal) then raise exception 'Entry trigger missing'; end if;
  if not (select relrowsecurity from pg_class where oid='public.project_cost_entries'::regclass) then raise exception 'RLS disabled'; end if;
  if has_table_privilege('anon','public.project_cost_entries','SELECT') or has_table_privilege('authenticated','public.project_cost_entries','DELETE') then raise exception 'Invalid grants'; end if;
  if exists(select 1 from public.project_cost_entries where total_amount_krw<>supply_amount_krw+vat_amount_krw or supply_amount_krw<0 or vat_amount_krw<0) then raise exception 'Amount inconsistency'; end if;
  if exists(select 1 from public.project_cost_entries e left join public.projects p on p.id=e.project_id left join public.project_cost_categories c on c.id=e.category_id where p.id is null or c.id is null) then raise exception 'Orphan row'; end if;
end $$;

-- Use real admin, approved-user and anon JWTs to verify RLS/API behavior.
-- Verify confirmed->void, void->confirmed denial, inactive-category insert denial, inactive history reads,
-- dynamic category breakdown, N+1 absence and bigint safety in local or rollback-only environments.
