import { getLmeContext } from "@/lib/lme-server";
import type { MaterialAllocationAuditEntry } from "@/lib/material-allocation-audit";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; allocationId: string }> }) {
  const { id, allocationId } = await params;
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });

  const allocation = await supabase.from("material_contract_allocations").select("id").eq("id", allocationId).eq("contract_id", id).maybeSingle();
  if (allocation.error) return Response.json({ error: allocation.error.message }, { status: 500 });
  if (!allocation.data) return Response.json({ error: "원자재 사용 이력을 찾을 수 없습니다." }, { status: 404 });

  const result = await supabase.from("activity_logs")
    .select("id,activity_type,title,employee_name,created_at,metadata")
    .eq("target_type", "material_contract_allocation")
    .eq("metadata->>allocation_id", allocationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(500);
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  return Response.json({ activities: (result.data ?? []) as MaterialAllocationAuditEntry[] });
}
