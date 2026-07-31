import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatNumber } from "@/lib/lme";
import type { MarketSummary } from "@/lib/lme-market";
import type { ExchangeQuote } from "@/hooks/useLmeMarket";

export function MarketKpiCards({ summary, exchangeQuote }: { summary: MarketSummary | null; exchangeQuote?: ExchangeQuote | null }) {
  const latest = summary?.latest; const previous = summary?.previous;
  const difference = latest?.domestic_lme_krw_per_kg !== null && latest?.domestic_lme_krw_per_kg !== undefined && previous?.domestic_lme_krw_per_kg !== null && previous?.domestic_lme_krw_per_kg !== undefined ? latest.domestic_lme_krw_per_kg - previous.domestic_lme_krw_per_kg : null;
  const rate = difference !== null && previous?.domestic_lme_krw_per_kg ? difference / previous.domestic_lme_krw_per_kg * 100 : null;
  const cards = [
    ["최신 LME AL", latest ? formatNumber(latest.lme_al_usd_per_ton, 1) : "-", "USD/ton", latest?.reference_date ?? "데이터 없음"],
    ["최신 환율", exchangeQuote?.rate ? formatNumber(exchangeQuote.rate, 1) : "-", "KRW/USD", exchangeQuote?.referenceDate ?? "환율 미수집"],
    ["최신 국내환산 LME", exchangeQuote?.domesticLmeKrwPerKg ? formatNumber(exchangeQuote.domesticLmeKrwPerKg) : "-", "원/kg", exchangeQuote?.referenceDate ? `환율 ${exchangeQuote.referenceDate} 기준` : "환율 미수집"],
    ["전회 대비", difference === null ? "-" : `${difference >= 0 ? "+" : ""}${formatNumber(difference)}`, "원/kg", rate === null ? "비교 데이터 없음" : `${rate >= 0 ? "+" : ""}${formatNumber(rate, 2)}%`],
    ...([1, 3, 6] as const).map((months) => { const average = summary?.averages.find((item) => item.months === months); return [`최근 ${months}개월 평균`, average?.value === null || average?.value === undefined ? "-" : formatNumber(average.value), "원/kg", average ? `${average.sampleCount}건 기준` : "데이터 없음"]; }),
  ];
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, unit, detail], index) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1.5 truncate text-xl font-bold text-slate-950">{value} <span className="text-xs font-medium text-slate-400">{unit}</span></p><p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">{index === 3 && rate !== null ? rate > 0 ? <ArrowUp size={12} className="text-red-500"/> : rate < 0 ? <ArrowDown size={12} className="text-blue-500"/> : <Minus size={12}/> : null}{detail}</p></div>)}</div>;
}
