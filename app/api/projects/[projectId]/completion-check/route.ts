import { logActivityWithClient } from "@/lib/activity";
import { getLmeContext } from "@/lib/lme-server";
import { hasPermission, isCalendarOnlyStaff } from "@/lib/permissions";
import { getProjectCompletionCheck } from "@/lib/project-completion-server";
import { decideProjectCompletion, getProjectCompletionSummary } from "@/lib/project-completion";

async function getContext(params: Promise<{ projectId: string }>) {
  const { projectId: raw } = await params;
  const projectId = Number(raw);
  const auth = await getLmeContext();
  if (!auth.employee) return { response: Response.json({ error: "로그인이 필요합니다." }, { status: 401 }) } as const;
  if (isCalendarOnlyStaff(auth.employee)) return { response: Response.json({ error: "프로젝트에 접근할 권한이 없습니다." }, { status: 403 }) } as const;
  if (!Number.isSafeInteger(projectId) || projectId <= 0) return { response: Response.json({ error: "프로젝트 ID가 올바르지 않습니다." }, { status: 400 }) } as const;
  return { ...auth, projectId } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const current = await getContext(params); if ("response" in current) return current.response;
  const result = await getProjectCompletionCheck(current.supabase, current.projectId);
  if (result.error) return Response.json({ error: result.error }, { status: 500 });
  if (result.notFound) return Response.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ completionCheck: result.data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const current = await getContext(params); if ("response" in current) return current.response;
  const employee = current.employee;
  if (!employee) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!hasPermission(employee.role, "project_update")) return Response.json({ error: "프로젝트 상태를 변경할 권한이 없습니다." }, { status: 403 });
  let body: { status?: unknown; completionAcknowledged?: unknown; completionFingerprint?: unknown };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 }); }
  if (body.status !== "completed") return Response.json({ error: "프로젝트 완료 처리 전용 API입니다." }, { status: 400 });
  const result = await getProjectCompletionCheck(current.supabase, current.projectId);
  if (result.error) return Response.json({ error: result.error }, { status: 500 });
  if (result.notFound || !result.data) return Response.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  const decision = decideProjectCompletion(result.data, body.completionAcknowledged === true, typeof body.completionFingerprint === "string" ? body.completionFingerprint : null);
  if (decision === "changed") return Response.json({ code: "PROJECT_COMPLETION_CHECK_CHANGED", error: "점검 결과가 변경되었습니다. 최신 결과를 다시 확인해 주세요.", completionCheck: result.data }, { status: 409 });
  if (decision === "acknowledgement_required") return Response.json({ code: "PROJECT_COMPLETION_WARNINGS", error: "완료 전 확인이 필요한 항목이 있습니다.", completionCheck: result.data }, { status: 409 });
  const update = await current.supabase.from("projects").update({ status: "completed" }).eq("id", current.projectId).neq("status", "completed").select("id").maybeSingle();
  if (update.error) return Response.json({ error: update.error.message }, { status: 500 });
  if (update.data) await logActivityWithClient(current.supabase, { type: "project_update", title: "프로젝트 상태 변경", description: `${result.data.projectName} 상태를 완료로 변경했습니다.`, projectId: current.projectId, targetType: "project", targetId: current.projectId, employeeId: employee.id, employeeName: employee.name, employeeEmail: employee.email, metadata: { before: null, after: "completed", completion_check_summary: getProjectCompletionSummary(result.data) } });
  return Response.json({ completed: true, completionCheck: result.data });
}
