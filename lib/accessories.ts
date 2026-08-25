export const ACCESSORY_UNITS = ["EA", "M", "SET"] as const;
export type AccessoryUnit = (typeof ACCESSORY_UNITS)[number];
export type AccessoryOrigin = "domestic" | "imported";
export type AccessoryPriceBasis = "KRW_DIRECT" | "FOREIGN_CURRENCY";
export type AccessoryCurrency = "KRW" | "USD";

export type AccessoryItem = {
  id: string;
  code: string;
  name: string;
  specification: string | null;
  unit: AccessoryUnit;
  origin_type: AccessoryOrigin;
  price_basis: AccessoryPriceBasis;
  currency: AccessoryCurrency;
  current_unit_price: number;
  vendor_organization_id: number | null;
  vendor_name: string | null;
  vendor_active: boolean | null;
  is_active: boolean;
  memo: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ProjectAccessoryUsage = {
  id: string;
  project_id: number;
  accessory_item_id: string;
  usage_date: string;
  quantity: number;
  snapshot_unit: AccessoryUnit;
  snapshot_origin_type: AccessoryOrigin;
  snapshot_price_basis: AccessoryPriceBasis;
  snapshot_currency: AccessoryCurrency;
  snapshot_unit_price: number;
  snapshot_exchange_rate: number | null;
  snapshot_krw_unit_price: number;
  total_cost_krw: number;
  memo: string | null;
  status: "active" | "void";
  created_at: string;
  updated_at: string;
  item_code: string;
  item_name: string;
  item_specification: string | null;
};

export function calculateAccessoryCost(input: {
  quantity: number;
  unitPrice: number;
  priceBasis: AccessoryPriceBasis;
  exchangeRate?: number | null;
}) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0)
    throw new Error("수량은 0보다 커야 합니다.");
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0)
    throw new Error("단가는 0 이상이어야 합니다.");
  const exchangeRate = input.exchangeRate ?? null;
  if (
    input.priceBasis === "FOREIGN_CURRENCY" &&
    (!exchangeRate || !Number.isFinite(exchangeRate) || exchangeRate <= 0)
  )
    throw new Error("적용환율은 0보다 커야 합니다.");
  const krwUnitPrice = Math.round(
    input.priceBasis === "FOREIGN_CURRENCY"
      ? input.unitPrice * Number(exchangeRate)
      : input.unitPrice,
  );
  const totalCostKrw = Math.round(input.quantity * krwUnitPrice);
  if (!Number.isSafeInteger(krwUnitPrice) || !Number.isSafeInteger(totalCostKrw))
    throw new Error("계산 금액이 안전한 원화 범위를 벗어났습니다.");
  return { krwUnitPrice, totalCostKrw };
}

export function validateAccessoryQuantity(unit: AccessoryUnit, quantity: number) {
  return Number.isFinite(quantity) && quantity > 0 && (unit === "M" || Number.isInteger(quantity));
}
