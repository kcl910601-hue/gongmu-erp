import type { SupabaseClient } from "@supabase/supabase-js";
import { getLatestLmeMarkets } from "@/lib/lme-market-server";
import { calculateContractComparison, type ContractComparisonResult } from "@/lib/raw-material-contract-comparison";
import type { RawMaterialContract } from "@/lib/raw-material-contracts";

export async function queryContractComparisons(supabase: SupabaseClient, params: URLSearchParams) {
  const supplierId = params.get("supplier_id");
  const materialCode = params.get("material_code");
  const requestedStatus = params.get("status");
  const year = params.get("contract_year");
  const includeZero = params.get("include_zero_remaining") === "true";
  let query = supabase.from("raw_material_contracts").select("*, supplier:suppliers(id,name)");
  if (supplierId) query = query.eq("supplier_id", supplierId);
  if (materialCode) query = query.eq("material_code", materialCode);
  query = query.eq("status", requestedStatus || "active");
  if (year && /^\d{4}$/.test(year)) query = query.eq("contract_year", Number(year));
  if (!includeZero) query = query.gt("remaining_quantity_ton", 0);
  const { data, error } = await query;
  if (error) return { data: null, error };
  const contracts = (data ?? []).map((record) => {
    const supplier = Array.isArray(record.supplier) ? record.supplier[0] : record.supplier;
    return { ...record, supplier_name: supplier?.name ?? null, supplier: undefined } as RawMaterialContract;
  });
  const codes = [...new Set(contracts.map((item) => item.material_code))];
  const [marketResult, materialResult] = await Promise.all([
    getLatestLmeMarkets(supabase, codes),
    codes.length ? supabase.from("lme_materials").select("code,name,is_active").in("code", codes) : Promise.resolve({ data: [], error: null }),
  ]);
  if (marketResult.error) return { data: null, error: marketResult.error };
  if (materialResult.error) return { data: null, error: materialResult.error };
  const materials = new Map((materialResult.data ?? []).map((item) => [item.code, item]));
  const calculatedAt = new Date().toISOString();
  let results = contracts.map((contract) => calculateContractComparison(
    contract,
    materials.get(contract.material_code) ?? { code: contract.material_code, name: null, is_active: false },
    marketResult.data?.get(contract.material_code) ?? null,
    calculatedAt
  ));
  const comparisonStatus = params.get("comparison_status");
  if (comparisonStatus) results = results.filter((item) => item.comparison_status === comparisonStatus);
  const sort = params.get("sort") || "difference_desc";
  const numeric = (value: number | null, missing: number) => value ?? missing;
  results.sort((left, right) => {
    if (sort === "difference_asc") return numeric(left.difference_rate, Infinity) - numeric(right.difference_rate, Infinity);
    if (sort === "amount_desc") return numeric(right.estimated_difference_amount_krw, -Infinity) - numeric(left.estimated_difference_amount_krw, -Infinity);
    if (sort === "remaining_desc") return right.contract.remaining_quantity_ton - left.contract.remaining_quantity_ton;
    if (sort === "end_asc") return left.contract.effective_end_date.localeCompare(right.contract.effective_end_date);
    return numeric(right.difference_rate, -Infinity) - numeric(left.difference_rate, -Infinity);
  });
  return { data: results as ContractComparisonResult[], error: null };
}
