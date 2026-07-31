import { getWeeklyLmeComparison } from "@/lib/lme-market-server";
import { getLmeContext } from "@/lib/lme-server";

export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const material = new URL(request.url).searchParams.get("material") || "AL";
  const result = await getWeeklyLmeComparison(supabase, material);
  if (result.error || !result.data) return Response.json({ error: result.error?.message ?? "LME 주간 비교를 계산하지 못했습니다." }, { status: 500 });
  return Response.json(result.data);
}
