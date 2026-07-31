import { runLmeSync } from "@/lib/lme-sync-server";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) return Response.json({ error: "Cron 인증에 실패했습니다." }, { status: 401 });
  if (process.env.LME_SYNC_ENABLED !== "true") return Response.json({ error: "LME 자동 동기화가 비활성화되어 있습니다." }, { status: 503 });
  const result = await runLmeSync({ mode: "incremental", triggerSource: "cron", userId: null, userName: "Vercel Cron" });
  return Response.json(result, { status: result.success ? 200 : result.stoppedReason === "already_running" ? 409 : 502 });
}
