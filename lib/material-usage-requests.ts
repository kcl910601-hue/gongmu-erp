import type { MaterialAllocationType, MaterialContractAllocationStatus } from "./material-contract-allocations.ts";

export const MATERIAL_USAGE_ALLOCATION_STRATEGIES = ["auto_split", "increase_contract", "leave_unallocated"] as const;
export type MaterialUsageAllocationStrategy = typeof MATERIAL_USAGE_ALLOCATION_STRATEGIES[number];
export type MaterialUsageAllocationState = "unallocated" | "partially_allocated" | "fully_allocated";
export type MaterialUsageContractCandidate = { id: string; availableTons: number; priceKrwPerKg: number; effectiveStartDate: string };
export type MaterialUsageAllocationPreview = { contractId: string; quantityTons: number; priceKrwPerKg: number; amountKrw: number };
const PRECISION = 10_000;
export function normalizeOptionalMaterialUsageText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}
export function canReduceMaterialUsageQuantity(nextQuantityTons: number, allocatedTons: number) {
  return Number.isFinite(nextQuantityTons) && nextQuantityTons > 0 && normalizeMaterialTons(nextQuantityTons) >= normalizeMaterialTons(allocatedTons);
}
export function summarizeUnallocatedUsageRequests(rows: readonly Pick<MaterialUsageRequest, "status" | "unallocated_tons">[]) {
  const active = rows.filter((row) => row.status === "active" && row.unallocated_tons > 0);
  return { count: active.length, totalTons: normalizeMaterialTons(active.reduce((sum, row) => sum + row.unallocated_tons, 0)) };
}
export function normalizeMaterialTons(value: number) { return Math.round(value * PRECISION) / PRECISION; }
export function getMaterialUsageAllocationState(requestedTons: number, allocatedTons: number): MaterialUsageAllocationState {
  const remaining = normalizeMaterialTons(Math.max(requestedTons - allocatedTons, 0));
  return remaining === 0 ? "fully_allocated" : allocatedTons > 0 ? "partially_allocated" : "unallocated";
}
export function calculateUnallocatedTons(requestedTons: number, allocations: readonly { quantityTons: number; status: MaterialContractAllocationStatus }[]) {
  const allocated = allocations.filter((row) => row.status !== "cancelled").reduce((sum, row) => sum + row.quantityTons, 0);
  return normalizeMaterialTons(Math.max(requestedTons - allocated, 0));
}
export function buildMaterialUsageAllocationPreview(requestedTons: number, candidates: readonly MaterialUsageContractCandidate[]) {
  let remaining = normalizeMaterialTons(requestedTons);
  const allocations: MaterialUsageAllocationPreview[] = [];
  for (const contract of candidates) {
    const quantityTons = normalizeMaterialTons(Math.min(remaining, Math.max(contract.availableTons, 0)));
    if (quantityTons <= 0) continue;
    allocations.push({ contractId: contract.id, quantityTons, priceKrwPerKg: contract.priceKrwPerKg, amountKrw: Math.round(quantityTons * 1000 * contract.priceKrwPerKg) });
    remaining = normalizeMaterialTons(remaining - quantityTons);
    if (remaining === 0) break;
  }
  return { allocations, allocatedTons: normalizeMaterialTons(requestedTons - remaining), unallocatedTons: remaining, estimatedCostKrw: allocations.reduce((sum, row) => sum + row.amountKrw, 0) };
}
export type MaterialUsageRequest = { id: string; material_code: string; allocation_type: MaterialAllocationType; project_id: number | null; project_code?: string | null; project_name?: string | null; destination_name: string | null; quantity_tons: number; purchase_order_no: string | null; usage_date: string; memo: string | null; status: "active" | "cancelled"; allocated_tons: number; unallocated_tons: number; allocation_state: MaterialUsageAllocationState; created_at: string; material_usage_group_id: string | null; group_name: string | null; group_category: import("./material-usage-groups").MaterialUsageGroupCategory | null; group_sequence: number | null; group_status: import("./material-usage-groups").MaterialUsageGroupStatus | null; group_planned_date: string | null; group_is_active: boolean | null };
