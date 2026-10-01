begin;

-- Opt-in only: existing expected usages and allocations are never rewritten.
create table public.project_material_cost_basis (
  project_id bigint primary key references public.projects(id) on delete cascade,
  basis text not null check (basis in ('estimate', 'allocation')),
  baseline_quantity_kg numeric not null,
  baseline_cost_krw numeric not null,
  baseline_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.project_material_cost_basis enable row level security;
create policy project_material_cost_basis_read on public.project_material_cost_basis
  for select to authenticated using (public.is_approved_erp_user()
    and exists (select 1 from public.projects p where p.id = project_id));
grant select on public.project_material_cost_basis to authenticated;
revoke insert, update, delete on public.project_material_cost_basis from authenticated;

create function public.set_project_material_cost_basis(p_project_id bigint, p_basis text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor public.employees%rowtype;
  previous_basis text;
begin
  select * into actor from public.employees where auth_user_id = auth.uid()
    and active = true and approval_status = 'approved' and role = 'admin';
  if actor.id is null or public.is_calendar_only_staff() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;
  if p_basis is null or p_basis not in ('estimate', 'allocation') then
    raise exception '원가 기준을 확인해주세요.' using errcode = '22023';
  end if;
  perform 1 from public.projects where id = p_project_id for update;
  if not found then raise exception '프로젝트를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  select basis into previous_basis from public.project_material_cost_basis where project_id = p_project_id;
  if coalesce(previous_basis, 'estimate') = p_basis then return; end if;
  insert into public.project_material_cost_basis(project_id, basis, baseline_quantity_kg, baseline_cost_krw)
    select p_project_id, p_basis, coalesce(sum(expected_quantity_kg), 0), coalesce(sum(expected_cost_krw), 0)
    from public.project_material_usages where project_id = p_project_id and material_code = 'AL'
    on conflict (project_id) do update set basis = excluded.basis, updated_at = now();
  insert into public.activity_logs(activity_type, action_type, target_type, project_id,
    employee_id, employee_name, employee_email, title, metadata)
  values ('project_material_cost_basis_changed', 'project_material_cost_basis_changed', 'project', p_project_id,
    actor.id, actor.name, actor.email, 'AL 원가 기준 변경',
    jsonb_build_object('before', coalesce(previous_basis, 'estimate'), 'after', p_basis));
end;
$$;
revoke all on function public.set_project_material_cost_basis(bigint, text) from public;
grant execute on function public.set_project_material_cost_basis(bigint, text) to authenticated;

-- One source for cost analysis and both profit reports. AL estimates are replaced,
-- not added, when the project opts in. Other materials retain their existing costs.
create view public.project_effective_material_costs with (security_invoker = true) as
select u.id, u.project_id, u.material_code, u.pricing_basis, u.cost_reference_date,
  u.expected_quantity_kg, u.applied_unit_price_krw_per_kg, u.expected_cost_krw,
  u.created_at, m.name as material_name, 'estimate'::text as cost_source
from public.project_material_usages u
left join public.lme_materials m on m.code = u.material_code
where u.material_code <> 'AL' or not exists (
  select 1 from public.project_material_cost_basis b where b.project_id = u.project_id and b.basis = 'allocation'
)
union all
select a.id, a.project_id, coalesce(c.material_code, r.material_code, 'AL'),
  'contract'::text, a.allocation_date, a.quantity_tons * 1000,
  a.applied_unit_price_krw_per_kg, round(a.quantity_tons * 1000 * a.applied_unit_price_krw_per_kg),
  a.created_at, m.name, 'allocation'::text
from public.material_contract_allocations a
join public.project_material_cost_basis b on b.project_id = a.project_id and b.basis = 'allocation'
left join public.raw_material_contracts c on c.id = a.contract_id
left join public.material_usage_requests r on r.id = a.usage_request_id
left join public.lme_materials m on m.code = coalesce(c.material_code, r.material_code, 'AL')
where a.allocation_type = 'project' and a.status in ('planned', 'confirmed')
  and coalesce(c.material_code, r.material_code, 'AL') = 'AL';
grant select on public.project_effective_material_costs to authenticated;
notify pgrst, 'reload schema';
commit;
