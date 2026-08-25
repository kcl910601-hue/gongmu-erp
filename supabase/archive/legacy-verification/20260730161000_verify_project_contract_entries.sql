do $$
declare
  required text[] := array['id','project_id','entry_type','contract_title','contract_date','effective_date','document_number','supply_amount_krw','vat_amount_krw','total_amount_krw','status','memo','created_by','created_at','updated_by','updated_at'];
  item text;
begin
  if to_regclass('public.project_contract_entries') is null then raise exception 'Missing table'; end if;
  foreach item in array required loop
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='project_contract_entries' and column_name=item) then raise exception 'Missing column %', item; end if;
  end loop;
  if (select count(*) from pg_constraint where conrelid='public.project_contract_entries'::regclass and contype='c') < 6 then raise exception 'Required CHECK constraints are missing'; end if;
  if (select count(*) from pg_constraint where conrelid='public.project_contract_entries'::regclass and contype='f') <> 1 then raise exception 'Expected one project FK'; end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and tablename='project_contract_entries' and indexname='project_contract_entries_one_original_idx' and indexdef ilike '%unique%where%original%confirmed%') then raise exception 'Missing partial unique index'; end if;
  if not (select relrowsecurity from pg_class where oid='public.project_contract_entries'::regclass) then raise exception 'RLS disabled'; end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename='project_contract_entries') <> 3 then raise exception 'Expected SELECT/INSERT/UPDATE policies'; end if;
  if has_table_privilege('anon','public.project_contract_entries','SELECT') or has_table_privilege('anon','public.project_contract_entries','INSERT') then raise exception 'anon privilege detected'; end if;
  if has_table_privilege('authenticated','public.project_contract_entries','DELETE') then raise exception 'DELETE privilege detected'; end if;
  if not has_table_privilege('authenticated','public.project_contract_entries','SELECT,INSERT,UPDATE') then raise exception 'authenticated grants missing'; end if;
  if exists (select 1 from public.project_contract_entries e left join public.projects p on p.id=e.project_id where p.id is null) then raise exception 'Orphan entry'; end if;
  if exists (select 1 from public.project_contract_entries where supply_amount_krw<0 or vat_amount_krw<0 or total_amount_krw<>supply_amount_krw+vat_amount_krw) then raise exception 'Amount inconsistency'; end if;
  if exists (select project_id from public.project_contract_entries where entry_type='original' and status='confirmed' group by project_id having count(*)>1) then raise exception 'Multiple confirmed originals'; end if;
  if exists (
    select project_id from public.project_contract_entries where status='confirmed' group by project_id
    having sum(case entry_type when 'original' then supply_amount_krw when 'increase' then supply_amount_krw else -supply_amount_krw end)<0
       or sum(case entry_type when 'original' then total_amount_krw when 'increase' then total_amount_krw else -total_amount_krw end)<0
  ) then raise exception 'Negative final amount'; end if;
end $$;

-- Verify admin write, approved-user read/write denial, anon denial and void exclusion with real JWTs.
-- Never insert arbitrary project contract amounts in production; use local Supabase or rollback-only transactions.
