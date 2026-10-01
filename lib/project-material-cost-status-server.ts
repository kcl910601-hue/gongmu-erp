import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectMaterialCostStatus } from "@/lib/project-material-cost-status";

// Read the same request-level remainder used by LME. Excess on one request
// must not cancel out an unallocated quantity on a different request.
export async function queryProjectMaterialCostStatuses(supabase: SupabaseClient, projectIds: number[]) {
  const statuses = new Map<number, ProjectMaterialCostStatus>();
  for (const id of projectIds) statuses.set(id, { basis: "estimate", unallocatedKg: 0 });
  if (!projectIds.length) return { data: statuses, error: null };
  const basis = await supabase.from("project_material_cost_basis").select("project_id,basis").in("project_id", projectIds);
  if (basis.error) return { data: statuses, error: basis.error };
  for (const row of basis.data ?? []) {
    const status = statuses.get(Number(row.project_id));
    if (status) status.basis = row.basis === "allocation" ? "allocation" : "estimate";
  }
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const requests = await supabase.rpc("get_material_usage_requests_v2", { p_project_id: null })
      .in("project_id", projectIds).eq("material_code", "AL").eq("status", "active")
      .order("id").range(offset, offset + pageSize - 1);
    if (requests.error) return { data: statuses, error: requests.error };
    const rows = (requests.data ?? []) as { project_id: number; unallocated_tons: number | string }[];
    for (const row of rows) {
      const status = statuses.get(Number(row.project_id));
      if (status) status.unallocatedKg += Math.max(Number(row.unallocated_tons), 0) * 1000;
    }
    if (rows.length < pageSize) break;
  }
  for (const status of statuses.values()) status.unallocatedKg = Math.round(status.unallocatedKg * 10) / 10;
  return { data: statuses, error: null };
}
