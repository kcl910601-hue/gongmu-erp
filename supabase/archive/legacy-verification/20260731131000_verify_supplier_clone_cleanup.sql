-- Run after 20260731130000 correction migration.

-- A. Same-name role pairs remaining for manual review.
select lower(btrim(supplier_org.name)) as normalized_name,
       assembly_org.id as assembly_organization_id,
       supplier_org.id as supplier_organization_id
from public.organizations supplier_org
join public.organizations assembly_org
  on lower(btrim(assembly_org.name)) = lower(btrim(supplier_org.name))
 and assembly_org.partner_type = 'assembly'
where supplier_org.partner_type = 'supplier'
order by normalized_name;

-- B-D/F. Remaining supplier usage and generated-pattern candidates.
select supplier.id, supplier.name, supplier.organization_id,
  (select count(*) from public.raw_material_contracts contract where contract.supplier_id = supplier.id) as raw_material_contract_count,
  (select count(*) from public.lme_price_records contract where contract.supplier_id = supplier.id) as lme_contract_count,
  (select count(*) from public.project_assembly_vendors relation where relation.organization_id = supplier.organization_id) as project_relation_count,
  (select count(*) from public.projects project where project.assembly_vendor_organization_id = supplier.organization_id) as project_fk_count,
  supplier_org.sort_order
from public.suppliers supplier
join public.organizations supplier_org on supplier_org.id = supplier.organization_id
order by supplier.name;

-- E. Expected: no rows.
select relation.id, relation.project_id, relation.organization_id
from public.project_assembly_vendors relation
join public.organizations organization on organization.id = relation.organization_id
where organization.partner_type <> 'assembly';

-- Expected: no rows.
select project.id, project.assembly_vendor_organization_id
from public.projects project
join public.organizations organization on organization.id = project.assembly_vendor_organization_id
where organization.partner_type <> 'assembly';

-- G. Final partner counts.
select partner_type, count(*) as organization_count
from public.organizations
where partner_type is not null
group by partner_type
order by partner_type;

-- H. Expected after this correction for the verified production snapshot:
-- project_assembly_vendor_count = 183, project_legacy_fk_count = 171.
select
  (select count(*) from public.project_assembly_vendors) as project_assembly_vendor_count,
  (select count(*) from public.projects where assembly_vendor_organization_id is not null) as project_legacy_fk_count;
