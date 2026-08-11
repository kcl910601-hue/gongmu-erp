-- Run after 20260811140000_calendar_only_staff_rls.sql. Read-only verification.

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'is_calendar_only_staff';

select tablename, cmd, permissive, roles, policyname
from pg_policies
where schemaname = 'public'
  and policyname like 'calendar_only_staff_block_%'
order by tablename, cmd;

select cls.relname as rls_table,
       count(policy.policyname) filter (where policy.policyname like 'calendar_only_staff_block_%') as restrictive_mutation_policy_count
from pg_class cls
join pg_namespace namespace on namespace.oid = cls.relnamespace
left join pg_policies policy on policy.schemaname = namespace.nspname and policy.tablename = cls.relname
where namespace.nspname = 'public'
  and cls.relkind in ('r', 'p')
  and cls.relrowsecurity
group by cls.relname
order by cls.relname;
