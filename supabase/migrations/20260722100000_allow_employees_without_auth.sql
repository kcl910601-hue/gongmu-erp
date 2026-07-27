-- Allow administrators to register employee master records before creating Auth accounts.
-- Existing linked employees and signup approval behavior remain unchanged.

begin;

alter table public.employees
  alter column email drop not null,
  alter column auth_user_id drop not null;

comment on column public.employees.email is
  'Optional employee email. It may be populated before or after Auth account creation.';

comment on column public.employees.auth_user_id is
  'Optional Supabase Auth user link. NULL means the employee is not linked to an Auth account.';

commit;
