-- Sprint 6-1 UAT account verification. Read-only; run in a non-production SQL editor.

with expected(test_account, email, expected_role, expected_active, expected_approval) as (
  values
    ('TEST_ADMIN',    'uat.admin@example.com',    'admin',   true,  'approved'),
    ('TEST_MANAGER',  'uat.manager@example.com',  'manager', true,  'approved'),
    ('TEST_STAFF',    'uat.staff@example.com',    'staff',   true,  'approved'),
    ('TEST_VIEWER',   'uat.viewer@example.com',   'viewer',  true,  'approved'),
    ('TEST_INACTIVE', 'uat.inactive@example.com', 'staff',   false, 'approved'),
    ('TEST_PENDING',  'uat.pending@example.com',  'staff',   true,  'pending'),
    ('TEST_REJECTED', 'uat.rejected@example.com', 'staff',   true,  'rejected')
)
select
  expected.test_account,
  (auth_user.id is not null) as auth_exists,
  (employee.id is not null) as employee_exists,
  (auth_user.id = employee.auth_user_id) as auth_linked,
  employee.role,
  employee.active,
  employee.approval_status,
  employee.role = expected.expected_role
    and employee.active = expected.expected_active
    and employee.approval_status = expected.expected_approval as state_matches,
  case
    when auth_user.id is null then 'FAIL: missing auth'
    when employee.id is null then 'FAIL: missing employee'
    when auth_user.id <> employee.auth_user_id then 'FAIL: link mismatch'
    when employee.role <> expected.expected_role
      or employee.active is distinct from expected.expected_active
      or employee.approval_status <> expected.expected_approval then 'FAIL: state mismatch'
    else 'PASS'
  end as result
from expected
left join auth.users auth_user
  on lower(auth_user.email) = expected.email
left join public.employees employee
  on employee.auth_user_id = auth_user.id and lower(employee.email) = expected.email
order by expected.test_account;

-- Orphan employees: linked employee rows whose Auth user is missing.
select employee.id, employee.name, employee.email, employee.auth_user_id
from public.employees employee
left join auth.users auth_user on auth_user.id = employee.auth_user_id
where employee.auth_user_id is not null and auth_user.id is null
order by employee.id;

-- Orphan Auth users: Auth users without an employee link.
select auth_user.id, auth_user.email, auth_user.created_at
from auth.users auth_user
left join public.employees employee on employee.auth_user_id = auth_user.id
where employee.id is null
order by auth_user.created_at;

-- Compact pass/fail summary for the seven Sprint 6-1 accounts.
select
  count(*) filter (where auth_user.id is not null) as auth_count,
  count(*) filter (where employee.id is not null) as employee_count,
  count(*) filter (where auth_user.id = employee.auth_user_id) as linked_count,
  count(*) filter (where auth_user.id is null or employee.id is null) = 0 as all_present_and_linked
from (values
  ('uat.admin@example.com'),
  ('uat.manager@example.com'),
  ('uat.staff@example.com'),
  ('uat.viewer@example.com'),
  ('uat.inactive@example.com'),
  ('uat.pending@example.com'),
  ('uat.rejected@example.com')
) expected(email)
left join auth.users auth_user on lower(auth_user.email) = expected.email
left join public.employees employee on employee.auth_user_id = auth_user.id and lower(employee.email) = expected.email;
