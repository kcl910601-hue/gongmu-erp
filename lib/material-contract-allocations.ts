export const MATERIAL_CONTRACT_ALLOCATION_STATUSES = ["planned", "confirmed", "cancelled"] as const;

export type MaterialContractAllocationStatus = typeof MATERIAL_CONTRACT_ALLOCATION_STATUSES[number];
export const MATERIAL_ALLOCATION_SOURCE_TYPES = ["contract", "direct_price"] as const;
export type MaterialAllocationSourceType = typeof MATERIAL_ALLOCATION_SOURCE_TYPES[number];
export const MATERIAL_ALLOCATION_TYPES = ["project", "factory", "as", "sample", "etc"] as const;
export type MaterialAllocationType = typeof MATERIAL_ALLOCATION_TYPES[number];
export const MATERIAL_ALLOCATION_TYPE_LABELS: Record<MaterialAllocationType, string> = {
  project: "프로젝트/현장", factory: "공장 재고", as: "A/S", sample: "샘플", etc: "기타",
};
export function isMaterialAllocationType(value: unknown): value is MaterialAllocationType {
  return typeof value === "string" && MATERIAL_ALLOCATION_TYPES.includes(value as MaterialAllocationType);
}

export function formatMaterialUsageRequestAllocationHistory(metadata: unknown) {
  const root = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
  const after = root.after && typeof root.after === "object" && !Array.isArray(root.after)
    ? root.after as Record<string, unknown>
    : {};
  const quantityTons = Number(after.quantity_tons);
  const appliedUnitPrice = Number(after.applied_unit_price_krw_per_kg);
  const source = after.source_type === "direct_price" ? "직접단가" : "계약";
  const quantityLabel = Number.isFinite(quantityTons)
    ? `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(quantityTons * 1_000)}kg`
    : "배정량 확인 필요";
  const priceLabel = Number.isFinite(appliedUnitPrice)
    ? `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 }).format(appliedUnitPrice)}원/kg`
    : "단가 확인 필요";
  return `${source} · ${quantityLabel} · ${priceLabel}`;
}

export type ContractAllocationSummary = {
  contractQuantityTons: number;
  plannedTons: number;
  confirmedTons: number;
  cancelledTons: number;
  remainingTons: number;
  availableTons: number;
};

export type ContractAllocationRow = {
  contract_id: string;
  quantity_tons: number | string;
  status: MaterialContractAllocationStatus;
};

export type MaterialContractAllocation = {
  id: string;
  contract_id: string | null;
  source_type: MaterialAllocationSourceType;
  direct_unit_price_krw_per_kg: number | null;
  applied_unit_price_krw_per_kg: number;
  allocation_type: MaterialAllocationType;
  project_id: number | null;
  destination_name: string | null;
  project_code: string | null;
  project_name: string;
  quantity_tons: number;
  allocation_date: string;
  status: MaterialContractAllocationStatus;
  purchase_order_no: string | null;
  memo: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  usage_request_id?: string | null;
};

export function isValidAllocationQuantity(value: unknown) {
  const quantity = typeof value === "number" ? value : Number(value);
  return Number.isFinite(quantity) && quantity > 0 && Math.round(quantity * QUANTITY_PRECISION) === quantity * QUANTITY_PRECISION;
}

const QUANTITY_PRECISION = 10_000;

function normalizeQuantity(value: number) {
  const rounded = Math.round(value * QUANTITY_PRECISION) / QUANTITY_PRECISION;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function calculateContractAllocationSummary(
  contractQuantityTons: number,
  allocations: readonly ContractAllocationRow[],
): ContractAllocationSummary {
  let plannedTons = 0;
  let confirmedTons = 0;
  let cancelledTons = 0;

  for (const allocation of allocations) {
    const quantity = Number(allocation.quantity_tons);
    if (!Number.isFinite(quantity)) continue;
    if (allocation.status === "planned") plannedTons += quantity;
    else if (allocation.status === "confirmed") confirmedTons += quantity;
    else cancelledTons += quantity;
  }

  plannedTons = normalizeQuantity(plannedTons);
  confirmedTons = normalizeQuantity(confirmedTons);
  cancelledTons = normalizeQuantity(cancelledTons);

  return {
    contractQuantityTons: normalizeQuantity(contractQuantityTons),
    plannedTons,
    confirmedTons,
    cancelledTons,
    remainingTons: normalizeQuantity(contractQuantityTons - confirmedTons),
    availableTons: normalizeQuantity(contractQuantityTons - confirmedTons - plannedTons),
  };
}

export function buildContractAllocationSummaryMap(
  contracts: readonly { id: string; contract_quantity_ton: number }[],
  allocations: readonly ContractAllocationRow[],
) {
  const rowsByContract = new Map<string, ContractAllocationRow[]>();
  for (const allocation of allocations) {
    const rows = rowsByContract.get(allocation.contract_id) ?? [];
    rows.push(allocation);
    rowsByContract.set(allocation.contract_id, rows);
  }

  return new Map(contracts.map((contract) => [
    contract.id,
    calculateContractAllocationSummary(Number(contract.contract_quantity_ton), rowsByContract.get(contract.id) ?? []),
  ]));
}
