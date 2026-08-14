-- Master/actual matrix. Expected after migration: no MISSING_MASTER or INACTIVE_BUT_USED rows.
with section_usage as (
  select process_type code, count(*) section_count
  from public.project_sections
  group by process_type
), template_usage as (
  select process_type code, count(*) template_count
  from public.task_templates
  group by process_type
), codes as (
  select code from public.process_types
  union select code from section_usage
)
select c.code, m.name, m.is_active,
  coalesce(s.section_count, 0) section_count,
  coalesce(t.template_count, 0) template_count,
  case
    when m.code is null then 'MISSING_MASTER'
    when not m.is_active and coalesce(s.section_count, 0) > 0 then 'INACTIVE_BUT_USED'
    when coalesce(s.section_count, 0) = 0 and coalesce(t.template_count, 0) = 0 then 'UNUSED_MASTER'
    else 'NORMAL'
  end audit_status
from codes c
left join public.process_types m using (code)
left join section_usage s using (code)
left join template_usage t using (code)
order by coalesce(m.sort_order, 2147483647), c.code;

select code, count(*) duplicate_count
from public.process_types
group by code
having count(*) > 1;

select process_type, count(*) section_count
from public.project_sections
where process_type is null or btrim(process_type) = ''
group by process_type;

select code, name, is_active
from public.process_types
where code in ('MH', 'SH', 'AS', '본납-문틀', '본납-도어', 'FRAME', 'DOOR')
order by sort_order, code;

select
  (select count(*) from public.projects) projects_count,
  (select count(*) from public.project_sections) project_sections_count,
  (select count(*) from public.tasks) tasks_count,
  (select count(*) from public.project_sections where process_type = '본납-문틀') final_frame_sections,
  (select count(*) from public.project_sections where process_type = '본납-도어') final_door_sections;
