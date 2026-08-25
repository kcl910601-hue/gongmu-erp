-- Existing employee master rows are linked by email when an Auth user is created.
-- New public signups without an employee row keep the existing pending workflow.
create or replace function public.handle_new_signup_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_employee_id bigint;
begin
  update public.employees
  set
    auth_user_id = new.id,
    email = lower(new.email),
    approval_status = 'approved',
    active = true
  where id = (
    select id
    from public.employees
    where auth_user_id is null
      and email is not null
      and lower(email) = lower(new.email)
    order by id
    limit 1
  )
  returning id into linked_employee_id;

  if linked_employee_id is not null then
    return new;
  end if;

  insert into public.employees (
    auth_user_id,
    name,
    email,
    role,
    active,
    approval_status
  )
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), '이름 미입력'),
    lower(new.email),
    null,
    false,
    'pending'
  );
  return new;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'duplicate signup request';
end;
$$;
