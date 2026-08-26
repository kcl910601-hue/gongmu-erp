do $$
declare
  v_projects_signature text;
  v_policy_commands text[];
begin
  if to_regclass('public.user_favorite_projects') is null then
    raise exception 'public.user_favorite_projects is missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_favorite_projects'
      and column_name = 'auth_user_id'
      and data_type = 'uuid'
      and is_nullable = 'NO'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_favorite_projects'
      and column_name = 'project_id'
      and data_type = 'bigint'
      and is_nullable = 'NO'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_favorite_projects'
      and column_name = 'created_at'
      and data_type = 'timestamp with time zone'
      and is_nullable = 'NO'
  ) then
    raise exception 'favorite columns do not match the application contract';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_favorite_projects'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (auth_user_id, project_id)'
  ) then
    raise exception 'favorite uniqueness is missing';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_favorite_projects'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) = 'FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_favorite_projects'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) = 'FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE'
  ) then
    raise exception 'favorite foreign keys are missing or unsafe';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'user_favorite_projects'
      and indexname = 'user_favorite_projects_user_created_idx'
      and indexdef like '%(auth_user_id, created_at DESC)%'
  ) then
    raise exception 'favorite user ordering index is missing';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.user_favorite_projects'::regclass
      and relrowsecurity
  ) then
    raise exception 'RLS is not enabled';
  end if;

  select array_agg(cmd order by cmd)
  into v_policy_commands
  from pg_policies
  where schemaname = 'public'
    and tablename = 'user_favorite_projects'
    and policyname in (
      'user_favorite_projects_select_own',
      'user_favorite_projects_insert_own',
      'user_favorite_projects_delete_own'
    )
    and roles = array['authenticated']::name[]
    and coalesce(qual, with_check) = '(auth_user_id = auth.uid())';

  if v_policy_commands is distinct from array['DELETE', 'INSERT', 'SELECT']::text[] then
    raise exception 'own-row RLS policies are incomplete';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_favorite_projects'
      and cmd = 'UPDATE'
  ) then
    raise exception 'UPDATE policy must not exist';
  end if;

  select format('%s|%s|%s', data_type, is_nullable, is_identity)
  into v_projects_signature
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'projects'
    and column_name = 'id';

  if v_projects_signature is distinct from 'bigint|NO|YES' then
    raise exception 'projects.id changed unexpectedly: %', v_projects_signature;
  end if;
end
$$;
