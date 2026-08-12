alter table public.task_notes
  add column if not exists check_date date null;

create index if not exists task_notes_check_date_idx
  on public.task_notes(check_date)
  where check_date is not null;
