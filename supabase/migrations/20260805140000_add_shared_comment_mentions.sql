begin;

create table if not exists public.shared_comment_mentions (
  comment_id bigint not null references public.shared_comments(id) on delete cascade,
  employee_id bigint not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, employee_id)
);

create index if not exists shared_comment_mentions_employee_created_idx
  on public.shared_comment_mentions(employee_id, created_at desc);

alter table public.shared_comment_mentions enable row level security;
drop policy if exists shared_comment_mentions_select_participant on public.shared_comment_mentions;
create policy shared_comment_mentions_select_participant on public.shared_comment_mentions
  for select to authenticated using (
    exists (
      select 1 from public.shared_comments comment
      where comment.id = comment_id
        and public.can_comment_shared_item(comment.shared_item_id)
    )
  );

create or replace function public.create_shared_comment_with_mentions(
  p_shared_item_id uuid,
  p_content text,
  p_mention_employee_ids bigint[] default '{}'::bigint[]
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id bigint;
  v_comment_id bigint;
  v_item_id uuid;
  v_mention_names text;
  v_mention_ids bigint[];
  v_author public.employees%rowtype;
begin
  v_author_id := public.sharing_current_employee_id();
  if v_author_id is null or not public.can_comment_shared_item(p_shared_item_id) then
    raise exception 'not_authorized';
  end if;
  if nullif(btrim(p_content), '') is null or char_length(btrim(p_content)) > 2000 then
    raise exception 'invalid_content';
  end if;

  insert into public.shared_comments(shared_item_id, author_id, content)
  values (p_shared_item_id, v_author_id, btrim(p_content))
  returning id into v_comment_id;

  with valid_mentions as (
    select distinct employee.id, employee.name
    from unnest(coalesce(p_mention_employee_ids, '{}'::bigint[])) requested(employee_id)
    join public.employees employee on employee.id = requested.employee_id
      and employee.active = true and employee.approval_status = 'approved'
    join public.shared_items shared_item on shared_item.id = p_shared_item_id
    where employee.id <> v_author_id
      and (
        employee.id = shared_item.owner_id
        or exists (
          select 1 from public.shared_item_members member
          where member.shared_item_id = p_shared_item_id and member.employee_id = employee.id
        )
      )
  ), inserted as (
    insert into public.shared_comment_mentions(comment_id, employee_id)
    select v_comment_id, id from valid_mentions
    on conflict do nothing
    returning employee_id
  )
  select array_agg(valid_mentions.id order by valid_mentions.id),
         string_agg('@' || valid_mentions.name, ', ' order by valid_mentions.name)
    into v_mention_ids, v_mention_names
  from valid_mentions
  join inserted on inserted.employee_id = valid_mentions.id;

  if coalesce(cardinality(v_mention_ids), 0) > 0 then
    select item_id into v_item_id from public.shared_items where id = p_shared_item_id;
    select * into v_author from public.employees where id = v_author_id;
    insert into public.activity_logs(
      activity_type, action_type, target_type, target_id, project_id, employee_id,
      employee_name, employee_email, title, description, metadata, source_item_id
    ) values (
      'shared_comment_mention', 'shared_comment_mention', 'personal_note', null, null, v_author_id,
      v_author.name, v_author.email, '댓글 멘션', v_mention_names,
      jsonb_build_object('comment_id', v_comment_id, 'employee_ids', to_jsonb(v_mention_ids), 'personal_note_id', v_item_id),
      v_item_id
    );
  end if;

  return v_comment_id;
end;
$$;

alter table public.shared_comment_mentions replica identity full;
revoke all on public.shared_comment_mentions from anon, authenticated;
grant select on public.shared_comment_mentions to authenticated;
revoke all on function public.create_shared_comment_with_mentions(uuid,text,bigint[]) from public, anon;
grant execute on function public.create_shared_comment_with_mentions(uuid,text,bigint[]) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shared_comment_mentions'
  ) then
    alter publication supabase_realtime add table public.shared_comment_mentions;
  end if;
exception when undefined_object then null;
end
$$;

notify pgrst, 'reload schema';
commit;
