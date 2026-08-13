import { getLmeContext } from "@/lib/lme-server";
import { parseMaterialContractAllocationInput } from "@/lib/material-contract-allocation-input";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; allocationId: string }> }) {
  const { id, allocationId } = await params;
  const { supabase, user, employee } = await getLmeContext();
  if (!user || !employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const cancel = body.action === "cancel";
  const parsed = cancel ? null : parseMaterialContractAllocationInput(body);
  if (parsed && !parsed.data) return Response.json({ error: parsed.error }, { status: 400 });
  const input = parsed?.data;
  const contextProjectId = body.contextProjectId === undefined ? null : Number(body.contextProjectId);
  const existingAllocation = await supabase.from("material_contract_allocations").select("id, usage_request_id").eq("id", allocationId).eq("contract_id", id).maybeSingle();
  if (existingAllocation.error) return Response.json({ error: existingAllocation.error.message }, { status: 500 });
  if (!existingAllocation.data) return Response.json({ error: "사용 내역을 찾을 수 없습니다." }, { status: 404 });
  if (contextProjectId !== null) {
    if (!Number.isSafeInteger(contextProjectId) || (!cancel && (input?.allocationType !== "project" || input.projectId !== contextProjectId))) return Response.json({ error: "현재 프로젝트의 사용등록만 수정할 수 있습니다." }, { status: 403 });
    const existing = await supabase.from("material_contract_allocations").select("id").eq("id", allocationId).eq("contract_id", id).eq("allocation_type", "project").eq("project_id", contextProjectId).maybeSingle();
    if (existing.error) return Response.json({ error: existing.error.message }, { status: 500 });
    if (!existing.data) return Response.json({ error: "현재 프로젝트의 사용등록을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!cancel && input && existingAllocation.data.usage_request_id) {
    const details = await supabase.rpc("update_material_usage_request_details", {
      p_usage_request_id: existingAllocation.data.usage_request_id,
      p_purchase_order_no: input.purchaseOrderNo,
      p_memo: input.memo,
    });
    if (details.error) return Response.json({ error: details.error.message }, { status: details.error.code === "42501" ? 403 : 400 });
  }
  const { data, error } = await supabase.rpc("save_material_contract_allocation", {
    p_contract_id: id, p_allocation_id: allocationId,
    p_allocation_type: input?.allocationType ?? "project", p_project_id: input?.projectId ?? null,
    p_destination_name: input?.destinationName ?? null, p_quantity_tons: input?.quantityTons ?? 1,
    p_allocation_date: input?.allocationDate ?? "2000-01-01", p_status: input?.status ?? "planned",
    p_purchase_order_no: existingAllocation.data.usage_request_id ? null : input?.purchaseOrderNo ?? null,
    p_memo: existingAllocation.data.usage_request_id ? null : input?.memo ?? null, p_cancel: cancel,
  });
  if (error) return Response.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
  return Response.json({ allocation: data });
}
