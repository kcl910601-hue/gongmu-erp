-- Run manually after reviewing and applying 20260811120000_add_material_allocation_audit_history.sql.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and indexname = 'activity_logs_material_allocation_created_idx';

select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.activity_logs'::regclass
  and tgname = 'guard_material_allocation_activity_insert'
  and not tgisinternal;

select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('record_material_allocation_activity', 'save_material_contract_allocation')
order by p.proname;

select
  has_function_privilege('authenticated', 'public.record_material_allocation_activity(uuid,uuid,text,text,text,text,jsonb,jsonb,text,text)', 'execute') as authenticated_can_forge_audit,
  has_table_privilege('authenticated', 'public.activity_logs', 'update') as authenticated_can_update_audit,
  has_table_privilege('authenticated', 'public.activity_logs', 'delete') as authenticated_can_delete_audit;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'activity_logs'
order by policyname;

select activity_type, title, employee_id, employee_name, created_at,
       metadata ->> 'material_contract_id' as material_contract_id,
       metadata ->> 'allocation_id' as allocation_id,
       metadata ->> 'field_label' as field_label,
       metadata ->> 'before_display' as before_display,
       metadata ->> 'after_display' as after_display
from public.activity_logs
where target_type = 'material_contract_allocation'
order by created_at desc, id desc
limit 100;
