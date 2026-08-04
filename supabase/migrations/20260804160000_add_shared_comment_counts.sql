begin;

create or replace function public.get_shared_comment_counts(p_item_ids uuid[])
returns table(item_id uuid, comment_count bigint)
language sql stable security invoker set search_path = public as $$
  select si.item_id, count(sc.id)::bigint
  from public.shared_items si
  join public.shared_comments sc on sc.shared_item_id = si.id
  where si.item_id = any(p_item_ids)
  group by si.item_id
$$;

revoke all on function public.get_shared_comment_counts(uuid[]) from public, anon;
grant execute on function public.get_shared_comment_counts(uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;
