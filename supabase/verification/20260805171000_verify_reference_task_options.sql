do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reference_tasks' and column_name = 'title' and is_nullable = 'NO') then raise exception 'reference_tasks.title missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reference_tasks' and column_name = 'due_date') then raise exception 'reference_tasks.due_date missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reference_tasks' and column_name = 'priority' and is_nullable = 'NO') then raise exception 'reference_tasks.priority missing'; end if;
  if to_regprocedure('public.create_reference_task(bigint,text,date,text)') is null then raise exception 'create_reference_task RPC missing'; end if;
  if to_regprocedure('public.update_reference_task(uuid,text,date,text,boolean)') is null then raise exception 'update_reference_task RPC missing'; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'reference_tasks' and indexname = 'reference_tasks_assignee_comment_unique') then raise exception 'reference task duplicate guard missing'; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reference_tasks') then raise exception 'reference_tasks realtime publication missing'; end if;
end $$;
