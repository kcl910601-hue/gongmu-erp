begin;

alter table public.notification_reads
  add column if not exists archived_at timestamptz;

update public.notification_reads
set archived_at = read_at
where read_at is not null and archived_at is null;

create index if not exists notification_reads_user_archived_at_idx
  on public.notification_reads(auth_user_id, archived_at desc)
  where archived_at is not null;

notify pgrst, 'reload schema';
commit;
