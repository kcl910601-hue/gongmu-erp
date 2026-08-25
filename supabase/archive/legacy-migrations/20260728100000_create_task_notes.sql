create extension if not exists pgcrypto;

create table if not exists public.task_notes (
  id uuid primary key default gen_random_uuid(),
  task_id bigint not null references public.tasks(id) on delete cascade,
  note text not null check (length(btrim(note)) > 0),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  created_by_name text
);

create index if not exists task_notes_task_id_created_at_idx
  on public.task_notes(task_id, created_at);

create or replace function public.set_task_notes_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_task_notes_updated_at on public.task_notes;
create trigger set_task_notes_updated_at
before update on public.task_notes
for each row execute function public.set_task_notes_updated_at();

alter table public.task_notes enable row level security;

create policy task_notes_select_authenticated
  on public.task_notes for select to authenticated
  using (true);

create policy task_notes_insert_authenticated
  on public.task_notes for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.employees
      where auth_user_id = auth.uid()
        and active is true
    )
  );

create policy task_notes_update_owner_or_admin
  on public.task_notes for update to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.employees
      where auth_user_id = auth.uid()
        and active is true
        and role = 'admin'
    )
  )
  with check (
    created_by = auth.uid()
    or exists (
      select 1 from public.employees
      where auth_user_id = auth.uid()
        and active is true
        and role = 'admin'
    )
  );

create policy task_notes_delete_owner_or_admin
  on public.task_notes for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.employees
      where auth_user_id = auth.uid()
        and active is true
        and role = 'admin'
    )
  );
