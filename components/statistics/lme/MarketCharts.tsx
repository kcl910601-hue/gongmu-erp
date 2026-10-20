"use client";
import { useRef, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { createMarketChartImage } from "./market-chart-image";
import { MarketComparisonEditor } from "./MarketComparisonEditor";
import { initialMarketComparison, isMarketComparisonValid } from "@/lib/lme-market-comparison";
import type { MarketFilters } from "@/hooks/useLmeMarket";
import { formatNumber } from "@/lib/lme";
import { LME_MARKET_SOURCE_URL, type LmeMarketPrice } from "@/lib/lme-market";

const series = [
  { key: "lme_al_usd_per_ton" as const, title: "LME AL 추이", unit: "USD/ton", color: "#2563eb" },
  { key: "exchange_rate_krw_per_usd" as const, title: "환율 추이", unit: "KRW/USD", color: "#7c3aed" },
  { key: "domestic_lme_krw_per_kg" as const, title: "국내환산 LME 추이", unit: "원/kg", color: "#059669" },
];

export function MarketCharts({ records, filters }: { records: LmeMarketPrice[]; filters: MarketFilters }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [copying, setCopying] = useState(false);
  const [includeComparison, setIncludeComparison] = useState(false);
  const [comparison, setComparison] = useState(initialMarketComparison);
  const activeSnapshot = includeComparison ? comparison.chartSnapshot : undefined;
  const chartRecords = activeSnapshot?.records ?? records;
  const sources = activeSnapshot?.sources ?? [
    "*환율기준 출처: 한국은행 ECOS (https://ecos.bok.or.kr/) · 원/미국달러 매매기준율 · 기준일 당일 또는 직전 등록 환율 사용 (일치 자료가 없으면 시세에 저장된 환율 사용)",
    `*LME 기준 출처: 한국비철금속협회 (${LME_MARKET_SOURCE_URL})`,
  ];
  async function copyChart() {
    if (!chartRef.current || copying || chartRecords.length === 0) return;
    if (includeComparison && !isMarketComparisonValid(comparison)) {
      toast.error("계약 비교표의 입력값을 확인해주세요.");
      return;
    }
    if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      toast.error("이미지 복사를 지원하는 브라우저의 HTTPS 환경에서 이용해주세요.");
      return;
    }
    setCopying(true);
    try {
      // Start the write during the click to preserve browser user activation.
      const png = createMarketChartImage(chartRef.current, sources, includeComparison ? comparison : undefined);
      void png.catch(() => undefined);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      toast.success("차트 이미지를 복사했습니다. Ctrl+V로 붙여넣으세요.");
    } catch {
      toast.error("이미지 복사에 실패했습니다. 브라우저의 클립보드 권한을 확인하고 다시 시도해주세요.");
    } finally {
      setCopying(false);
    }
  }
  async function downloadChart() {
    if (!chartRef.current || copying || chartRecords.length === 0 || (includeComparison && !isMarketComparisonValid(comparison))) return;
    setCopying(true);
    try {
      const blob = await createMarketChartImage(chartRef.current, sources, includeComparison ? comparison : undefined);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `LME-${includeComparison ? comparison.writtenDate : new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("이미지 다운로드에 실패했습니다. 다시 시도해주세요.");
    } finally { setCopying(false); }
  }
  const periodLabel = activeSnapshot?.periodLabel ?? ([
    filters.year ? `${filters.year}년` : "",
    filters.month ? `${filters.month.replace("-", "년 ")}월` : "",
    filters.startDate || filters.endDate ? `${filters.startDate || "시작일 전체"} ~ ${filters.endDate || "현재"}` : "",
  ].filter(Boolean).join(" · ") || { "1m": "1개월", "3m": "3개월", "6m": "6개월", "1y": "1년", all: "전체 기간" }[filters.period]);
  const chartSnapshot = { periodLabel, sources, records: chartRecords.map(({ id, reference_date, lme_al_usd_per_ton, exchange_rate_krw_per_usd, domestic_lme_krw_per_kg }) => ({ id, reference_date, lme_al_usd_per_ton, exchange_rate_krw_per_usd, domestic_lme_krw_per_kg })) };
  const ordered = [...chartRecords].sort((a, b) => a.reference_date.localeCompare(b.reference_date));
  return <div className="space-y-3"><div className="flex flex-wrap items-center justify-end gap-3"><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={includeComparison} onChange={(event) => setIncludeComparison(event.target.checked)}/>계약 단가 비교표 포함</label><Button variant="outline" disabled={copying || chartRecords.length === 0 || (includeComparison && !isMarketComparisonValid(comparison))} onClick={() => void copyChart()}><Copy size={15}/>{copying ? "이미지 복사 중..." : includeComparison ? "차트 + 비교표 클립보드 복사" : "차트 클립보드 복사"}</Button><Button variant="outline" disabled={copying || chartRecords.length === 0 || (includeComparison && !isMarketComparisonValid(comparison))} onClick={() => void downloadChart()}>PNG 다운로드</Button></div>{activeSnapshot && <div className="flex items-center gap-2 text-sm text-blue-800">저장 당시 차트를 보고 있습니다.<Button variant="ghost" onClick={() => setComparison({ ...comparison, chartSnapshot: undefined })}>현재 조회 차트로 변경</Button></div>}{includeComparison && <MarketComparisonEditor draft={comparison} onChange={setComparison} chartSnapshot={chartSnapshot}/>}<div ref={chartRef} className="grid gap-3 xl:grid-cols-3">{series.map((item) => { const plotted = ordered.flatMap((record) => record[item.key] === null ? [] : [{ record, value: record[item.key] as number }]); const values = plotted.map((entry) => entry.value); const min = values.length ? Math.min(...values) : 0; const max = values.length ? Math.max(...values) : 1; const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; const latest = plotted.at(-1); const highest = plotted.find(entry => entry.value === max); const lowest = plotted.find(entry => entry.value === min); const range = max - min || 1; const x = (index: number) => plotted.length <= 1 ? 260 : 35 + index * 450 / (plotted.length - 1); const y = (value: number) => 170 - (value - min) / range * 120; const points = plotted.map((entry, index) => `${x(index)},${y(entry.value)}`).join(" "); return <section key={item.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-sm font-semibold">{item.title} <span className="text-xs font-normal text-slate-500">{`<${periodLabel} 기준>`}</span></h2><p className="mt-1 text-xs text-slate-500">단위: {item.unit} · 평균은 등록 시세의 산술평균</p>{plotted.length > 0 && <dl className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">{[{label:"최고가",value:max,date:highest?.record.reference_date},{label:"최저가",value:min,date:lowest?.record.reference_date},{label:"평균가",value:average,date:undefined},{label:"최근가",value:latest?.value ?? 0,date:latest?.record.reference_date}].map(stat=><div key={stat.label} className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5"><dt className="text-xs text-slate-500">{stat.label}</dt><dd className="mt-1 text-sm font-bold tabular-nums">{formatNumber(stat.value,1)}</dd>{stat.date&&<p className="mt-1 text-[10px] text-slate-500">{stat.date}</p>}</div>)}</dl>}{plotted.length === 0 ? <div className="flex h-52 items-center justify-center text-sm text-slate-400">데이터 없음</div> : <div className="mt-3 overflow-x-auto"><svg viewBox="0 0 520 210" className="min-w-[480px]" role="img" aria-label={item.title}>{[0,1,2,3].map((line) => <line key={line} x1="35" x2="485" y1={50 + line * 40} y2={50 + line * 40} stroke="#e2e8f0"/>)}<line x1="35" x2="485" y1={y(average)} y2={y(average)} stroke="#94a3b8" strokeDasharray="5 4"><title>평균가 {formatNumber(average,1)} {item.unit}</title></line>{plotted.length > 1 && <polyline points={points} fill="none" stroke={item.color} strokeWidth="2.5"/>}{plotted.map((entry, index) => <circle key={entry.record.id} cx={x(index)} cy={y(entry.value)} r="4" fill={item.color}><title>{entry.record.reference_date} · {formatNumber(entry.value,1)} {item.unit}</title></circle>)}<text x="35" y="200" fontSize="10" fill="#64748b">{plotted[0]?.record.reference_date}</text><text x="485" y="200" textAnchor="end" fontSize="10" fill="#64748b">{plotted.at(-1)?.record.reference_date}</text><text x="35" y="20" fontSize="10" fill="#64748b">{formatNumber(max, 1)} {item.unit}</text></svg></div>}</section>; })}</div><div className="space-y-1 text-xs text-slate-500">{sources.map((source) => <p key={source} className="break-words">{source}</p>)}</div></div>;
}
