import { getLmeContext } from "@/lib/lme-server";

export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const projectIdValue = new URL(request.url).searchParams.get("projectId");
  const projectId = projectIdValue ? Number(projectIdValue) : null;
  if (projectIdValue && !Number.isSafeInteger(projectId)) return Response.json({ error: "프로젝트를 확인해주세요." }, { status: 400 });
  const { data, error } = await supabase.rpc("get_material_usage_requests_v2", { p_project_id: projectId });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Array<Record<string, unknown> & { project_id: number | null }>;
  const projectIds = [...new Set(rows.flatMap(row => row.project_id === null ? [] : [row.project_id]))];
  const { data: projects, error: projectError } = projectIds.length > 0
    ? await supabase.from("projects").select("id,project_code,project_name").in("id", projectIds)
    : { data: [], error: null };
  if (projectError) return Response.json({ error: projectError.message }, { status: 500 });
  const projectMap = new Map((projects ?? []).map(project => [project.id, project]));
  return Response.json({ requests: rows.map(row => ({ ...row, project_code: row.project_id === null ? null : projectMap.get(row.project_id)?.project_code ?? null, project_name: row.project_id === null ? null : projectMap.get(row.project_id)?.project_name ?? null })), canManage: employee.role === "admin" });
}

export async function POST(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  if (typeof body.usageRequestId !== "string" || typeof body.contractId !== "string") return Response.json({ error: "사용요청과 계약을 확인해주세요." }, { status: 400 });
  const quantity = Number(body.quantityTons); const expected = body.expectedAvailableTons === undefined ? null : Number(body.expectedAvailableTons);
  const status = body.status === "confirmed" ? "confirmed" : "planned";
  if (!Number.isFinite(quantity) || quantity <= 0 || (expected !== null && !Number.isFinite(expected))) return Response.json({ error: "배정량을 확인해주세요." }, { status: 400 });
  const { data, error } = await supabase.rpc("allocate_material_usage_request", { p_usage_request_id: body.usageRequestId, p_contract_id: body.contractId, p_quantity_tons: quantity, p_status: status, p_expected_available: expected });
  if (error) return Response.json({ error: error.message }, { status: error.code === "42501" ? 403 : error.code === "40001" ? 409 : 400 });
  return Response.json({ allocation: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  if (typeof body.usageRequestId !== "string") return Response.json({ error: "사용요청을 확인해주세요." }, { status: 400 });
  const quantity = Number(body.quantityTons);
  const usageDate = typeof body.usageDate === "string" ? body.usageDate : "";
  const purchaseOrderNo = typeof body.purchaseOrderNo === "string" ? body.purchaseOrderNo : null;
  const memo = typeof body.memo === "string" ? body.memo : null;
  if (!Number.isFinite(quantity) || quantity <= 0 || Math.round(quantity * 10_000) !== quantity * 10_000 || !/^\d{4}-\d{2}-\d{2}$/.test(usageDate)) return Response.json({ error: "사용요청 입력값을 확인해주세요." }, { status: 400 });
  const { data, error } = await supabase.rpc("update_material_usage_request", { p_usage_request_id: body.usageRequestId, p_quantity_tons: quantity, p_purchase_order_no: purchaseOrderNo, p_usage_date: usageDate, p_memo: memo });
  if (error) return Response.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
  if (body.materialUsageGroupId === null || typeof body.materialUsageGroupId === "string") { const groupResult = await supabase.rpc("set_material_usage_request_group", { p_usage_request_id: body.usageRequestId, p_group_id: body.materialUsageGroupId }); if (groupResult.error) return Response.json({ error: groupResult.error.message }, { status: groupResult.error.code === "42501" ? 403 : 400 }); }
  return Response.json({ request: data });
}
