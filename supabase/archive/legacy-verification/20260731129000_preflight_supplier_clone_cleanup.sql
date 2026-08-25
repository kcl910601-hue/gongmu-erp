-- Review only. Run before 20260731130000 correction migration.

-- A. Same normalized name across assembly and supplier roles.
select
  lower(btrim(supplier_org.name)) as normalized_name,
  assembly_org.id as assembly_organization_id,
  supplier_org.id as supplier_organization_id,
  supplier_org.sort_order,
  supplier_org.created_at
from public.organizations supplier_org
join public.organizations assembly_org
  on lower(btrim(assembly_org.name)) = lower(btrim(supplier_org.name))
 and assembly_org.partner_type = 'assembly'
where supplier_org.partner_type = 'supplier'
order by normalized_name, supplier_org.id;

-- B-G. Supplier usage and automatic-clone candidate review.
select
  supplier.id as supplier_id,
  supplier.name,
  supplier.organization_id as supplier_organization_id,
  supplier_org.created_at as supplier_organization_created_at,
  supplier_org.sort_order,
  assembly_match.assembly_organization_id,
  (select count(*) from public.raw_material_contracts contract where contract.supplier_id = supplier.id) as raw_material_contract_count,
  (select count(*) from public.lme_price_records contract where contract.supplier_id = supplier.id) as lme_contract_count,
  (select count(*) from public.project_assembly_vendors relation where relation.organization_id = supplier.organization_id) as project_assembly_vendor_count,
  (select count(*) from public.projects project where project.assembly_vendor_organization_id = supplier.organization_id) as project_legacy_fk_count,
  case
    when supplier_org.partner_type = 'supplier'
     and supplier_org.sort_order = 100
     and assembly_match.match_count = 1
    then true else false
  end as automatic_clone_candidate,
  case
    when supplier_org.partner_type = 'supplier'
     and supplier_org.sort_order = 100
     and assembly_match.match_count = 1
     and not exists (select 1 from public.raw_material_contracts contract where contract.supplier_id = supplier.id)
     and not exists (select 1 from public.lme_price_records contract where contract.supplier_id = supplier.id)
     and not exists (select 1 from public.employees employee where employee.organization_id = supplier.organization_id)
    then true else false
  end as cleanup_eligible
from public.suppliers supplier
join public.organizations supplier_org on supplier_org.id = supplier.organization_id
join lateral (
  select min(assembly_org.id) as assembly_organization_id, count(*) as match_count
  from public.organizations assembly_org
  where assembly_org.partner_type = 'assembly'
    and lower(btrim(assembly_org.name)) = lower(btrim(supplier_org.name))
) assembly_match on true
order by supplier.name, supplier.id;

-- H. Baseline project assembly link counts. Expected current values: 183 / 171.
select
  (select count(*) from public.project_assembly_vendors) as project_assembly_vendor_count,
  (select count(*) from public.projects where assembly_vendor_organization_id is not null) as project_legacy_fk_count;
