import { calculateDomesticLme, isValidHttpUrl, LME_MARKET_SOURCE_URL } from "@/lib/lme-market";
import { getMarketDataset } from "@/lib/lme-market-server";
import { getLmeContext } from "@/lib/lme-server";

export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const result = await getMarketDataset(supabase, new URL(request.url).searchParams);
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  return Response.json(result.data);
}

export async function POST(request: Request) {
  const { supabase, user, employee } = await getLmeContext();
  if (!user || !employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const referenceDate = typeof body.referenceDate === "string" ? body.referenceDate : ""; const round = Number(body.round); const materialCode = typeof body.materialCode === "string" ? body.materialCode.toUpperCase() : "AL";
  const lme = Number(body.lmeAlUsdPerTon); const exchange = Number(body.exchangeRateKrwPerUsd); const sourceUrl = typeof body.sourceUrl === "string" && body.sourceUrl.trim() ? body.sourceUrl.trim() : LME_MARKET_SOURCE_URL;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) || (round !== 1 && round !== 2)) return Response.json({ error: "실제 기준일과 회차를 확인해주세요." }, { status: 400 });
  if (!Number.isFinite(lme) || lme <= 0 || !Number.isFinite(exchange) || exchange <= 0) return Response.json({ error: "LME와 환율은 0보다 큰 유한한 숫자여야 합니다." }, { status: 400 });
  if (!isValidHttpUrl(sourceUrl)) return Response.json({ error: "출처 URL은 유효한 http 또는 https 주소여야 합니다." }, { status: 400 });
  const memo = typeof body.memo === "string" ? body.memo.trim() : ""; if (memo.length > 2000) return Response.json({ error: "메모는 2,000자 이하여야 합니다." }, { status: 400 });
  const { data: material } = await supabase.from("lme_materials").select("code").eq("code", materialCode).eq("is_active", true).maybeSingle(); if (!material) return Response.json({ error: "존재하지 않거나 비활성인 Material입니다." }, { status: 400 });
  const payload = { reference_date: referenceDate, reference_month: `${referenceDate.slice(0, 7)}-01`, round, material_code: materialCode, lme_al_usd_per_ton: lme, exchange_rate_krw_per_usd: exchange, domestic_lme_krw_per_kg: calculateDomesticLme(lme, exchange), source_url: sourceUrl, memo: memo || null, created_by: user.id, created_by_name: employee.name };
  const { data, error } = await supabase.from("lme_market_prices").insert(payload).select("*").single();
  if (error) return Response.json({ error: error.code === "23505" ? "같은 월·회차·Material 자료가 이미 있습니다." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return Response.json({ record: data }, { status: 201 });
}
