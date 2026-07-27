begin;

create or replace function public.create_project_section_with_vendor_tasks(
  p_project_id bigint,
  p_process_type text,
  p_assembly_vendor text default null,
  p_task_manager text default null,
  p_quantity integer default null,
  p_start_date date default null,
  p_end_date date default null,
  p_memo text default null,
  p_source_section_id bigint default null,
  p_target_project_assembly_vendor_ids bigint[] default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_section_id bigint;
  v_task_count integer;
  v_sort_order integer;
begin
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception using message = '프로젝트를 찾을 수 없습니다.', errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.process_types
    where code = btrim(p_process_type) and is_active = true
  ) then
    raise exception using message = '활성 공정을 찾을 수 없습니다.', errcode = '22023';
  end if;
  if exists (
    select 1 from public.project_sections
    where project_id = p_project_id and process_type = btrim(p_process_type)
  ) then
    raise exception using message = '이미 존재하는 공정입니다.', errcode = '23505';
  end if;
  if p_source_section_id is not null and not exists (
    select 1 from public.project_sections
    where id = p_source_section_id and project_id = p_project_id
  ) then
    raise exception using message = '기준 공정을 찾을 수 없습니다.', errcode = '22023';
  end if;
  if p_target_project_assembly_vendor_ids is not null and cardinality(p_target_project_assembly_vendor_ids) = 0 then
    raise exception using message = '적용할 조립업체를 선택하세요.', errcode = '22023';
  end if;
  if p_target_project_assembly_vendor_ids is not null and cardinality(p_target_project_assembly_vendor_ids) <> (
    select count(distinct pav.id)
    from public.project_assembly_vendors pav
    where pav.project_id = p_project_id
      and pav.id = any(p_target_project_assembly_vendor_ids)
  ) then
    raise exception using message = '프로젝트에 등록되지 않은 조립업체가 포함되어 있습니다.', errcode = '23503';
  end if;
  if p_quantity is not null and p_quantity < 0 then
    raise exception using message = '수량은 0 이상이어야 합니다.', errcode = '22023';
  end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception using message = '종료일은 시작일보다 빠를 수 없습니다.', errcode = '22023';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort_order
  from public.project_sections
  where project_id = p_project_id;

  insert into public.project_sections (
    project_id, process_type, assembly_vendor, task_manager, quantity,
    start_date, end_date, status, memo, sort_order
  ) values (
    p_project_id, btrim(p_process_type), nullif(btrim(p_assembly_vendor), ''),
    nullif(btrim(p_task_manager), ''), p_quantity, p_start_date, p_end_date,
    'pending', nullif(btrim(p_memo), ''), v_sort_order
  ) returning id into v_section_id;

  insert into public.tasks (
    project_id, project_section_id, project_assembly_vendor_id,
    task_order, task_type, task_name, assignee, status,
    start_date, due_date, completed_date
  )
  select p_project_id, v_section_id, vendor_relation.id,
    template.task_order, template.task_type, template.task_name,
    nullif(btrim(p_task_manager), ''), 'pending', null, null, null
  from public.task_templates template
  cross join lateral (
    select pav.id
    from public.project_assembly_vendors pav
    where pav.project_id = p_project_id
      and (
        p_target_project_assembly_vendor_ids is null
        or pav.id = any(p_target_project_assembly_vendor_ids)
      )
    union all
    select null::bigint
    where p_target_project_assembly_vendor_ids is null
      and not exists (
        select 1 from public.project_assembly_vendors pav
        where pav.project_id = p_project_id
      )
  ) vendor_relation
  where template.process_type = btrim(p_process_type)
  order by vendor_relation.id nulls first, template.task_order, template.id;

  get diagnostics v_task_count = row_count;
  return jsonb_build_object(
    'section_id', v_section_id,
    'task_count', v_task_count,
    'vendor_count', case
      when p_target_project_assembly_vendor_ids is null then (
        select count(*) from public.project_assembly_vendors where project_id = p_project_id
      )
      else cardinality(p_target_project_assembly_vendor_ids)
    end
  );
end;
$$;

revoke all on function public.create_project_section_with_vendor_tasks(
  bigint, text, text, text, integer, date, date, text, bigint, bigint[]
) from public, anon;
grant execute on function public.create_project_section_with_vendor_tasks(
  bigint, text, text, text, integer, date, date, text, bigint, bigint[]
) to authenticated;

create or replace function public.create_task_dependency(
  p_predecessor_task_id bigint,
  p_successor_task_id bigint
)
returns public.task_dependencies
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_dependency public.task_dependencies;
begin
  if p_predecessor_task_id = p_successor_task_id then
    raise exception 'A task cannot depend on itself.';
  end if;
  if not exists (
    select 1 from public.employees as e
    where e.auth_user_id = auth.uid()
      and e.active is true
      and e.role in ('admin', 'manager', 'staff')
  ) then
    raise exception 'Task dependency update permission is required.';
  end if;
  if not exists (
    select 1
    from public.tasks as predecessor
    join public.tasks as successor on successor.id = p_successor_task_id
    where predecessor.id = p_predecessor_task_id
      and predecessor.project_id = successor.project_id
      and predecessor.project_assembly_vendor_id is not distinct from successor.project_assembly_vendor_id
  ) then
    raise exception 'Dependencies are allowed only between tasks for the same project assembly vendor.';
  end if;
  if exists (
    with recursive successors(task_id) as (
      select td.successor_task_id
      from public.task_dependencies as td
      where td.predecessor_task_id = p_successor_task_id
      union
      select td.successor_task_id
      from public.task_dependencies as td
      join successors as path on td.predecessor_task_id = path.task_id
    )
    select 1 from successors as path where path.task_id = p_predecessor_task_id
  ) then
    raise exception 'This dependency would create a cycle.';
  end if;

  insert into public.task_dependencies as td (
    predecessor_task_id, successor_task_id, dependency_type, created_by
  ) values (
    p_predecessor_task_id, p_successor_task_id, 'FS', auth.uid()
  )
  on conflict on constraint task_dependencies_unique_fs
  do update set dependency_type = excluded.dependency_type
  returning * into v_dependency;

  return v_dependency;
end;
$$;

revoke all on function public.create_task_dependency(bigint, bigint) from public, anon;
grant execute on function public.create_task_dependency(bigint, bigint) to authenticated;

commit;
