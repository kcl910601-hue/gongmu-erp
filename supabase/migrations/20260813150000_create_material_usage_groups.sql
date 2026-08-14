create table if not exists public.material_usage_groups (
  id uuid primary key default gen_random_uuid(), project_id bigint not null references public.projects(id) on delete restrict,
  category text not null check(category in ('frame','door','other')), sequence integer not null check(sequence>0),
  name text not null check(nullif(btrim(name),'') is not null), planned_date date,
  status text not null default 'planned' check(status in ('planned','in_progress','completed')),
  memo text check(memo is null or char_length(memo)<=2000), is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict, updated_at timestamptz not null default now(),
  unique(project_id,category,sequence)
);
alter table public.material_usage_requests add column if not exists material_usage_group_id uuid references public.material_usage_groups(id) on delete restrict;
create index if not exists material_usage_groups_project_idx on public.material_usage_groups(project_id,is_active,category,sequence);
create index if not exists material_usage_requests_group_idx on public.material_usage_requests(material_usage_group_id) where material_usage_group_id is not null;
alter table public.material_usage_groups enable row level security;
create policy material_usage_groups_select_approved on public.material_usage_groups for select to authenticated using(public.is_approved_erp_user());
revoke all on public.material_usage_groups from anon,authenticated;
grant select on public.material_usage_groups to authenticated;

create or replace function public.create_material_usage_group(p_project_id bigint,p_category text,p_planned_date date default null,p_memo text default null)
returns public.material_usage_groups language plpgsql security definer set search_path=public,pg_temp as $$
declare v_employee public.employees%rowtype; v_sequence integer; v_result public.material_usage_groups%rowtype; v_label text;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role<>'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  if p_category not in ('frame','door','other') or not exists(select 1 from public.projects where id=p_project_id) then raise exception '프로젝트 또는 구분을 확인해 주세요.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':'||p_category,0));
  select coalesce(max(sequence),0)+1 into v_sequence from public.material_usage_groups where project_id=p_project_id and category=p_category;
  v_label:=case p_category when 'frame' then '문틀' when 'door' then '도어' else '기타' end;
  insert into public.material_usage_groups(project_id,category,sequence,name,planned_date,memo,created_by)
  values(p_project_id,p_category,v_sequence,v_label||' '||v_sequence||'차',p_planned_date,nullif(btrim(p_memo),''),auth.uid()) returning * into v_result;
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
  values('material_usage_group_created','material_usage_group_created','material_usage_group',v_employee.id,v_employee.name,v_employee.email,'자재 사용구분 생성',v_result.name,jsonb_build_object('material_usage_group_id',v_result.id,'project_id',p_project_id,'category',p_category,'sequence',v_sequence));
  return v_result;
end $$;

create or replace function public.update_material_usage_group(p_group_id uuid,p_planned_date date,p_status text,p_memo text)
returns public.material_usage_groups language plpgsql security definer set search_path=public,pg_temp as $$
declare v_employee public.employees%rowtype; v_result public.material_usage_groups%rowtype;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role<>'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  if p_status not in ('planned','in_progress','completed') then raise exception '상태를 확인해 주세요.' using errcode='22023'; end if;
  update public.material_usage_groups set planned_date=p_planned_date,status=p_status,memo=nullif(btrim(p_memo),''),updated_by=auth.uid(),updated_at=now() where id=p_group_id and is_active=true returning * into v_result;
  if v_result.id is null then raise exception '활성 사용구분을 찾을 수 없습니다.' using errcode='P0002'; end if;
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
  values('material_usage_group_updated','material_usage_group_updated','material_usage_group',v_employee.id,v_employee.name,v_employee.email,'자재 사용구분 수정',v_result.name,jsonb_build_object('material_usage_group_id',v_result.id,'status',v_result.status,'planned_date',v_result.planned_date));
  return v_result;
end $$;

