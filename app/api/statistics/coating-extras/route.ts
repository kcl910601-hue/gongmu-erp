import { getLmeContext } from "@/lib/lme-server";
import { isCalendarOnlyStaff } from "@/lib/permissions";

function failure(error: { code?: string; message: string }) {
  const missing = ["42P01", "PGRST202", "PGRST205"].includes(error.code ?? "");
  return Response.json({ error: missing ? "압출 외 도장 항목의 DB 준비가 필요합니다. 기존 도장 배정은 계속 사용할 수 있습니다." : error.message }, { status: missing ? 503 : error.code === "40001" ? 409 : error.code === "42501" ? 403 : 400 });
}
export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee || isCalendarOnlyStaff(employee)) return Response.json({ error: "조회 권한이 없습니다." }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("projectId"));
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "프로젝트를 확인해주세요." }, { status: 400 });
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await supabase.from("coating_extra_items").select("*").eq("project_id", id).order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
    if (result.error) return failure(result.error);
    rows.push(...result.data);
    if (result.data.length < 1000) break;
  }
  return Response.json({ rows });
}
export async function POST(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee || employee.role !== "admin" || isCalendarOnlyStaff(employee)) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const projectId = Number(body.projectId);
    if (!Number.isSafeInteger(projectId) || projectId <= 0 || typeof body.id !== "string" || !Number.isInteger(body.version)) return Response.json({ error: "항목 정보를 확인해주세요." }, { status: 400 });
    const result = await supabase.rpc("save_coating_extra_item", { p_id: body.id, p_project_id: projectId, p_version: body.version, p_values: body, p_cancel: body.action === "cancel" });
    if (result.error) return failure(result.error);
    return Response.json({ item: result.data });
  } catch { return Response.json({ error: "입력값을 확인해주세요." }, { status: 400 }); }
}
