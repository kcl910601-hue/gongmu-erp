begin;

create table if not exists public.shared_comment_reads (
  shared_item_id uuid not null references public.shared_items(id) on delete cascade,
  employee_id bigint not null references public.employees(id) on delete cascade,
  last_read_comment_id bigint not null default 0 check (last_read_comment_id >= 0),
  read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shared_item_id, employee_id)
);

create index if not exists shared_comment_reads_employee_idx
  on public.shared_comment_reads(employee_id, updated_at desc);

alter table public.shared_comment_reads enable row level security;

create policy shared_comment_reads_select_own on public.shared_comment_reads
  for select to authenticated
  using (employee_id = public.sharing_current_employee_id() and public.can_comment_shared_item(shared_item_id));

create or replace function public.mark_shared_comments_read(p_item_id uuid, p_last_comment_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id bigint;
  v_shared_item_id uuid;
  v_last_comment_id bigint;
begin
  v_employee_id := public.sharing_current_employee_id();
  select id into v_shared_item_id from public.shared_items where item_id = p_item_id;
  if v_employee_id is null or v_shared_item_id is null or not public.can_comment_shared_item(v_shared_item_id) then
    raise exception 'comment_access_denied';
  end if;

  select coalesce(max(id), 0) into v_last_comment_id
  from public.shared_comments
  where shared_item_id = v_shared_item_id
    and id <= greatest(p_last_comment_id, 0);

  insert into public.shared_comment_reads(shared_item_id, employee_id, last_read_comment_id, read_at, updated_at)
  values (v_shared_item_id, v_employee_id, v_last_comment_id, now(), now())
  on conflict (shared_item_id, employee_id) do update
  set last_read_comment_id = greatest(public.shared_comment_reads.last_read_comment_id, excluded.last_read_comment_id),
      read_at = now(),
      updated_at = now();
end
$$;

create or replace function public.get_shared_comment_count_stats(p_item_ids uuid[])
returns table(item_id uuid, comment_count bigint, unread_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    si.item_id,
    count(sc.id)::bigint as comment_count,
    count(sc.id) filter (
      where sc.author_id <> public.sharing_current_employee_id()
        and sc.id > coalesce(scr.last_read_comment_id, 0)
    )::bigint as unread_count
  from public.shared_items si
  left join public.shared_comments sc on sc.shared_item_id = si.id
  left join public.shared_comment_reads scr
    on scr.shared_item_id = si.id
   and scr.employee_id = public.sharing_current_employee_id()
  where si.item_id = any(p_item_ids)
  group by si.item_id, scr.last_read_comment_id
$$;

revoke all on public.shared_comment_reads from anon, authenticated;
grant select on public.shared_comment_reads to authenticated;
revoke all on function public.mark_shared_comments_read(uuid,bigint), public.get_shared_comment_count_stats(uuid[]) from public, anon;
grant execute on function public.mark_shared_comments_read(uuid,bigint), public.get_shared_comment_count_stats(uuid[]) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shared_comment_reads'
  ) then
    alter publication supabase_realtime add table public.shared_comment_reads;
  end if;
end
$$;

notify pgrst, 'reload schema';
commit;
