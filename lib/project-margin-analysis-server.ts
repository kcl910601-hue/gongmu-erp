import type { SupabaseClient } from "@supabase/supabase-js";
import {
  summarizeProjectContracts,
  type ProjectContractEntry,
} from "@/lib/project-contracts";
import {
  summarizeProjectCosts,
  type ProjectCostCategory,
  type ProjectCostEntry,
} from "@/lib/project-costs";
import { calculateProjectMargin } from "@/lib/project-margin-analysis";
import type { MaterialCostRow } from "@/lib/project-profit-analysis-server";

type StatementLink = {
  id: string;
  vendor_organization_id: number;
  accounting_month: string;
  invoice_number: string | null;
  supply_amount_krw: number;
  vat_amount_krw: number;
  memo: string | null;
  status: string;
  vendor: { name: string } | Array<{ name: string }>;
  allocations: Array<{project_id:number;allocated_supply_amount_krw:number;status:string}>;
};
export type GlassMarginRow = {
  id: string;
  project_id: number;
  statement_id: string;
  allocated_supply_amount_krw: number;
  status: string;
  statement: StatementLink | StatementLink[];
};
export type CoatingMarginRow = GlassMarginRow;
export type AccessoryMarginRow = { id: string; project_id: number; total_cost_krw: number; status: string };
function group<T extends { project_id: number }>(rows: T[]) {
  const map = new Map<number, T[]>();
  for (const row of rows)
    map.set(row.project_id, [...(map.get(row.project_id) ?? []), row]);
  return map;
}
function safe(values: number[]) {
  return values.every((value) => Number.isSafeInteger(Number(value)));
}
function statementOf(row: GlassMarginRow) {
  return Array.isArray(row.statement) ? row.statement[0] : row.statement;
}

