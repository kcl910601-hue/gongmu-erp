export type PricingBasis = "contract" | "market";
export type QuantityUnit = "kg" | "ton";

export type ProjectCostProject = {
  id: number;
  project_code: string | null;
  project_name: string;
  client_name: string | null;
  site_address: string | null;
  process_type: string | null;
  start_date: string | null;
  end_date: string | null;
  quantity: number | null;
  quantity_unit: string | null;
};

export type ProjectMaterialUsage = {
  id: string;
  project_id: number;
  material_code: string;
  material_name: string | null;
  raw_material_contract_id: string | null;
  lme_market_price_id: string | null;
  pricing_basis: PricingBasis;
  cost_reference_date: string;
  expected_quantity_kg: number;
  input_quantity: number;
  input_unit: QuantityUnit;
  applied_unit_price_krw_per_kg: number;
  processing_cost_snapshot: number | null;
  domestic_lme_snapshot: number | null;
  contract_price_snapshot: number | null;
  expected_cost_krw: number;
  memo: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  contract_name: string | null;
  supplier_name: string | null;
  market_reference_date: string | null;
  market_round: number | null;
};

export function normalizeExpectedQuantity(inputQuantity: number, inputUnit: QuantityUnit) {
  return inputUnit === "ton" ? inputQuantity * 1000 : inputQuantity;
}

export function calculateExpectedCost(quantityKg: number, unitPrice: number) {
  return Math.round(quantityKg * unitPrice);
}

export function formatKrw(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}
