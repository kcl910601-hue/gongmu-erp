create extension if not exists pgcrypto;

create table if not exists public.task_tags (
  id uuid primary key default gen_random_uuid(),
  task_id bigint not null references public.tasks(id) on delete cascade,
  tag text not null check (length(btrim(tag)) > 0),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  unique (task_id, tag)
);

create index if not exists task_tags_task_id_idx on public.task_tags(task_id);
create index if not exists task_tags_tag_idx on public.task_tags(tag);

alter table public.task_tags enable row level security;

create policy task_tags_select_authenticated on public.task_tags
  for select to authenticated using (true);
create policy task_tags_insert_authenticated on public.task_tags
  for insert to authenticated with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.employees
      where auth_user_id = auth.uid()
        and active is true
        and role in ('admin', 'manager', 'staff', 'member')
    )
  );
create policy task_tags_delete_authenticated on public.task_tags
  for delete to authenticated using (
    exists (
      select 1 from public.employees
      where auth_user_id = auth.uid()
        and active is true
        and role in ('admin', 'manager', 'staff', 'member')
    )
  );

create or replace function public.set_task_tags(p_task_id bigint, p_tags text[])
returns table (task_id bigint, tag text)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict error
begin
  if not exists (
    select 1
    from public.employees as e
    where e.auth_user_id = auth.uid()
      and e.active is true
      and e.role in ('admin', 'manager', 'staff', 'member')
  ) then
    raise exception 'Task tag update permission is required.';
  end if;

  if not exists (
    select 1
    from public.tasks as t
    where t.id = p_task_id
  ) then
    raise exception 'Task % was not found.', p_task_id;
  end if;

  delete from public.task_tags as tt
  where tt.task_id = p_task_id
    and not (tt.tag = any(coalesce(p_tags, array[]::text[])));

  insert into public.task_tags as tt (task_id, tag, created_by)
  select
    p_task_id,
    normalized.tag_value,
    auth.uid()
  from (
    select distinct btrim(input_tag.value) as tag_value
    from unnest(coalesce(p_tags, array[]::text[])) as input_tag(value)
    where length(btrim(input_tag.value)) > 0
  ) as normalized
  on conflict on constraint task_tags_task_id_tag_key do nothing;

  return query
  select
    tt.task_id,
    tt.tag
  from public.task_tags as tt
  where tt.task_id = p_task_id
  order by tt.created_at, tt.tag;
end;
$$;

revoke all on function public.set_task_tags(bigint, text[]) from public, anon;
grant execute on function public.set_task_tags(bigint, text[]) to authenticated;
