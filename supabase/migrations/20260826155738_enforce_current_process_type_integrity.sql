create function public.is_current_process_type_code_valid(
  p_value text,
  p_allow_empty boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_value is null then false
    when p_allow_empty and p_value = '' then true
    when p_value = '' then false
    else exists (
      select 1
      from public.process_types
      where code = p_value
        and is_active = true
    )
  end;
$$;

revoke all on function public.is_current_process_type_code_valid(text, boolean)
  from public, anon, authenticated;

create function public.enforce_current_process_type_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allow_empty boolean := tg_table_schema = 'public' and tg_table_name = 'projects';
begin
  if not public.is_current_process_type_code_valid(new.process_type, v_allow_empty) then
    raise exception using
      errcode = '23514',
      message = format(
        'Invalid current process type code for %I.%I: %s',
        tg_table_schema,
        tg_table_name,
        coalesce(quote_literal(new.process_type), 'NULL')
      );
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_current_process_type_integrity()
  from public, anon, authenticated;

create trigger projects_enforce_current_process_type_integrity
before insert or update of process_type on public.projects
for each row execute function public.enforce_current_process_type_integrity();

create trigger project_sections_enforce_current_process_type_integrity
before insert or update of process_type on public.project_sections
for each row execute function public.enforce_current_process_type_integrity();

create trigger task_templates_enforce_current_process_type_integrity
before insert or update of process_type on public.task_templates
for each row execute function public.enforce_current_process_type_integrity();
