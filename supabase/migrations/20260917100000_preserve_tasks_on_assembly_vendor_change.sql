-- Preserve existing work when replacing one assembly vendor with another.
-- Prepared only; apply separately to the database.
CREATE OR REPLACE FUNCTION public.update_project_with_vendors(p_project_id bigint, p_project jsonb, p_assembly_vendor_ids bigint[]) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_removed_ids bigint[];
  v_added_ids bigint[];
begin
  if not public.can_manage_projects() then
    raise exception using message = '프로젝트 수정 권한이 없습니다.', errcode = '42501';
  end if;
  if nullif(p_project->>'quantity', '')::numeric < 0 then
    raise exception using message = '프로젝트 수량은 0 이상이어야 합니다.', errcode = '22023';
  end if;
  perform public.assert_valid_assembly_vendor_ids(p_assembly_vendor_ids);

  update public.projects set
    project_code = btrim(p_project->>'project_code'),
    project_name = btrim(p_project->>'project_name'),
    client_name = nullif(btrim(p_project->>'client_name'), ''),
    site_address = nullif(btrim(p_project->>'site_address'), ''),
    salesperson = nullif(btrim(p_project->>'salesperson'), ''),
    task_manager = nullif(btrim(p_project->>'task_manager'), ''),
    process_type = btrim(p_project->>'process_type'),
    start_date = nullif(p_project->>'start_date', '')::date,
    end_date = nullif(p_project->>'end_date', '')::date,
    memo = nullif(btrim(p_project->>'memo'), ''),
    quantity = nullif(p_project->>'quantity', '')::numeric,
    quantity_unit = nullif(btrim(p_project->>'quantity_unit'), ''),
    updated_at = now()
  where id = p_project_id;

  if not found then
    raise exception using message = '프로젝트를 찾을 수 없습니다.', errcode = 'P0002';
  end if;

  -- The project UPDATE above serializes edits to this project's vendor list.
  select coalesce(array_agg(pav.id order by pav.sort_order, pav.id), array[]::bigint[])
    into v_removed_ids
  from public.project_assembly_vendors pav
  where pav.project_id = p_project_id
    and not (pav.organization_id = any(coalesce(p_assembly_vendor_ids, array[]::bigint[])));

  select coalesce(array_agg(vendor.id order by vendor.ordinality), array[]::bigint[])
    into v_added_ids
  from unnest(coalesce(p_assembly_vendor_ids, array[]::bigint[])) with ordinality vendor(id, ordinality)
  where not exists (
    select 1 from public.project_assembly_vendors pav
    where pav.project_id = p_project_id and pav.organization_id = vendor.id
  );

  if cardinality(v_removed_ids) = 1 and cardinality(v_added_ids) = 1 then
    -- Replace the organization in place: preserve relation/task IDs, quantities,
    -- task notes, dates, progress and shipment links without copying any task.
    update public.project_assembly_vendors
    set organization_id = v_added_ids[1]
    where id = v_removed_ids[1] and project_id = p_project_id;
  elsif exists (
    select 1 from public.tasks
    where project_assembly_vendor_id = any(v_removed_ids)
  ) then
    raise exception using
      message = '업무가 있는 조립업체는 한 곳씩 새 업체로 교체해주세요. 기존 업체로 통합하려면 업무의 조립업체를 먼저 변경해주세요.',
      errcode = '23514';
  end if;

  update public.project_assembly_vendors pav set is_primary = false
  where pav.project_id = p_project_id;

  insert into public.project_assembly_vendors (project_id, organization_id, sort_order, is_primary)
  select p_project_id, vendor.id, vendor.ordinality::integer, vendor.ordinality = 1
  from unnest(coalesce(p_assembly_vendor_ids, array[]::bigint[])) with ordinality vendor(id, ordinality)
  on conflict (project_id, organization_id) do update set
    sort_order = excluded.sort_order,
    is_primary = excluded.is_primary;

  delete from public.project_assembly_vendors pav
  where pav.project_id = p_project_id
    and not (pav.organization_id = any(coalesce(p_assembly_vendor_ids, array[]::bigint[])));

  perform public.sync_project_primary_vendor(p_project_id);
  return p_project_id;
end;
$$;
