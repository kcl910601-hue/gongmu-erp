import { getLmeContext } from "@/lib/lme-server";
import { queryProjectMaterialUsages } from "@/lib/project-material-cost-server";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId: rawId } = await params; const projectId = Number(rawId);
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  if (!Number.isInteger(projectId) || projectId <= 0) return Response.json({ error: "프로젝트 ID가 올바르지 않습니다." }, { status: 400 });
  const result = await queryProjectMaterialUsages(supabase, projectId);
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  const usages = result.data ?? [];
  return Response.json({ usages, summary: { itemCount: usages.length, expectedQuantityKg: usages.reduce((sum, row) => sum + Number(row.expected_quantity_kg), 0), expectedCostKrw: usages.reduce((sum, row) => sum + Number(row.expected_cost_krw), 0), contractCount: usages.filter((row) => row.pricing_basis === "contract").length, marketCount: usages.filter((row) => row.pricing_basis === "market").length } });
}
