-- Normalize duplicate process master values without deleting projects, sections or tasks.

begin;

-- A project containing both aliases cannot be normalized without merging or
-- deleting a section. Stop and report instead of causing data loss.
do $$
begin
  if exists (
    select 1
    from public.project_sections legacy
    join public.project_sections canonical
      on canonical.project_id = legacy.project_id
     and canonical.process_type = case legacy.process_type
       when '본납 문틀' then '본납-문틀'
       when '본납 도어' then '본납-도어'
     end
    where legacy.process_type in ('본납 문틀', '본납 도어')
  ) then
    raise exception 'Process normalization stopped: a project contains both legacy and canonical sections.';
  end if;
end
$$;

update public.project_sections
set process_type = case process_type
  when '본납 문틀' then '본납-문틀'
  when '본납 도어' then '본납-도어'
end,
updated_at = now()
where process_type in ('본납 문틀', '본납 도어');

update public.projects
set process_type = case process_type
  when '본납 문틀' then '본납-문틀'
  when '본납 도어' then '본납-도어'
end,
updated_at = now()
where process_type in ('본납 문틀', '본납 도어');

-- Remove only redundant template master rows; generated tasks are untouched.
delete from public.task_templates legacy
where legacy.process_type in ('본납 문틀', '본납 도어')
  and exists (
    select 1 from public.task_templates canonical
    where canonical.process_type = case legacy.process_type
      when '본납 문틀' then '본납-문틀'
      when '본납 도어' then '본납-도어'
    end
      and canonical.task_order is not distinct from legacy.task_order
      and canonical.task_type is not distinct from legacy.task_type
      and canonical.task_name is not distinct from legacy.task_name
  );

update public.task_templates
set process_type = case process_type
  when '본납 문틀' then '본납-문틀'
  when '본납 도어' then '본납-도어'
end
where process_type in ('본납 문틀', '본납 도어');

delete from public.process_types
where code in ('본납 문틀', '본납 도어');

insert into public.process_types (code, name, sort_order, color, is_active)
values
  ('MH', 'MH', 1, null, true),
  ('SH', 'SH', 2, null, true),
  ('본납-문틀', '본납-문틀', 3, null, true),
  ('본납-도어', '본납-도어', 4, null, true),
  ('AS', 'AS', 5, null, true)
on conflict (code) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

-- Other historical process types are retained but no longer shown in new forms.
update public.process_types
set is_active = false,
    updated_at = now()
where code not in ('MH', 'SH', '본납-문틀', '본납-도어', 'AS')
  and is_active = true;

commit;
