-- Hotfix: qualify every column reference because RETURNS TABLE output names
-- are PL/pgSQL variables and can conflict with task_tags columns.
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
