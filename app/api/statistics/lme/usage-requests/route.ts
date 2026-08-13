import { getLmeContext } from "@/lib/lme-server";

export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const projectIdValue = new URL(request.url).searchParams.get("projectId");
  const projectId = projectIdValue ? Number(projectIdValue) : null;
  if (projectIdValue && !Number.isSafeInteger(projectId)) return Response.json({ error: "프로젝트를 확인해주세요." }, { status: 400 });
  const { data, error } = await supabase.rpc("get_material_usage_requests", { p_project_id: projectId });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ requests: data ?? [], canManage: employee.role === "admin" });
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
