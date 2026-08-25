begin;

create table public.material_contract_notification_states (
  contract_id uuid primary key references public.raw_material_contracts(id) on delete cascade,
  available_generation integer not null default 0,
  available_stage text check (available_stage is null or available_stage in ('20','10','5')),
  expiry_stage text check (expiry_stage is null or expiry_stage in ('30d','7d','today','expired')),
  updated_at timestamptz not null default now()
);

create table public.material_contract_notification_events (
  notification_id text primary key,
  contract_id uuid not null references public.raw_material_contracts(id) on delete cascade,
  contract_name text not null,
  alert_kind text not null check (alert_kind in ('available_ratio','expiry')),
  stage text not null check (stage in ('20','10','5','30d','7d','today','expired')),
  generation integer not null default 1,
  available_tons numeric(16,4),
  available_ratio numeric(12,8),
  effective_end_date date not null,
  created_at timestamptz not null default now(),
  unique (contract_id, alert_kind, generation, stage)
);
create index material_contract_notification_events_created_idx on public.material_contract_notification_events(created_at desc);

alter table public.material_contract_notification_states enable row level security;
alter table public.material_contract_notification_events enable row level security;
create policy material_contract_notification_events_admin_select on public.material_contract_notification_events for select to authenticated using (public.is_approved_admin());
revoke all on public.material_contract_notification_states from anon, authenticated;
revoke all on public.material_contract_notification_events from anon, authenticated;
grant select on public.material_contract_notification_events to authenticated;

create function public.evaluate_material_contract_notifications()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row record; v_state public.material_contract_notification_states%rowtype;
  v_available numeric(16,4); v_ratio numeric(12,8); v_available_stage text; v_expiry_stage text;
  v_generation integer; v_inserted integer := 0; v_count integer; v_days integer;
begin
  if auth.uid() is null or not public.is_approved_admin() then raise exception '관리자 권한이 필요합니다.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('material_contract_notifications'));
  for v_row in
    select c.id, c.contract_name, c.contract_quantity_ton, c.effective_end_date,
      coalesce(sum(a.quantity_tons) filter (where a.status in ('planned','confirmed')), 0) allocated_tons
    from public.raw_material_contracts c
    left join public.material_contract_allocations a on a.contract_id = c.id
    where c.status = 'active'
    group by c.id, c.contract_name, c.contract_quantity_ton, c.effective_end_date
  loop
    v_available := greatest(v_row.contract_quantity_ton - v_row.allocated_tons, 0);
    v_ratio := case when v_row.contract_quantity_ton > 0 then v_available / v_row.contract_quantity_ton else 0 end;
    v_available_stage := case when v_ratio <= .05 then '5' when v_ratio <= .10 then '10' when v_ratio <= .20 then '20' else null end;
    v_days := v_row.effective_end_date - current_date;
    v_expiry_stage := case when v_days < 0 then 'expired' when v_days = 0 then 'today' when v_days <= 7 then '7d' when v_days <= 30 then '30d' else null end;

    insert into public.material_contract_notification_states(contract_id) values (v_row.id) on conflict do nothing;
    select * into v_state from public.material_contract_notification_states where contract_id = v_row.id for update;
    v_generation := v_state.available_generation;
    if v_available_stage is null then
      update public.material_contract_notification_states set available_stage = null, updated_at = now() where contract_id = v_row.id;
    else
      if v_state.available_stage is null then v_generation := v_generation + 1; end if;
      insert into public.material_contract_notification_events(notification_id,contract_id,contract_name,alert_kind,stage,generation,available_tons,available_ratio,effective_end_date)
      values ('raw-material-available-'||v_row.id||'-'||v_generation||'-'||v_available_stage,v_row.id,v_row.contract_name,'available_ratio',v_available_stage,v_generation,v_available,v_ratio,v_row.effective_end_date)
      on conflict do nothing;
      get diagnostics v_count = row_count; v_inserted := v_inserted + v_count;
      update public.material_contract_notification_states set available_generation=v_generation,available_stage=v_available_stage,updated_at=now() where contract_id=v_row.id;
    end if;
    if v_expiry_stage is not null then
      insert into public.material_contract_notification_events(notification_id,contract_id,contract_name,alert_kind,stage,generation,effective_end_date)
      values ('raw-material-expiry-'||v_row.id||'-'||v_expiry_stage,v_row.id,v_row.contract_name,'expiry',v_expiry_stage,1,v_row.effective_end_date)
      on conflict do nothing;
      get diagnostics v_count = row_count; v_inserted := v_inserted + v_count;
      update public.material_contract_notification_states set expiry_stage=v_expiry_stage,updated_at=now() where contract_id=v_row.id;
    end if;
  end loop;
  return v_inserted;
end;
$$;
revoke all on function public.evaluate_material_contract_notifications() from public, anon;
grant execute on function public.evaluate_material_contract_notifications() to authenticated;

alter table public.material_contract_notification_events replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='material_contract_notification_events') then alter publication supabase_realtime add table public.material_contract_notification_events; end if;
exception when undefined_object then null; end $$;
notify pgrst, 'reload schema';
commit;
