begin;

create table if not exists public.project_contract_entries (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null references public.projects(id) on update cascade on delete restrict,
  entry_type text not null,
  contract_title text not null,
  contract_date date not null,
  effective_date date not null,
  document_number text,
  supply_amount_krw bigint not null,
  vat_amount_krw bigint not null,
  total_amount_krw bigint not null,
  status text not null default 'confirmed',
  memo text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint project_contract_entries_type_check check (entry_type in ('original', 'increase', 'decrease')),
  constraint project_contract_entries_status_check check (status in ('confirmed', 'void')),
  constraint project_contract_entries_title_check check (btrim(contract_title) <> '' and char_length(contract_title) <= 200),
  constraint project_contract_entries_document_check check (document_number is null or char_length(document_number) <= 100),
  constraint project_contract_entries_amount_check check (supply_amount_krw >= 0 and vat_amount_krw >= 0 and total_amount_krw = supply_amount_krw + vat_amount_krw),
  constraint project_contract_entries_original_amount_check check (not (entry_type = 'original' and status = 'confirmed') or supply_amount_krw > 0),
  constraint project_contract_entries_memo_check check (memo is null or char_length(memo) <= 2000)
);

create unique index if not exists project_contract_entries_one_original_idx
  on public.project_contract_entries(project_id)
  where entry_type = 'original' and status = 'confirmed';
create index if not exists project_contract_entries_project_date_idx
  on public.project_contract_entries(project_id, contract_date desc, created_at desc);

create or replace function public.prepare_project_contract_entry()
returns trigger language plpgsql set search_path = public as $$
declare
  current_supply bigint;
  current_total bigint;
begin
  perform pg_advisory_xact_lock(new.project_id);

  if tg_op = 'INSERT' then
    new.total_amount_krw := new.supply_amount_krw + new.vat_amount_krw;
    if new.status <> 'confirmed' then
      raise exception 'New contract entries must be confirmed.' using errcode = '23514';
    end if;
    if new.entry_type in ('increase', 'decrease') and not exists (
      select 1 from public.project_contract_entries
      where project_id = new.project_id and entry_type = 'original' and status = 'confirmed'
    ) then
      raise exception 'A confirmed original contract is required.' using errcode = '23514';
    end if;
    if new.entry_type = 'decrease' then
      select
        coalesce(sum(case entry_type when 'original' then supply_amount_krw when 'increase' then supply_amount_krw else -supply_amount_krw end), 0),
        coalesce(sum(case entry_type when 'original' then total_amount_krw when 'increase' then total_amount_krw else -total_amount_krw end), 0)
      into current_supply, current_total
      from public.project_contract_entries where project_id = new.project_id and status = 'confirmed';
      if current_supply - new.supply_amount_krw < 0 or current_total - new.total_amount_krw < 0 then
        raise exception 'Decrease would make the final contract amount negative.' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  if new.project_id is distinct from old.project_id
    or new.entry_type is distinct from old.entry_type
    or new.supply_amount_krw is distinct from old.supply_amount_krw
    or new.vat_amount_krw is distinct from old.vat_amount_krw
    or new.total_amount_krw is distinct from old.total_amount_krw
    or new.contract_date is distinct from old.contract_date
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Core contract entry fields are immutable. Void and register a new entry.' using errcode = '55000';
  end if;
  if old.status = 'void' and new.status <> 'void' then
    raise exception 'A void entry cannot be restored.' using errcode = '55000';
  end if;
  if old.status = 'confirmed' and new.status = 'void' then
    select
      coalesce(sum(case entry_type when 'original' then supply_amount_krw when 'increase' then supply_amount_krw else -supply_amount_krw end), 0),
      coalesce(sum(case entry_type when 'original' then total_amount_krw when 'increase' then total_amount_krw else -total_amount_krw end), 0)
    into current_supply, current_total
    from public.project_contract_entries
    where project_id = old.project_id and status = 'confirmed' and id <> old.id;
    if current_supply < 0 or current_total < 0 then
      raise exception 'Voiding this entry would make the final contract amount negative.' using errcode = '23514';
    end if;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists prepare_project_contract_entry on public.project_contract_entries;
create trigger prepare_project_contract_entry before insert or update on public.project_contract_entries
for each row execute function public.prepare_project_contract_entry();

alter table public.project_contract_entries enable row level security;
drop policy if exists project_contract_entries_select_approved on public.project_contract_entries;
drop policy if exists project_contract_entries_insert_admin on public.project_contract_entries;
drop policy if exists project_contract_entries_update_admin on public.project_contract_entries;
create policy project_contract_entries_select_approved on public.project_contract_entries
  for select to authenticated using (public.is_approved_erp_user());
create policy project_contract_entries_insert_admin on public.project_contract_entries
  for insert to authenticated with check (public.is_approved_admin() and created_by = auth.uid());
create policy project_contract_entries_update_admin on public.project_contract_entries
  for update to authenticated using (public.is_approved_admin()) with check (public.is_approved_admin());

revoke all on public.project_contract_entries from anon, authenticated;
grant select, insert, update on public.project_contract_entries to authenticated;

notify pgrst, 'reload schema';
commit;
