import { getLmeContext } from "@/lib/lme-server";

export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const params = new URL(request.url).searchParams; const materialCode = params.get("material_code")?.toUpperCase() ?? ""; const date = params.get("cost_reference_date") ?? "";
  if (!materialCode || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Material과 원가 기준일이 필요합니다." }, { status: 400 });
  const { data, error } = await supabase.from("lme_market_prices").select("id, material_code, reference_date, round, domestic_lme_krw_per_kg, lme_al_usd_per_ton, exchange_rate_krw_per_usd, created_at").eq("material_code", materialCode).lte("reference_date", date).order("reference_date", { ascending: false }).order("round", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ market: null, calculation_available: false, reason: "원가 기준일 이전의 Market 시세가 없습니다." });
  return Response.json({ market: data, calculation_available: true, reason: null });
}
