select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name in ('material_usage_groups','material_usage_requests') and column_name in ('material_usage_group_id','project_id','category','sequence','name','planned_date','status','memo','is_active') order by table_name,ordinal_position;
select project_id,category,sequence,count(*) from public.material_usage_groups group by project_id,category,sequence having count(*)>1;
select r.id,r.project_id,g.project_id group_project_id from public.material_usage_requests r join public.material_usage_groups g on g.id=r.material_usage_group_id where r.allocation_type<>'project' or r.project_id is distinct from g.project_id;
select * from public.get_material_usage_requests_v2(null) limit 100;
