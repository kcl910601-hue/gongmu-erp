import Link from "next/link";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { WeeklyLmeComparison } from "@/lib/market-data/weekly-lme";

function won(value: number) { return `₩${Math.round(Math.abs(value)).toLocaleString("ko-KR")}/kg`; }

export function WeeklyLmeCard({ comparison }: { comparison: WeeklyLmeComparison | null }) {
  const current = comparison?.currentWeekAverage ?? null;
  const previous = comparison?.previousWeekAverage ?? null;
  const difference = comparison?.differenceAmount ?? null;
  const rate = comparison?.differenceRate ?? null;
  const direction = difference === null || difference === 0 ? "same" : difference > 0 ? "up" : "down";
  const Icon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : Minus;
  const color = direction === "up" ? "text-red-600" : direction === "down" ? "text-blue-600" : "text-slate-500";

  return <Link href="/statistics/lme" className="group kpi-enter relative h-24 rounded-2xl border border-slate-300 bg-white p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md">
    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-medium text-slate-500">LME 주간 비교</p>{current === null ? <p className="mt-2 text-sm font-bold text-slate-500">이번주 데이터 없음</p> : <p className="mt-0.5 text-xl font-bold tracking-tight text-slate-950">{won(current)}</p>}</div><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 ${color}`}><Icon size={17}/></div></div>
    {current !== null && previous === null ? <p className="mt-1 text-[11px] font-semibold text-slate-400">지난주 비교 데이터 없음 · 이번주 {comparison?.currentWeekSampleCount ?? 0}일 기준</p> : current !== null && previous !== null && difference !== null ? <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px]"><span className={`font-bold ${color}`}>{direction === "up" ? "▲" : direction === "down" ? "▼" : "—"} {Math.abs(rate ?? 0).toFixed(1)}% · {difference > 0 ? "+" : difference < 0 ? "-" : ""}{won(difference)}</span><span className="shrink-0 text-slate-400">지난주 {won(previous)} · {comparison?.currentWeekSampleCount ?? 0}일</span></div> : null}
  </Link>;
}
