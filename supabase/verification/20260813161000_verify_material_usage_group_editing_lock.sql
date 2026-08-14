do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.editing_locks'::regclass
      and conname='editing_locks_resource_type_check'
      and pg_get_constraintdef(oid) like '%material_usage_group%'
  ) then raise exception 'material_usage_group editing lock constraint is missing'; end if;
end $$;

select public.assert_editing_lock_permission('material_usage_group',id::text)
from public.material_usage_groups
where is_active=true
limit 0;
