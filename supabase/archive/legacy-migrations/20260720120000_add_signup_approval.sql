-- AUTH-APPROVAL-1
-- 원격 DB에는 자동 적용하지 않습니다. 실행 전 현재 RLS 정책과 role 값을 검토하세요.

alter table public.employees
  add column if not exists approval_status text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists rejected_at timestamptz;

-- 기존 직원과 관리자는 잠기지 않도록 모두 승인 상태로 전환합니다.
update public.employees
set approval_status = 'approved'
where approval_status is null;

alter table public.employees
  alter column approval_status set default 'pending',
  alter column approval_status set not null;

alter table public.employees
  drop constraint if exists employees_approval_status_check;

alter table public.employees
  add constraint employees_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'));

create unique index if not exists employees_auth_user_id_unique
  on public.employees (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists employees_email_lower_unique
  on public.employees (lower(email))
  where email is not null;

create index if not exists employees_approval_status_created_at_idx
  on public.employees (approval_status, created_at desc);

-- Confirm email 설정과 무관하게 Auth 가입 직후 pending 행을 생성합니다.
-- 공개 화면은 name만 metadata로 보내며 role/active/approval_status는 고정값입니다.
create or replace function public.handle_new_signup_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

drop trigger if exists on_auth_user_created_create_signup_request on auth.users;
create trigger on_auth_user_created_create_signup_request
  after insert on auth.users
  for each row execute function public.handle_new_signup_request();

alter table public.employees enable row level security;

create or replace function public.is_approved_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employees
    where (
      auth_user_id = auth.uid()
      or (
        auth_user_id is null
        and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
    and role = 'admin'
    and active is true
    and approval_status = 'approved'
  );
$$;

revoke all on function public.is_approved_admin() from public;
grant execute on function public.is_approved_admin() to authenticated;

-- 기존 정책은 삭제하거나 완화하지 않습니다. 이름 충돌을 피한 추가 정책입니다.
create policy "signup employees insert own pending row"
  on public.employees
  for insert
  to authenticated
  with check (
    auth.uid() = auth_user_id
    and approval_status = 'pending'
    and active is false
    and role is null
  );

create policy "signup employees select own row"
  on public.employees
  for select
  to authenticated
  using (auth.uid() = auth_user_id);

create policy "approved admins select signup requests"
  on public.employees
  for select
  to authenticated
  using (public.is_approved_admin());

create policy "approved admins update signup requests"
  on public.employees
  for update
  to authenticated
  using (public.is_approved_admin())
  with check (
    approval_status = 'rejected'
    or (
      approval_status = 'approved'
      and role in ('admin', 'manager', 'member', 'sales', 'viewer')
    )
  );
