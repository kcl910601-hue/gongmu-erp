import { getLatestLmeMarket } from "@/lib/lme-market-server";
import { getLmeContext } from "@/lib/lme-server";

export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const material = new URL(request.url).searchParams.get("material") || "AL";
  const { data, error } = await getLatestLmeMarket(supabase, material);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ latest: data });
}
