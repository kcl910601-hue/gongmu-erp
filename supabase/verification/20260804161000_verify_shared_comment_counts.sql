select has_function_privilege('authenticated', 'public.get_shared_comment_counts(uuid[])', 'execute') as authenticated_can_execute;

select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_shared_comment_counts';