export function buildMarginRecord(
  project: Record<string, unknown>,
  contracts: ProjectContractEntry[],
  materials: MaterialCostRow[],
  costs: ProjectCostEntry[],
  categories: ProjectCostCategory[],
  glassRows: GlassMarginRow[] = [],
  coatingRows: CoatingMarginRow[] = [],
  accessoryRows: AccessoryMarginRow[] = [],
) {
  const contract = summarizeProjectContracts(contracts),
    additional = summarizeProjectCosts(costs, categories);
  const materialValues = materials.map((row) => Number(row.expected_cost_krw)),
    materialTotal = materialValues.reduce((sum, value) => sum + value, 0);
  const validGlass = glassRows.filter(
      (row) => row.status === "active" && statementOf(row)?.status === "active",
    ),
    glassTotal = validGlass.reduce(
      (sum, row) => sum + Number(row.allocated_supply_amount_krw),
      0,
    ),
    validCoating = coatingRows.filter(
      (row) => row.status === "active" && statementOf(row)?.status === "active",
    ),
    coatingTotal = validCoating.reduce(
      (sum, row) => sum + Number(row.allocated_supply_amount_krw),
      0,
    ),
    validAccessories = accessoryRows.filter((row) => row.status === "active"),
    accessoryTotal = validAccessories.reduce((sum, row) => sum + Number(row.total_cost_krw), 0);
  const amountsAreSafe =
    additional.amounts_are_safe &&
    safe([
      ...materialValues,
      ...validGlass.map((row) => Number(row.allocated_supply_amount_krw)),
      ...validCoating.map((row) => Number(row.allocated_supply_amount_krw)),
      ...validAccessories.map((row) => Number(row.total_cost_krw)),
    ]) &&
    Number.isSafeInteger(materialTotal) &&
    Number.isSafeInteger(glassTotal) &&
    Number.isSafeInteger(coatingTotal) &&
    Number.isSafeInteger(accessoryTotal) &&
    (contract.final_supply_amount_krw === null ||
      Number.isSafeInteger(contract.final_supply_amount_krw));
  const analysis = calculateProjectMargin({
    finalSupplyAmountKrw: contract.final_supply_amount_krw,
    expectedMaterialCostKrw: materials.length ? materialTotal : null,
    actualGlassCostKrw: glassTotal,
    actualCoatingCostKrw: coatingTotal,
    actualAccessoryCostKrw: accessoryTotal,
    expectedAdditionalCostKrw: additional.total_supply_amount_krw,
    hasOriginalContract: contract.has_original_contract,
    materialUsageCount: materials.length,
    amountsAreSafe,
  });
  const total = analysis.expected_total_cost_krw;
  const composition: Record<
    string,
    {
      code: string;
      name: string;
      count: number;
      supply_amount_krw: number;
      share_of_total_cost: number | null;
    }
  > = {
    al: {
      code: "al",
      name: "AL 예상원가",
      count: materials.length,
      supply_amount_krw: materialTotal,
      share_of_total_cost:
        total && total > 0 ? (materialTotal / total) * 100 : null,
    },
    glass: {
      code: "glass",
      name: "유리 실제원가",
      count: validGlass.length,
      supply_amount_krw: glassTotal,
      share_of_total_cost:
        total && total > 0 ? (glassTotal / total) * 100 : null,
    },
    coating: {
      code: "coating",
      name: "도장 실제원가",
      count: validCoating.length,
      supply_amount_krw: coatingTotal,
      share_of_total_cost:
        total && total > 0 ? (coatingTotal / total) * 100 : null,
    },
    accessory: {
      code: "accessory",
      name: "부자재 실제원가",
      count: validAccessories.length,
      supply_amount_krw: accessoryTotal,
      share_of_total_cost: total && total > 0 ? (accessoryTotal / total) * 100 : null,
    },
  };
  for (const item of Object.values(additional.category_breakdown))
    composition[item.code] = {
      code: item.code,
      name: item.name,
      count: item.count,
      supply_amount_krw: item.supply_amount_krw,
      share_of_total_cost:
        total && total > 0 ? (item.supply_amount_krw / total) * 100 : null,
    };
  return {
    ...project,
    contract_summary: contract,
    material_cost_summary: {
      expected_material_cost_krw: materials.length ? materialTotal : null,
      material_usage_count: materials.length,
      expected_quantity_kg: materials.reduce(
        (sum, row) => sum + Number(row.expected_quantity_kg),
        0,
      ),
      contract_basis_cost_krw: materials
        .filter((row) => row.pricing_basis === "contract")
        .reduce((sum, row) => sum + Number(row.expected_cost_krw), 0),
      market_basis_cost_krw: materials
        .filter((row) => row.pricing_basis === "market")
        .reduce((sum, row) => sum + Number(row.expected_cost_krw), 0),
    },
    glass_cost_summary: {
      actual_glass_cost_krw: glassTotal,
      allocation_count: validGlass.length,
    },
    glass_breakdown: validGlass.map((row) => {
      const statement = statementOf(row),
        vendor = Array.isArray(statement.vendor)
          ? statement.vendor[0]
          : statement.vendor;
      return {
        id: row.id,
        statement_id: row.statement_id,
        accounting_month: statement.accounting_month,
        invoice_number: statement.invoice_number,
        vendor_name: vendor?.name ?? "업체 없음",
        allocated_supply_amount_krw: Number(row.allocated_supply_amount_krw),
        statement_status: statement.status,
        vendor_organization_id: statement.vendor_organization_id,
        statement_supply_amount_krw: Number(statement.supply_amount_krw),
        vat_amount_krw: Number(statement.vat_amount_krw),
        memo: statement.memo,
        active_allocation_count: statement.allocations.filter((item)=>item.status==="active").length,
        is_single_project_full_allocation: statement.allocations.filter((item)=>item.status==="active").length===1&&Number(statement.supply_amount_krw)===Number(row.allocated_supply_amount_krw),
      };
    }),
    coating_cost_summary: {
      actual_coating_cost_krw: coatingTotal,
      allocation_count: validCoating.length,
    },
    coating_breakdown: validCoating.map((row) => {
      const statement = statementOf(row),
        vendor = Array.isArray(statement.vendor)
          ? statement.vendor[0]
          : statement.vendor;
      return {
        id: row.id,
        statement_id: row.statement_id,
        accounting_month: statement.accounting_month,
        invoice_number: statement.invoice_number,
        vendor_name: vendor?.name ?? "업체 없음",
        allocated_supply_amount_krw: Number(row.allocated_supply_amount_krw),
        statement_status: statement.status,
        vendor_organization_id: statement.vendor_organization_id,
        statement_supply_amount_krw: Number(statement.supply_amount_krw),
        vat_amount_krw: Number(statement.vat_amount_krw),
        memo: statement.memo,
        active_allocation_count: statement.allocations.filter((item) => item.status === "active").length,
        is_single_project_full_allocation: statement.allocations.filter((item) => item.status === "active").length === 1 && Number(statement.supply_amount_krw) === Number(row.allocated_supply_amount_krw),
      };
    }),
    accessory_cost_summary: { actual_accessory_cost_krw: accessoryTotal, usage_count: validAccessories.length },
    additional_cost_summary: additional,
    cost_composition: composition,
    analysis,
  };
}

