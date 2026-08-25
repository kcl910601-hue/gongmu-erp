-- Keep process type aliases canonical across projects, sections and task templates.

begin;

create or replace function public.normalize_process_type_code(p_value text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select case regexp_replace(btrim(p_value), '[[:space:]-]+', '', 'g')
    when '본납문틀' then '본납-문틀'
    when '본납도어' then '본납-도어'
    else btrim(p_value)
  end;
$$;

create or replace function public.normalize_process_type_row()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.process_type := public.normalize_process_type_code(new.process_type);
  return new;
end;
$$;

drop trigger if exists projects_normalize_process_type on public.projects;
create trigger projects_normalize_process_type
before insert or update of process_type on public.projects
for each row execute function public.normalize_process_type_row();

drop trigger if exists project_sections_normalize_process_type on public.project_sections;
create trigger project_sections_normalize_process_type
before insert or update of process_type on public.project_sections
for each row execute function public.normalize_process_type_row();

drop trigger if exists task_templates_normalize_process_type on public.task_templates;
create trigger task_templates_normalize_process_type
before insert or update of process_type on public.task_templates
for each row execute function public.normalize_process_type_row();

-- The preceding normalize_process_type_master migration resolves possible duplicate aliases first.
update public.projects
set process_type = public.normalize_process_type_code(process_type), updated_at = now()
where process_type is distinct from public.normalize_process_type_code(process_type);

update public.project_sections
set process_type = public.normalize_process_type_code(process_type), updated_at = now()
where process_type is distinct from public.normalize_process_type_code(process_type);

update public.task_templates
set process_type = public.normalize_process_type_code(process_type)
where process_type is distinct from public.normalize_process_type_code(process_type);

commit;

-- Verification:
-- select 'projects' source, count(*) from public.projects where process_type in ('본납 문틀', '본납 도어')
-- union all select 'project_sections', count(*) from public.project_sections where process_type in ('본납 문틀', '본납 도어')
-- union all select 'task_templates', count(*) from public.task_templates where process_type in ('본납 문틀', '본납 도어');
