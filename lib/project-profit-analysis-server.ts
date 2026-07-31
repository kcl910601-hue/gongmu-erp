import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeProjectContracts, type ProjectContractEntry } from "@/lib/project-contracts";
import { calculateProjectProfitAnalysis } from "@/lib/project-profit-analysis";

export type MaterialCostRow = { id: string; project_id: number; material_code: string; pricing_basis: "contract" | "market"; cost_reference_date: string; expected_quantity_kg: number; applied_unit_price_krw_per_kg: number; expected_cost_krw: number };
export function groupRows<T extends { project_id: number }>(rows: T[]) { const map = new Map<number, T[]>(); for (const row of rows) map.set(row.project_id, [...(map.get(row.project_id) ?? []), row]); return map; }
function safeValues(values: number[]) { return values.every((value) => Number.isSafeInteger(Number(value))); }
export function buildProfitRecord(project: Record<string, unknown>, contractEntries: ProjectContractEntry[], materialRows: MaterialCostRow[]) {
  const contractSummary = summarizeProjectContracts(contractEntries); const costValues = materialRows.map((row) => Number(row.expected_cost_krw)); const expectedCost = costValues.reduce((sum, value) => sum + value, 0); const amountsSafe = safeValues(contractEntries.flatMap((entry) => [entry.supply_amount_krw, entry.vat_amount_krw, entry.total_amount_krw]).map(Number)) && safeValues(costValues) && Number.isSafeInteger(expectedCost) && (contractSummary.final_supply_amount_krw === null || Number.isSafeInteger(contractSummary.final_supply_amount_krw));
  const analysis = calculateProjectProfitAnalysis({ finalSupplyAmountKrw: contractSummary.final_supply_amount_krw, expectedMaterialCostKrw: materialRows.length ? expectedCost : null, hasOriginalContract: contractSummary.has_original_contract, materialUsageCount: materialRows.length, amountsAreSafe: amountsSafe });
  return { ...project, contract_summary: contractSummary, material_cost_summary: { expected_material_cost_krw: materialRows.length ? expectedCost : null, material_usage_count: materialRows.length, expected_quantity_kg: materialRows.reduce((sum, row) => sum + Number(row.expected_quantity_kg), 0), contract_basis_cost_krw: materialRows.filter((row) => row.pricing_basis === "contract").reduce((sum, row) => sum + Number(row.expected_cost_krw), 0), market_basis_cost_krw: materialRows.filter((row) => row.pricing_basis === "market").reduce((sum, row) => sum + Number(row.expected_cost_krw), 0) }, analysis };
}

export async function queryProfitSourceData(supabase: SupabaseClient, projects: Record<string, unknown>[]) {
  const ids = projects.map((project) => Number(project.id)); if (!ids.length) return { data: [], error: null };
  const [contracts, costs] = await Promise.all([supabase.from("project_contract_entries").select("*").in("project_id", ids), supabase.from("project_material_usages").select("id, project_id, material_code, pricing_basis, cost_reference_date, expected_quantity_kg, applied_unit_price_krw_per_kg, expected_cost_krw").in("project_id", ids)]);
  if (contracts.error || costs.error) return { data: null, error: contracts.error ?? costs.error };
  const contractMap = groupRows((contracts.data ?? []) as ProjectContractEntry[]); const costMap = groupRows((costs.data ?? []) as MaterialCostRow[]);
  return { data: projects.map((project) => buildProfitRecord(project, contractMap.get(Number(project.id)) ?? [], costMap.get(Number(project.id)) ?? [])), error: null };
}
