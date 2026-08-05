select routine_name, security_type from information_schema.routines where routine_schema = 'public'
and routine_name in ('get_hierarchical_delete_locks','delete_project_with_lock_check','delete_project_task') order by routine_name;

select has_function_privilege('authenticated', 'public.get_hierarchical_delete_locks(text,bigint)', 'execute') as can_check,
  has_function_privilege('authenticated', 'public.delete_project_with_lock_check(bigint)', 'execute') as can_delete_project;
