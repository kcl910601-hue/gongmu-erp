-- Correct supplier organizations created automatically from the legacy supplier
-- seed. Existing applied migrations are intentionally left unchanged.
begin;

create temporary table supplier_clone_cleanup_candidates on commit drop as
select
  supplier.id as supplier_id,
  supplier.organization_id as supplier_organization_id,
  assembly_match.assembly_organization_id
from public.suppliers supplier
join public.organizations supplier_org
  on supplier_org.id = supplier.organization_id
join lateral (
  select min(assembly_org.id) as assembly_organization_id, count(*) as match_count
  from public.organizations assembly_org
  where assembly_org.partner_type = 'assembly'
    and lower(btrim(assembly_org.name)) = lower(btrim(supplier_org.name))
) assembly_match on true
where supplier_org.partner_type = 'supplier'
  and supplier_org.function_code = 'partner'
  and supplier_org.sort_order = 100
  and assembly_match.match_count = 1
  and supplier.created_at < supplier_org.created_at
  and not exists (
    select 1 from public.raw_material_contracts contract
    where contract.supplier_id = supplier.id
  )
  and not exists (
    select 1 from public.lme_price_records contract
    where contract.supplier_id = supplier.id
  )
  and not exists (
    select 1 from public.employees employee
    where employee.organization_id = supplier.organization_id
  );

do $$
declare
  candidate_count integer;
  raw_contract_count integer;
  lme_contract_count integer;
  project_relation_count integer;
  project_fk_count integer;
begin
  select count(*) into candidate_count from supplier_clone_cleanup_candidates;
  select count(*) into raw_contract_count
  from public.raw_material_contracts contract
  join supplier_clone_cleanup_candidates candidate on candidate.supplier_id = contract.supplier_id;
  select count(*) into lme_contract_count
  from public.lme_price_records contract
  join supplier_clone_cleanup_candidates candidate on candidate.supplier_id = contract.supplier_id;
  select count(*) into project_relation_count
  from public.project_assembly_vendors relation
  join supplier_clone_cleanup_candidates candidate on candidate.supplier_organization_id = relation.organization_id;
  select count(*) into project_fk_count
  from public.projects project
  join supplier_clone_cleanup_candidates candidate on candidate.supplier_organization_id = project.assembly_vendor_organization_id;

  raise notice 'supplier clone cleanup review: candidates=%, raw contracts=%, LME contracts=%, project relations=%, project FKs=%',
    candidate_count, raw_contract_count, lme_contract_count, project_relation_count, project_fk_count;
end
$$;

-- Repair unambiguous wrong project links without changing the number of rows.
update public.project_assembly_vendors relation
set organization_id = candidate.assembly_organization_id,
    updated_at = now()
from supplier_clone_cleanup_candidates candidate
where relation.organization_id = candidate.supplier_organization_id
  and not exists (
    select 1 from public.project_assembly_vendors existing
    where existing.project_id = relation.project_id
      and existing.organization_id = candidate.assembly_organization_id
  );

update public.projects project
set assembly_vendor_organization_id = candidate.assembly_organization_id,
    updated_at = now()
from supplier_clone_cleanup_candidates candidate
where project.assembly_vendor_organization_id = candidate.supplier_organization_id;

-- Delete only source suppliers that still have no contract or other known
-- business references after the project-link repair.
delete from public.suppliers supplier
using supplier_clone_cleanup_candidates candidate
where supplier.id = candidate.supplier_id
  and not exists (select 1 from public.raw_material_contracts contract where contract.supplier_id = supplier.id)
  and not exists (select 1 from public.lme_price_records contract where contract.supplier_id = supplier.id)
  and not exists (select 1 from public.employees employee where employee.organization_id = supplier.organization_id)
  and not exists (select 1 from public.project_assembly_vendors relation where relation.organization_id = supplier.organization_id)
  and not exists (select 1 from public.projects project where project.assembly_vendor_organization_id = supplier.organization_id);

-- Remove the generated supplier organization only after its supplier source and
-- every known project/employee reference are gone.
delete from public.organizations organization
using supplier_clone_cleanup_candidates candidate
where organization.id = candidate.supplier_organization_id
  and not exists (select 1 from public.suppliers supplier where supplier.organization_id = organization.id)
  and not exists (select 1 from public.employees employee where employee.organization_id = organization.id)
  and not exists (select 1 from public.project_assembly_vendors relation where relation.organization_id = organization.id)
  and not exists (select 1 from public.projects project where project.assembly_vendor_organization_id = organization.id);

notify pgrst, 'reload schema';
commit;
