import { getLmeContext } from "@/lib/lme-server";
import { buildUsageSnapshot, parseUsageInput } from "@/lib/project-material-cost-server";

export async function POST(request: Request) {
  const { supabase, user, employee } = await getLmeContext();
  if (!user || !employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>; const projectId = Number(body.projectId); const materialCode = typeof body.materialCode === "string" ? body.materialCode.toUpperCase() : ""; const parsed = parseUsageInput(body);
  if (!Number.isInteger(projectId) || projectId <= 0 || !materialCode || !parsed.data) return Response.json({ error: parsed.error ?? "프로젝트와 Material을 확인해주세요." }, { status: 400 });
  const [{ data: project }, { data: material }] = await Promise.all([supabase.from("projects").select("id").eq("id", projectId).maybeSingle(), supabase.from("lme_materials").select("code").eq("code", materialCode).eq("is_active", true).maybeSingle()]);
  if (!project || !material) return Response.json({ error: "프로젝트 또는 활성 Material을 찾을 수 없습니다." }, { status: 400 });
  const snapshot = await buildUsageSnapshot(supabase, materialCode, parsed.data); if (!snapshot.data) return Response.json({ error: snapshot.error }, { status: 400 });
  const { data, error } = await supabase.from("project_material_usages").insert({ project_id: projectId, material_code: materialCode, ...snapshot.data, created_by: user.id }).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ usage: data }, { status: 201 });
}
