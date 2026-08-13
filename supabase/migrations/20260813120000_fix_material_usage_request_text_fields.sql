create or replace function public.update_material_usage_request_details(
  p_usage_request_id uuid,
  p_purchase_order_no text,
  p_memo text
) returns public.material_usage_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.material_usage_requests;
begin
  if not public.is_approved_admin() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;

  update public.material_usage_requests
  set purchase_order_no = nullif(btrim(p_purchase_order_no), ''),
      memo = nullif(btrim(p_memo), ''),
      updated_at = now()
  where id = p_usage_request_id
  returning * into v_request;

  if v_request.id is null then
    raise exception '사용요청을 찾을 수 없습니다.';
  end if;
  return v_request;
end;
$$;

revoke all on function public.update_material_usage_request_details(uuid, text, text) from public, anon;
grant execute on function public.update_material_usage_request_details(uuid, text, text) to authenticated;
notify pgrst, 'reload schema';
