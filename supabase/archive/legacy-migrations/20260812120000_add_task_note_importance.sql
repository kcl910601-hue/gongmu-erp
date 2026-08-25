alter table public.task_notes
  add column if not exists is_important boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_notes'
  ) then
    alter publication supabase_realtime add table public.task_notes;
  end if;
end
$$;
