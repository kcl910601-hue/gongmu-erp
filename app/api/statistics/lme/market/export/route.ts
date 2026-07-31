import { getMarketDataset } from "@/lib/lme-market-server";
import { getLmeContext } from "@/lib/lme-server";

function csvValue(value: unknown) { let text = String(value ?? ""); if (/^[=+\-@]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; }
export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext(); if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const result = await getMarketDataset(supabase, new URL(request.url).searchParams); if (result.error || !result.data) return Response.json({ error: result.error?.message ?? "조회하지 못했습니다." }, { status: 500 });
  const headers = ["기준월","회차","실제 기준일","Material","LME AL (USD/ton)","환율 (KRW/USD)","국내환산 LME (KRW/kg)","출처","메모","등록자","등록일"];
  const rows = result.data.records.map((record) => [record.reference_month.slice(0,7),record.round,record.reference_date,record.material_code,record.lme_al_usd_per_ton,record.exchange_rate_krw_per_usd,record.domestic_lme_krw_per_kg,record.source_url,record.memo,record.created_by_name,record.created_at]);
  const csv = `\uFEFF${[headers,...rows].map((row)=>row.map(csvValue).join(",")).join("\r\n")}`;
  return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="lme_market_history_${new Date().toISOString().slice(0,10)}.csv"`}});
}
