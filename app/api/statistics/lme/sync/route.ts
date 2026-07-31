import { getLmeContext } from "@/lib/lme-server";
import { getLmeSyncStatus, runLmeSync, type LmeSyncMode } from "@/lib/lme-sync-server";

export async function GET() {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const result = await getLmeSyncStatus(supabase);
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  return Response.json(result.data);
}

export async function POST(request: Request) {
  const { user, employee } = await getLmeContext();
  if (!user || !employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  if (process.env.LME_SYNC_ENABLED !== "true") return Response.json({ error: "LME 자동 동기화가 비활성화되어 있습니다." }, { status: 503 });
  const body = await request.json() as { mode?: unknown; startDate?: unknown };
  const mode: LmeSyncMode | null = body.mode === "initial" || body.mode === "incremental" ? body.mode : null;
  if (!mode) return Response.json({ error: "동기화 mode를 확인해주세요." }, { status: 400 });
  if (mode === "initial" && body.startDate !== undefined && body.startDate !== "2024-01-01") return Response.json({ error: "최초 동기화 시작일은 2024-01-01로 제한됩니다." }, { status: 400 });
  const result = await runLmeSync({ mode, triggerSource: "admin", userId: user.id, userName: employee.name });
  return Response.json(result, { status: result.success ? 200 : result.stoppedReason === "already_running" ? 409 : 502 });
}
