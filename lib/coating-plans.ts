export type CoatingSource = {
  requestId: string;
  groupId: string | null;
  groupName: string;
  purchaseOrderNo: string | null;
  usageDate: string;
  orderedKg: number;
  plannedKg: number;
  confirmedKg: number;
  allocatedKg: number;
  fingerprint: string;
};

export type CoatingPlanSource = { requestId: string; weightKg: number; snapshot: CoatingSource };
export type CoatingPlan = {
  id: string;
  project_id: number;
  vendor_organization_id: number;
  vendor_name: string;
  weight_basis: "ordered" | "allocated";
  pricing_unit: "kg" | "m";
  target_weight_kg: number;
  pricing_quantity: number;
  unit_price_krw: number;
  expected_amount_krw: number;
  sources: CoatingPlanSource[];
  memo: string | null;
  status: "active" | "cancelled";
  version: number;
  updated_at: string;
};

export type CoatingPlanContext = {
  exclusions?: CoatingExclusion[];
  sources: CoatingSource[];
  plans: CoatingPlan[];
  vendors: { id: number; name: string; is_active: boolean }[];
  actualCostKrw: number;
  canManage: boolean;
};

export type CoatingExclusion = {
  request_id: string;
  project_id: number;
  weight_kg: number;
  reason: string;
  version: number;
};

export function coatingExcludedKg(data: CoatingPlanContext, requestId: string) {
  return Number(data.exclusions?.find((item) => item.request_id === requestId)?.weight_kg ?? 0);
}

export function calculateCoatingExpectedKrw(quantity: number, unitPrice: number): number | null {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice) || quantity <= 0 || unitPrice <= 0) return null;
  const scaledQuantity = Math.round(quantity * 1000);
  const scaledPrice = Math.round(unitPrice * 100);
  if (!Number.isSafeInteger(scaledQuantity) || !Number.isSafeInteger(scaledPrice)) return null;
  // Decimal kg/m (3 places) × KRW (2 places), then round once to whole KRW.
  const amount = (BigInt(scaledQuantity) * BigInt(scaledPrice) + BigInt(50000)) / BigInt(100000);
  const result = Number(amount);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

export function coatingUsedKg(plans: CoatingPlan[], requestId: string, excludingId?: string) {
  return Math.round(plans.filter((plan) => plan.status === "active" && plan.id !== excludingId)
    .flatMap((plan) => plan.sources).filter((source) => source.requestId === requestId)
    .reduce((sum, source) => sum + source.weightKg, 0) * 10) / 10;
}

export function coatingSourceChanged(plan: CoatingPlan, sources: CoatingSource[]) {
  const current = new Map(sources.map((source) => [source.requestId, source.fingerprint]));
  return plan.sources.some((source) => current.get(source.requestId) !== source.snapshot.fingerprint);
}

export function coatingPlanSummary(data: CoatingPlanContext) {
  const active = data.plans.filter((plan) => plan.status === "active");
  const kg = (value: number) => Math.round(value * 10) / 10;
  return {
    orderedKg: kg(data.sources.reduce((sum, source) => sum + source.orderedKg, 0)),
    allocatedKg: kg(data.sources.reduce((sum, source) => sum + source.allocatedKg, 0)),
    excludedKg: kg(data.sources.reduce((sum, source) => sum + coatingExcludedKg(data, source.requestId), 0)),
    remainingKg: kg(data.sources.reduce((sum, source) => sum + Math.max(0, source.allocatedKg - coatingExcludedKg(data, source.requestId) - coatingUsedKg(data.plans, source.requestId)), 0)),
    coatingKg: kg(active.reduce((sum, plan) => sum + plan.target_weight_kg, 0)),
    expectedKrw: active.reduce((sum, plan) => sum + plan.expected_amount_krw, 0),
  };
}
