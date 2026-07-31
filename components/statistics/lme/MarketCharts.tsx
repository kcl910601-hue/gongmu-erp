import { formatNumber } from "@/lib/lme";
import type { LmeMarketPrice } from "@/lib/lme-market";

const series = [
  { key: "lme_al_usd_per_ton" as const, title: "LME AL 추이", unit: "USD/ton", color: "#2563eb" },
  { key: "exchange_rate_krw_per_usd" as const, title: "환율 추이", unit: "KRW/USD", color: "#7c3aed" },
  { key: "domestic_lme_krw_per_kg" as const, title: "국내환산 LME 추이", unit: "원/kg", color: "#059669" },
];

export function MarketCharts({ records }: { records: LmeMarketPrice[] }) {
  const ordered = [...records].sort((a, b) => a.reference_date.localeCompare(b.reference_date));
  return <div className="grid gap-3 xl:grid-cols-3">{series.map((item) => { const plotted = ordered.flatMap((record) => record[item.key] === null ? [] : [{ record, value: record[item.key] as number }]); const values = plotted.map((entry) => entry.value); const min = values.length ? Math.min(...values) : 0; const max = values.length ? Math.max(...values) : 1; const range = max - min || 1; const x = (index: number) => plotted.length <= 1 ? 260 : 35 + index * 450 / (plotted.length - 1); const y = (value: number) => 170 - (value - min) / range * 120; const points = plotted.map((entry, index) => `${x(index)},${y(entry.value)}`).join(" "); return <section key={item.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-sm font-semibold">{item.title}</h2>{plotted.length === 0 ? <div className="flex h-52 items-center justify-center text-sm text-slate-400">데이터 없음</div> : <div className="mt-3 overflow-x-auto"><svg viewBox="0 0 520 210" className="min-w-[480px]" role="img" aria-label={item.title}>{[0,1,2,3].map((line) => <line key={line} x1="35" x2="485" y1={50 + line * 40} y2={50 + line * 40} stroke="#e2e8f0"/>)}{plotted.length > 1 && <polyline points={points} fill="none" stroke={item.color} strokeWidth="2.5"/>}{plotted.map((entry, index) => <circle key={entry.record.id} cx={x(index)} cy={y(entry.value)} r="4" fill={item.color}><title>{entry.record.reference_date} · {formatNumber(entry.value,1)} {item.unit}</title></circle>)}<text x="35" y="200" fontSize="10" fill="#64748b">{plotted[0]?.record.reference_date}</text><text x="485" y="200" textAnchor="end" fontSize="10" fill="#64748b">{plotted.at(-1)?.record.reference_date}</text><text x="35" y="20" fontSize="10" fill="#64748b">{formatNumber(max, 1)} {item.unit}</text></svg></div>}</section>; })}</div>;
}
