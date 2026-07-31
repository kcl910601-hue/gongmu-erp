import type { SupabaseClient } from "@supabase/supabase-js";
import type { MaterialContractAllocation } from "@/lib/material-contract-allocations";

export async function queryMaterialContractAllocations(supabase: SupabaseClient, contractId: string) {
  const { data, error } = await supabase
    .from("material_contract_allocations")
    .select("*, project:projects(id, project_code, project_name)")
    .eq("contract_id", contractId)
    .order("allocation_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { data: null, error };

  const creatorIds = [...new Set((data ?? []).map((row) => String(row.created_by)))];
  const creators = creatorIds.length > 0
    ? await supabase.from("employees").select("auth_user_id, name").in("auth_user_id", creatorIds)
    : { data: [], error: null };
  if (creators.error) return { data: null, error: creators.error };
  const names = new Map((creators.data ?? []).map((employee) => [employee.auth_user_id, employee.name]));

  return {
    data: (data ?? []).map((row) => {
      const project = Array.isArray(row.project) ? row.project[0] : row.project;
      return {
        ...row,
        project: undefined,
        project_id: row.project_id === null ? null : Number(row.project_id),
        quantity_tons: Number(row.quantity_tons),
        project_code: project?.project_code ?? null,
        project_name: project?.project_name ?? "현장 정보 없음",
        created_by_name: names.get(row.created_by) ?? null,
      } as MaterialContractAllocation;
    }),
    error: null,
  };
}