create or replace function public.archive_material_usage_group(p_group_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_employee public.employees%rowtype; v_name text;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role<>'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  update public.material_usage_groups set is_active=false,updated_by=auth.uid(),updated_at=now() where id=p_group_id and is_active=true returning name into v_name;
  if not found then raise exception '활성 사용구분을 찾을 수 없습니다.' using errcode='P0002'; end if;
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
  values('material_usage_group_archived','material_usage_group_archived','material_usage_group',v_employee.id,v_employee.name,v_employee.email,'자재 사용구분 Archive',v_name,jsonb_build_object('material_usage_group_id',p_group_id));
end $$;

create or replace function public.set_material_usage_request_group(p_usage_request_id uuid,p_group_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_employee public.employees%rowtype; v_request public.material_usage_requests%rowtype; v_group public.material_usage_groups%rowtype;
begin
  select * into v_employee from public.employees where auth_user_id=auth.uid() and active=true and approval_status='approved';
  if v_employee.id is null or v_employee.role<>'admin' then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into v_request from public.material_usage_requests where id=p_usage_request_id and status='active' for update;
  if not found then raise exception '활성 사용요청을 찾을 수 없습니다.' using errcode='P0002'; end if;
  if p_group_id is not null then
    select * into v_group from public.material_usage_groups where id=p_group_id;
    if not found or not v_group.is_active or v_request.allocation_type<>'project' or v_request.project_id<>v_group.project_id then raise exception '같은 프로젝트의 활성 사용구분만 선택할 수 있습니다.' using errcode='23514'; end if;
  end if;
  update public.material_usage_requests set material_usage_group_id=p_group_id,updated_by=auth.uid(),updated_at=now() where id=v_request.id;
  insert into public.activity_logs(activity_type,action_type,target_type,employee_id,employee_name,employee_email,title,description,metadata)
  values('material_usage_request_group_changed','material_usage_request_group_changed','material_usage_request',v_employee.id,v_employee.name,v_employee.email,'사용구분 변경',coalesce(v_group.name,'구분 없음'),jsonb_build_object('usage_request_id',v_request.id,'material_usage_group_id',p_group_id));
end $$;

create or replace function public.get_material_usage_requests_v2(p_project_id bigint default null)
returns table(id uuid,material_code text,allocation_type text,project_id bigint,destination_name text,quantity_tons numeric,purchase_order_no text,usage_date date,memo text,status text,allocated_tons numeric,unallocated_tons numeric,allocation_state text,created_at timestamptz,material_usage_group_id uuid,group_name text,group_category text,group_sequence integer,group_status text,group_planned_date date,group_is_active boolean)
language sql stable security definer set search_path=public,pg_temp as $$
select r.id,r.material_code,r.allocation_type,r.project_id,r.destination_name,r.quantity_tons,r.purchase_order_no,r.usage_date,r.memo,r.status,
coalesce(sum(a.quantity_tons) filter(where a.status in ('planned','confirmed')),0)::numeric,
greatest(r.quantity_tons-coalesce(sum(a.quantity_tons) filter(where a.status in ('planned','confirmed')),0),0)::numeric,
case when coalesce(sum(a.quantity_tons) filter(where a.status in ('planned','confirmed')),0)<=0 then 'unallocated' when coalesce(sum(a.quantity_tons) filter(where a.status in ('planned','confirmed')),0)+0.00005<r.quantity_tons then 'partially_allocated' else 'fully_allocated' end,
r.created_at,r.material_usage_group_id,g.name,g.category,g.sequence,g.status,g.planned_date,g.is_active
from public.material_usage_requests r left join public.material_contract_allocations a on a.usage_request_id=r.id left join public.material_usage_groups g on g.id=r.material_usage_group_id
where public.is_approved_erp_user() and (p_project_id is null or r.project_id=p_project_id) group by r.id,g.id order by r.usage_date desc,r.created_at desc $$;

revoke all on function public.create_material_usage_group(bigint,text,date,text),public.update_material_usage_group(uuid,date,text,text),public.archive_material_usage_group(uuid),public.set_material_usage_request_group(uuid,uuid),public.get_material_usage_requests_v2(bigint) from public,anon;
grant execute on function public.create_material_usage_group(bigint,text,date,text),public.update_material_usage_group(uuid,date,text,text),public.archive_material_usage_group(uuid),public.set_material_usage_request_group(uuid,uuid),public.get_material_usage_requests_v2(bigint) to authenticated;
alter table public.material_usage_groups replica identity full;
do $$ begin alter publication supabase_realtime add table public.material_usage_groups; exception when duplicate_object then null; end $$;
notify pgrst,'reload schema';
