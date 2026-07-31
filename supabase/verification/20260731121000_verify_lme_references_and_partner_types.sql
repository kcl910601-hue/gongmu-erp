-- Expected after importing verified source data: no rows.
-- round 1 = First Week, round 2 = Last Week.
with expected as (
  select month_start::date as reference_month, round
  from generate_series(date '2024-01-01', date_trunc('month', current_date), interval '1 month') month_start
  cross join (values (1), (2)) rounds(round)
)
select expected.reference_month, expected.round
from expected
left join public.lme_market_prices actual
  on actual.reference_month = expected.reference_month
 and actual.round = expected.round
 and actual.material_code = 'AL'
where actual.id is null
   or actual.lme_al_usd_per_ton is null
   or actual.lme_al_usd_per_ton <= 0
   or actual.exchange_rate_krw_per_usd is null
   or actual.exchange_rate_krw_per_usd <= 0
   or actual.domestic_lme_krw_per_kg is null
   or actual.domestic_lme_krw_per_kg <= 0;

-- Expected: no rows.
select organization.id, organization.name, organization.partner_type
from public.organizations organization
join public.organization_categories category on category.id = organization.category_id
where category.code = 'partner' and organization.partner_type is null;

-- Expected: no rows. Contract UUID FKs remain attached to suppliers, and every
-- supplier must point to a supplier-type organization.
select contract.id, contract.supplier_id
from public.raw_material_contracts contract
join public.suppliers supplier on supplier.id = contract.supplier_id
join public.organizations partner on partner.id = supplier.organization_id
where partner.partner_type <> 'supplier';

-- Expected: no rows. This also covers suppliers not referenced by a contract.
select supplier.id, supplier.name, supplier.organization_id
from public.suppliers supplier
left join public.organizations partner on partner.id = supplier.organization_id
where partner.id is null or partner.partner_type <> 'supplier';

-- Expected: no rows. Existing project assembly links must remain assembly-only.
select project_vendor.id, project_vendor.organization_id
from public.project_assembly_vendors project_vendor
join public.organizations partner on partner.id = project_vendor.organization_id
where partner.partner_type <> 'assembly';

-- Review list: same normalized name intentionally represented once per type.
select lower(btrim(name)) as normalized_name,
       count(*) filter (where partner_type = 'supplier') as supplier_count,
       count(*) filter (where partner_type = 'assembly') as assembly_count
from public.organizations
where partner_type is not null
group by lower(btrim(name))
having count(*) > 1;
