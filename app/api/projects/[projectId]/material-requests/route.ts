import { getLmeContext } from "@/lib/lme-server";

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { supabase, employee } = await getLmeContext();
  if (!employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const { projectId: value } = await context.params;
  const projectId = Number(value);
  const body = await request.json() as Record<string, unknown>;
  const quantityKg = Number(body.quantityKg);
  const usageDate = typeof body.usageDate === "string" ? body.usageDate : "";
  if (!Number.isSafeInteger(projectId) || !Number.isFinite(quantityKg) || quantityKg <= 0 || Math.round(quantityKg * 10) !== quantityKg * 10 || !/^\d{4}-\d{2}-\d{2}$/.test(usageDate)) {
    return Response.json({ error: "발주 입력값을 확인해주세요." }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("create_unallocated_project_material_usage_request", {
    p_project_id: projectId,
    p_material_code: "AL",
    p_quantity_tons: quantityKg / 1_000,
    p_usage_date: usageDate,
    p_purchase_order_no: typeof body.purchaseOrderNo === "string" ? body.purchaseOrderNo : null,
    p_memo: typeof body.memo === "string" ? body.memo : null,
    p_material_usage_group_id: typeof body.materialUsageGroupId === "string" ? body.materialUsageGroupId : null,
  });
  if (error) return Response.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
  return Response.json({ request: data }, { status: 201 });
}
