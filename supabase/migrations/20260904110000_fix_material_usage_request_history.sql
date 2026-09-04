create or replace function public.get_material_usage_request_history(p_usage_request_id uuid)
returns table(created_at timestamptz, activity_type text, title text, description text, employee_name text, metadata jsonb)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select log.created_at, log.activity_type, log.title, log.description, log.employee_name, log.metadata
  from public.activity_logs log
  where public.is_approved_erp_user()
    and (
      log.metadata->>'usage_request_id' = p_usage_request_id::text
      or log.metadata->'after'->>'usage_request_id' = p_usage_request_id::text
    )
  order by log.created_at desc, log.id desc
$$;

revoke all on function public.get_material_usage_request_history(uuid) from public;
grant execute on function public.get_material_usage_request_history(uuid) to authenticated;
grant execute on function public.get_material_usage_request_history(uuid) to service_role;
