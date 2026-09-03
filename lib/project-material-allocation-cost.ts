export type ProjectMaterialCostStatus = "planned" | "confirmed" | "cancelled";

export type ProjectMaterialCostRow = {
  allocation_type: string;
  status: ProjectMaterialCostStatus;
  quantity_tons: number | string;
  contract_price_krw_per_kg: number | string;
};

export type ProjectMaterialCostSummary = {
  plannedTons: number;
  confirmedTons: number;
  totalAllocatedTons: number;
  plannedCostKrw: number;
  confirmedCostKrw: number;
};

export type ProjectMaterialOrderStatus = {
  requestedTons: number;
  plannedTons: number;
  confirmedTons: number;
  allocatedTons: number;
  unallocatedTons: number;
  allocationRate: number;
};

type MaterialUsageRequestSummaryRow = {
  id: string;
  material_code: string;
  status: "active" | "cancelled";
  quantity_tons: number | string;
  unallocated_tons: number | string;
};

type MaterialOrderAllocationRow = {
  usage_request_id?: string | null;
  status: ProjectMaterialCostStatus;
  quantity_tons: number | string;
};

const QUANTITY_SCALE = 10_000;

export function calculateMaterialAllocationAmountKrw(quantityTons: number | string, unitPriceKrwPerKg: number | string) {
  const tons = Number(quantityTons);
  const unitPrice = Number(unitPriceKrwPerKg);
  if (!Number.isFinite(tons) || tons <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  const amount = Math.round(tons * 1_000 * unitPrice);
  return Number.isSafeInteger(amount) ? amount : null;
}

function normalizeTons(value: number) {
  return Math.round(value * QUANTITY_SCALE) / QUANTITY_SCALE;
}

export function summarizeProjectMaterialOrderStatus(
  requests: readonly MaterialUsageRequestSummaryRow[],
  allocations: readonly MaterialOrderAllocationRow[],
  materialCode = "AL",
): ProjectMaterialOrderStatus {
  const activeRequests = requests.filter((request) => request.status === "active" && request.material_code === materialCode);
  const requestIds = new Set(activeRequests.map((request) => request.id));
  let plannedTons = 0;
  let confirmedTons = 0;

  for (const allocation of allocations) {
    if (!allocation.usage_request_id || !requestIds.has(allocation.usage_request_id) || allocation.status === "cancelled") continue;
    const quantityTons = Number(allocation.quantity_tons);
    if (!Number.isFinite(quantityTons) || quantityTons <= 0) continue;
    if (allocation.status === "planned") plannedTons += quantityTons;
    else confirmedTons += quantityTons;
  }

  const requestedTons = normalizeTons(activeRequests.reduce((sum, request) => sum + Number(request.quantity_tons), 0));
  const unallocatedTons = normalizeTons(activeRequests.reduce((sum, request) => sum + Number(request.unallocated_tons), 0));
  plannedTons = normalizeTons(plannedTons);
  confirmedTons = normalizeTons(confirmedTons);
  const allocatedTons = normalizeTons(plannedTons + confirmedTons);

  return {
    requestedTons,
    plannedTons,
    confirmedTons,
    allocatedTons,
    unallocatedTons,
    allocationRate: requestedTons > 0 ? Math.min(100, Math.round((allocatedTons / requestedTons) * 10_000) / 100) : 0,
  };
}

export function summarizeProjectMaterialAllocationCosts(rows: readonly ProjectMaterialCostRow[]): ProjectMaterialCostSummary {
  let plannedTons = 0;
  let confirmedTons = 0;
  let plannedCostKrw = 0;
  let confirmedCostKrw = 0;

  for (const row of rows) {
    if (row.allocation_type !== "project" || row.status === "cancelled") continue;
    const tons = Number(row.quantity_tons);
    const amount = calculateMaterialAllocationAmountKrw(row.quantity_tons, row.contract_price_krw_per_kg);
    if (!Number.isFinite(tons) || amount === null) continue;
    if (row.status === "planned") { plannedTons += tons; plannedCostKrw += amount; }
    else { confirmedTons += tons; confirmedCostKrw += amount; }
  }

  return {
    plannedTons: normalizeTons(plannedTons),
    confirmedTons: normalizeTons(confirmedTons),
    totalAllocatedTons: normalizeTons(plannedTons + confirmedTons),
    plannedCostKrw,
    confirmedCostKrw,
  };
}
