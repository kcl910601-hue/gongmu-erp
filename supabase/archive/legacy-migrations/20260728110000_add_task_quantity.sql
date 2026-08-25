alter table public.tasks
  add column if not exists quantity integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_quantity_positive'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_quantity_positive
      check (quantity is null or quantity > 0);
  end if;
end
$$;
