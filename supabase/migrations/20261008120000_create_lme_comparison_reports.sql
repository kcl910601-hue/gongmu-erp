begin;

-- Immutable comparison-table snapshots; existing market/contract data is unchanged.
create table public.lme_comparison_reports (
  id uuid primary key default gen_random_uuid(),
  draft jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  created_by_name text not null,
  constraint lme_comparison_reports_draft_object check (jsonb_typeof(draft) = 'object')
);

create index lme_comparison_reports_created_idx on public.lme_comparison_reports (created_at desc, id desc);
alter table public.lme_comparison_reports enable row level security;
revoke all on public.lme_comparison_reports from anon, authenticated;
grant select, insert on public.lme_comparison_reports to authenticated;

create policy lme_comparison_reports_select_approved on public.lme_comparison_reports
  for select to authenticated using (public.is_approved_erp_user());
create policy lme_comparison_reports_insert_admin on public.lme_comparison_reports
  for insert to authenticated with check (
    public.is_approved_admin() and not public.is_calendar_only_staff() and created_by = auth.uid()
  );

create function public.prepare_lme_comparison_report() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  field text;
  coating jsonb;
  price text;
begin
  if not public.is_approved_admin() or public.is_calendar_only_staff() then
    raise exception '관리자만 비교표 이력을 저장할 수 있습니다.' using errcode = '42501';
  end if;
  if jsonb_typeof(new.draft) is distinct from 'object' then
    raise exception 'Invalid comparison draft' using errcode = '23514';
  end if;
  foreach field in array array['writtenDate','supplier','beforeLabel','afterLabel','beforePrice','afterPrice'] loop
    if jsonb_typeof(new.draft -> field) is distinct from 'string' or length(btrim(new.draft ->> field)) = 0 then
      raise exception 'Invalid comparison field: %', field using errcode = '23514';
    end if;
  end loop;
  if (new.draft ->> 'writtenDate') !~ '^\d{4}-\d{2}-\d{2}$'
    or to_char((new.draft ->> 'writtenDate')::date, 'YYYY-MM-DD') <> (new.draft ->> 'writtenDate')
    or length(new.draft ->> 'supplier') > 40 or length(new.draft ->> 'beforeLabel') > 80 or length(new.draft ->> 'afterLabel') > 80 then
    raise exception 'Invalid comparison metadata' using errcode = '23514';
  end if;
  if jsonb_typeof(new.draft -> 'coatings') is distinct from 'array' then
    raise exception 'Invalid coatings' using errcode = '23514';
  end if;
  if jsonb_array_length(new.draft -> 'coatings') <> 3 then
    raise exception 'Expected three coatings' using errcode = '23514';
  end if;
  for coating in select value from jsonb_array_elements(new.draft -> 'coatings') loop
    if jsonb_typeof(coating -> 'name') is distinct from 'string' or length(btrim(coating ->> 'name')) not between 1 and 40 then
      raise exception 'Invalid coating name' using errcode = '23514';
    end if;
    foreach field in array array['before','after'] loop
      if jsonb_typeof(coating -> field) is distinct from 'string' then
        raise exception 'Invalid coating price' using errcode = '23514';
      end if;
    end loop;
  end loop;
  for price in
    select new.draft ->> 'beforePrice' union all select new.draft ->> 'afterPrice'
    union all select value ->> 'before' from jsonb_array_elements(new.draft -> 'coatings')
    union all select value ->> 'after' from jsonb_array_elements(new.draft -> 'coatings')
  loop
    if price !~ '^[0-9]+$' then
      raise exception 'Price must be a nonnegative integer' using errcode = '23514';
    end if;
    if price::numeric > 9007199254740991 then
      raise exception 'Price exceeds supported range' using errcode = '23514';
    end if;
  end loop;
  new.created_by := auth.uid();
  new.created_at := now();
  select name into new.created_by_name from public.employees where auth_user_id = auth.uid();
  return new;
end;
$$;

create function public.log_lme_comparison_report() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.activity_logs (activity_type, action_type, target_type, title, employee_id, employee_name, metadata)
  select 'lme_comparison_report_create', 'lme_comparison_report_create', 'lme_comparison_report',
    'LME 계약 단가 비교표 저장', id, name, jsonb_build_object('report_id', new.id, 'supplier', new.draft ->> 'supplier', 'written_date', new.draft ->> 'writtenDate')
  from public.employees where auth_user_id = new.created_by;
  return new;
end;
$$;

revoke all on function public.prepare_lme_comparison_report() from public, anon, authenticated;
revoke all on function public.log_lme_comparison_report() from public, anon, authenticated;
create trigger prepare_lme_comparison_report before insert on public.lme_comparison_reports
  for each row execute function public.prepare_lme_comparison_report();
create trigger log_lme_comparison_report after insert on public.lme_comparison_reports
  for each row execute function public.log_lme_comparison_report();

commit;
