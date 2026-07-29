create table if not exists public.notification_reads (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  notification_id text not null,
  is_read boolean not null default true,
  read_at timestamptz null default now(),
  primary key (auth_user_id, notification_id)
);

create index if not exists notification_reads_user_read_at_idx
  on public.notification_reads (auth_user_id, read_at desc);

alter table public.notification_reads enable row level security;

drop policy if exists notification_reads_select_own on public.notification_reads;
create policy notification_reads_select_own
  on public.notification_reads for select
  to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists notification_reads_insert_own on public.notification_reads;
create policy notification_reads_insert_own
  on public.notification_reads for insert
  to authenticated
  with check (auth_user_id = auth.uid());

drop policy if exists notification_reads_update_own on public.notification_reads;
create policy notification_reads_update_own
  on public.notification_reads for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

drop policy if exists notification_reads_delete_own on public.notification_reads;
create policy notification_reads_delete_own
  on public.notification_reads for delete
  to authenticated
  using (auth_user_id = auth.uid());
