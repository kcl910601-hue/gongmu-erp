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
