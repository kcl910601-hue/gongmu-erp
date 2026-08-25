select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'update_material_usage_request_details';

select id, purchase_order_no, memo, updated_at
from public.material_usage_requests
order by created_at desc
limit 20;

select a.id, a.usage_request_id, a.purchase_order_no as legacy_purchase_order_no,
       r.purchase_order_no as request_purchase_order_no,
       a.memo as legacy_memo, r.memo as request_memo
from public.material_contract_allocations a
join public.material_usage_requests r on r.id = a.usage_request_id
order by a.created_at desc
limit 20;
