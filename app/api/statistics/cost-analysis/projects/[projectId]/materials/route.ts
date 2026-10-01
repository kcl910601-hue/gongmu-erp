import { getLmeContext } from "@/lib/lme-server";
import { queryProjectMaterialUsages } from "@/lib/project-material-cost-server";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId: rawId } = await params; const projectId = Number(rawId);
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  if (!Number.isInteger(projectId) || projectId <= 0) return Response.json({ error: "프로젝트 ID가 올바르지 않습니다." }, { status: 400 });
  const result = await queryProjectMaterialUsages(supabase, projectId);
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  const [effective, basis] = await Promise.all([
    supabase.from("project_effective_material_costs").select("*").eq("project_id", projectId),
    supabase.from("project_material_cost_basis").select("*").eq("project_id", projectId).maybeSingle(),
  ]);
  if (effective.error || basis.error) return Response.json({ error: effective.error?.message ?? basis.error?.message }, { status: 500 });
  const usages = result.data ?? [];
  const rows = effective.data ?? [];
  return Response.json({ usages, basis: basis.data, summary: { itemCount: rows.length, expectedQuantityKg: rows.reduce((sum, row) => sum + Number(row.expected_quantity_kg), 0), expectedCostKrw: rows.reduce((sum, row) => sum + Number(row.expected_cost_krw), 0), contractCount: rows.filter((row) => row.pricing_basis === "contract").length, marketCount: rows.filter((row) => row.pricing_basis === "market").length } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId: rawId } = await params;
  const projectId = Number(rawId);
  const { supabase, employee } = await getLmeContext();
  if (employee?.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  if (!Number.isSafeInteger(projectId) || projectId <= 0) return Response.json({ error: "프로젝트 ID가 올바르지 않습니다." }, { status: 400 });
  const body: unknown = await request.json().catch(() => null);
  const basis = body && typeof body === "object" && "basis" in body ? body.basis : null;
  if (basis !== "estimate" && basis !== "allocation") return Response.json({ error: "원가 기준을 확인해주세요." }, { status: 400 });
  const { error } = await supabase.rpc("set_project_material_cost_basis", { p_project_id: projectId, p_basis: basis });
  if (error) return Response.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
  return Response.json({ success: true });
}
