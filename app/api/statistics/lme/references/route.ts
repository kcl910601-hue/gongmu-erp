import { getLmeContext } from "@/lib/lme-server";
import { getNearestPreviousLmeMarket } from "@/lib/lme-market-server";

export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const targetDate = new URL(request.url).searchParams.get("date");
  if (targetDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return Response.json({ error: "기준일 형식을 확인해주세요." }, { status: 400 });
    const nearest = await getNearestPreviousLmeMarket(supabase, targetDate);
    if (nearest.error) return Response.json({ error: nearest.error.message }, { status: 500 });
    if (!nearest.data) return Response.json({ error: "기준일 이전의 LME 시세가 없습니다." }, { status: 404 });
    return Response.json({ reference: nearest.data });
  }
  const { data, error } = await supabase
    .from("lme_market_prices")
    .select("id, reference_month, reference_date, round, material_code, lme_al_usd_per_ton, exchange_rate_krw_per_usd, domestic_lme_krw_per_kg, source_url")
    .gte("reference_month", "2024-01-01")
    .order("reference_month", { ascending: false })
    .order("round", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ references: data ?? [] });
}

export async function POST() {
  const { employee } = await getLmeContext();
  if (!employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  return Response.json({ error: "검증된 실제 LME 단가 원본이 없어 초기화를 중단했습니다. 출처가 포함된 CSV를 먼저 Import해주세요." }, { status: 409 });
}
