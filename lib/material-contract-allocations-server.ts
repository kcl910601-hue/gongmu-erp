import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildContractAllocationSummaryMap,
  type ContractAllocationRow,
} from "@/lib/material-contract-allocations";

export async function queryContractAllocationSummaries(
  supabase: SupabaseClient,
  contracts: readonly { id: string; contract_quantity_ton: number }[],
) {
  if (contracts.length === 0) return { data: new Map(), error: null };

  const { data, error } = await supabase
    .from("material_contract_allocations")
    .select("contract_id, quantity_tons, status")
    .in("contract_id", contracts.map((contract) => contract.id));

  if (error) return { data: null, error };
  return {
    data: buildContractAllocationSummaryMap(contracts, (data ?? []) as ContractAllocationRow[]),
    error: null,
  };
}