export async function queryMarginData(
  supabase: SupabaseClient,
  projects: Record<string, unknown>[],
) {
  const ids = projects.map((project) => Number(project.id));
  if (!ids.length) return { data: [], error: null };
  const [contracts, materials, costs, categories, glass, coating, accessories] = await Promise.all([
    supabase.from("project_contract_entries").select("*").in("project_id", ids),
    supabase
      .from("project_material_usages")
      .select(
        "id,project_id,material_code,pricing_basis,cost_reference_date,expected_quantity_kg,applied_unit_price_krw_per_kg,expected_cost_krw",
      )
      .in("project_id", ids),
    supabase.from("project_cost_entries").select("*").in("project_id", ids),
    supabase.from("project_cost_categories").select("*").order("sort_order"),
    supabase
      .from("glass_cost_allocations")
      .select(
        "id,project_id,statement_id,allocated_supply_amount_krw,status,statement:glass_cost_statements!statement_id(id,vendor_organization_id,accounting_month,invoice_number,supply_amount_krw,vat_amount_krw,memo,status,vendor:organizations!vendor_organization_id(name),allocations:glass_cost_allocations(project_id,allocated_supply_amount_krw,status))",
      )
      .in("project_id", ids)
      .eq("status", "active"),
    supabase
      .from("coating_cost_allocations")
      .select(
        "id,project_id,statement_id,allocated_supply_amount_krw,status,statement:coating_cost_statements!statement_id(id,vendor_organization_id,accounting_month,invoice_number,supply_amount_krw,vat_amount_krw,memo,status,vendor:organizations!vendor_organization_id(name),allocations:coating_cost_allocations(project_id,allocated_supply_amount_krw,status))",
      )
      .in("project_id", ids)
      .eq("status", "active"),
    supabase.from("project_accessory_usages").select("id,project_id,total_cost_krw,status").in("project_id", ids).eq("status", "active"),
  ]);
  if (
    contracts.error ||
    materials.error ||
    costs.error ||
    categories.error ||
    glass.error ||
    coating.error ||
    accessories.error
  )
    return {
      data: null,
      error:
        contracts.error ??
        materials.error ??
        costs.error ??
        categories.error ??
        glass.error ??
        coating.error ??
        accessories.error,
    };
  const contractMap = group((contracts.data ?? []) as ProjectContractEntry[]),
    materialMap = group((materials.data ?? []) as MaterialCostRow[]),
    costMap = group((costs.data ?? []) as ProjectCostEntry[]),
    glassMap = group((glass.data ?? []) as unknown as GlassMarginRow[]),
    coatingMap = group((coating.data ?? []) as unknown as CoatingMarginRow[]),
    accessoryMap = group((accessories.data ?? []) as unknown as AccessoryMarginRow[]),
    categoryRows = (categories.data ?? []) as ProjectCostCategory[];
  return {
    data: projects.map((project) =>
      buildMarginRecord(
        project,
        contractMap.get(Number(project.id)) ?? [],
        materialMap.get(Number(project.id)) ?? [],
        costMap.get(Number(project.id)) ?? [],
        categoryRows,
        glassMap.get(Number(project.id)) ?? [],
        coatingMap.get(Number(project.id)) ?? [],
        accessoryMap.get(Number(project.id)) ?? [],
      ),
    ),
    error: null,
  };
}
