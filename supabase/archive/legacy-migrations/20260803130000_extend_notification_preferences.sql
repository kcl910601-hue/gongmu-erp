alter table public.notification_reads
  add column if not exists is_pinned boolean not null default false,
  add column if not exists is_hidden boolean not null default false;

create index if not exists notification_reads_user_pinned_idx
  on public.notification_reads (auth_user_id, is_pinned desc, read_at desc);
