import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateExpectedCost,
  normalizeExpectedQuantity,
  type PricingBasis,
  type ProjectMaterialUsage,
  type QuantityUnit,
} from "@/lib/project-material-cost";

type UsageInput = {
  inputQuantity: number;
  inputUnit: QuantityUnit;
  costReferenceDate: string;
  pricingBasis: PricingBasis;
  rawMaterialContractId: string | null;
  lmeMarketPriceId: string | null;
  processingCost: number | null;
  memo: string | null;
};

export function parseUsageInput(body: Record<string, unknown>): { data: UsageInput | null; error: string | null } {
  const inputQuantity = Number(body.inputQuantity);
  const inputUnit = body.inputUnit === "kg" || body.inputUnit === "ton" ? body.inputUnit : null;
  const costReferenceDate = typeof body.costReferenceDate === "string" ? body.costReferenceDate : "";
  const pricingBasis = body.pricingBasis === "contract" || body.pricingBasis === "market" ? body.pricingBasis : null;
  const rawMaterialContractId = typeof body.rawMaterialContractId === "string" && body.rawMaterialContractId ? body.rawMaterialContractId : null;
  const lmeMarketPriceId = typeof body.lmeMarketPriceId === "string" && body.lmeMarketPriceId ? body.lmeMarketPriceId : null;
  const processingCost = body.processingCost === null || body.processingCost === "" || body.processingCost === undefined ? null : Number(body.processingCost);
  const memo = typeof body.memo === "string" && body.memo.trim() ? body.memo.trim() : null;
  if (!Number.isFinite(inputQuantity) || inputQuantity <= 0 || !inputUnit || !/^\d{4}-\d{2}-\d{2}$/.test(costReferenceDate) || !pricingBasis || (memo?.length ?? 0) > 2000) return { data: null, error: "입력값을 확인해주세요." };
  if (pricingBasis === "contract" && !rawMaterialContractId) return { data: null, error: "계약을 선택해주세요." };
  if (pricingBasis === "market" && (!lmeMarketPriceId || processingCost === null || !Number.isFinite(processingCost) || processingCost < 0)) return { data: null, error: "Market 시세와 가공비를 확인해주세요." };
  return { data: { inputQuantity, inputUnit, costReferenceDate, pricingBasis, rawMaterialContractId, lmeMarketPriceId, processingCost, memo }, error: null };
}

export async function buildUsageSnapshot(supabase: SupabaseClient, materialCode: string, input: UsageInput) {
  const expectedQuantityKg = normalizeExpectedQuantity(input.inputQuantity, input.inputUnit);
  if (!Number.isFinite(expectedQuantityKg) || expectedQuantityKg <= 0) return { data: null, error: "예상 사용량을 확인해주세요." };
  if (input.pricingBasis === "contract") {
    const { data: contract, error } = await supabase.from("raw_material_contracts").select("id, material_code, contract_price_krw_per_kg").eq("id", input.rawMaterialContractId).eq("status", "active").lte("effective_start_date", input.costReferenceDate).gte("effective_end_date", input.costReferenceDate).gt("remaining_quantity_ton", 0).maybeSingle();
    if (error) return { data: null, error: error.message };
    if (!contract || contract.material_code !== materialCode) return { data: null, error: "선택한 계약이 Material과 일치하지 않습니다." };
    const price = Number(contract.contract_price_krw_per_kg);
    return { data: { raw_material_contract_id: contract.id, lme_market_price_id: null, expected_quantity_kg: expectedQuantityKg, input_quantity: input.inputQuantity, input_unit: input.inputUnit, pricing_basis: input.pricingBasis, cost_reference_date: input.costReferenceDate, applied_unit_price_krw_per_kg: price, processing_cost_snapshot: null, domestic_lme_snapshot: null, contract_price_snapshot: price, expected_cost_krw: calculateExpectedCost(expectedQuantityKg, price), memo: input.memo }, error: null };
  }
  const { data: market, error } = await supabase.from("lme_market_prices").select("id, material_code, reference_date, domestic_lme_krw_per_kg").eq("material_code", materialCode).lte("reference_date", input.costReferenceDate).order("reference_date", { ascending: false }).order("round", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!market || market.id !== input.lmeMarketPriceId) return { data: null, error: "원가 기준일 이하의 최신 Market 시세를 다시 선택해주세요." };
  const domestic = Number(market.domestic_lme_krw_per_kg); const processing = input.processingCost ?? 0; const price = domestic + processing;
  return { data: { raw_material_contract_id: null, lme_market_price_id: market.id, expected_quantity_kg: expectedQuantityKg, input_quantity: input.inputQuantity, input_unit: input.inputUnit, pricing_basis: input.pricingBasis, cost_reference_date: input.costReferenceDate, applied_unit_price_krw_per_kg: price, processing_cost_snapshot: processing, domestic_lme_snapshot: domestic, contract_price_snapshot: null, expected_cost_krw: calculateExpectedCost(expectedQuantityKg, price), memo: input.memo }, error: null };
}

export async function queryProjectMaterialUsages(supabase: SupabaseClient, projectId: number) {
  const { data, error } = await supabase.from("project_material_usages").select("*, material:lme_materials(name), contract:raw_material_contracts(contract_name, supplier:suppliers(name)), market:lme_market_prices(reference_date, round)").eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) return { data: null, error };
  const creatorIds = [...new Set((data ?? []).map((row) => row.created_by as string))];
  const creators = creatorIds.length ? await supabase.from("employees").select("auth_user_id, name").in("auth_user_id", creatorIds) : { data: [], error: null };
  if (creators.error) return { data: null, error: creators.error };
  const creatorMap = new Map((creators.data ?? []).map((employee) => [employee.auth_user_id, employee.name]));
  const rows = (data ?? []).map((row) => {
    const material = Array.isArray(row.material) ? row.material[0] : row.material;
    const contract = Array.isArray(row.contract) ? row.contract[0] : row.contract;
    const supplier = Array.isArray(contract?.supplier) ? contract.supplier[0] : contract?.supplier;
    const market = Array.isArray(row.market) ? row.market[0] : row.market;
    return { ...row, material: undefined, contract: undefined, market: undefined, material_name: material?.name ?? null, contract_name: contract?.contract_name ?? null, supplier_name: supplier?.name ?? null, market_reference_date: market?.reference_date ?? null, market_round: market?.round ?? null, created_by_name: creatorMap.get(row.created_by) ?? null } as ProjectMaterialUsage;
  });
  return { data: rows, error: null };
}
