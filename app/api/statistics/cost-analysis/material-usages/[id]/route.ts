import { getLmeContext } from "@/lib/lme-server";
import { buildUsageSnapshot, parseUsageInput } from "@/lib/project-material-cost-server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { supabase, user, employee } = await getLmeContext();
  if (!user || !employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>; const parsed = parseUsageInput(body); if (!parsed.data) return Response.json({ error: parsed.error }, { status: 400 });
  const { data: current, error: currentError } = await supabase.from("project_material_usages").select("id, material_code").eq("id", id).maybeSingle();
  if (currentError) return Response.json({ error: currentError.message }, { status: 500 }); if (!current) return Response.json({ error: "원자재 원가 항목을 찾을 수 없습니다." }, { status: 404 });
  const snapshot = await buildUsageSnapshot(supabase, current.material_code, parsed.data); if (!snapshot.data) return Response.json({ error: snapshot.error }, { status: 400 });
  const { data, error } = await supabase.from("project_material_usages").update({ ...snapshot.data, updated_by: user.id }).eq("id", id).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ usage: data });
}
