-- Read-only Auth/employees consistency check. Run in Supabase SQL Editor.

select
  auth_user.id as auth_user_id,
  auth_user.email as auth_email,
  auth_user.email_confirmed_at,
  auth_user.last_sign_in_at,
  employee.id as employee_id,
  employee.email as employee_email,
  employee.auth_user_id as employee_auth_user_id,
  employee.role,
  employee.active,
  employee.approval_status,
  case
    when auth_user.id is not null and employee.id is not null
      and employee.auth_user_id = auth_user.id then 'linked'
    when auth_user.id is not null and employee.id is null then 'auth_only_incomplete'
    when auth_user.id is null and employee.id is not null then 'employee_only_missing_auth'
    else 'not_found'
  end as consistency_status
from (select lower('lyucs@homecnet.com') as email) target
left join auth.users auth_user on lower(auth_user.email) = target.email
left join public.employees employee
  on lower(employee.email) = target.email
  or employee.auth_user_id = auth_user.id;

-- Employees whose linked Auth user no longer exists.
select employee.id, employee.name, employee.email, employee.auth_user_id,
       employee.role, employee.active, employee.approval_status
from public.employees employee
left join auth.users auth_user on auth_user.id = employee.auth_user_id
where employee.auth_user_id is not null and auth_user.id is null
order by employee.id;

-- Auth users without an employees row.
select auth_user.id, auth_user.email, auth_user.email_confirmed_at,
       auth_user.created_at, auth_user.last_sign_in_at
from auth.users auth_user
left join public.employees employee on employee.auth_user_id = auth_user.id
where employee.id is null
order by auth_user.created_at;
