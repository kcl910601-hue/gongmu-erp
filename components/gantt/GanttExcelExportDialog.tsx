"use client";

import { useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type GanttExportRange = "current" | "month" | "custom";
type Props = {
  open: boolean;
  currentStart: string;
  currentEnd: string;
  monthStart: string;
  monthEnd: string;
  loading: boolean;
  onClose: () => void;
  onDownload: (range: GanttExportRange, startDate: string, endDate: string) => void;
};

export function GanttExcelExportDialog({ open, currentStart, currentEnd, monthStart, monthEnd, loading, onClose, onDownload }: Props) {
  const [range, setRange] = useState<GanttExportRange>("current");
  const [customStartDate, setCustomStartDate] = useState(currentStart);
  const [customEndDate, setCustomEndDate] = useState(currentEnd);
  if (!open) return null;
  const startDate = range === "current" ? currentStart : range === "month" ? monthStart : customStartDate;
  const endDate = range === "current" ? currentEnd : range === "month" ? monthEnd : customEndDate;
  const invalid = !startDate || !endDate || startDate > endDate;
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="gantt-excel-title" className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4"><div><h2 id="gantt-excel-title" className="text-lg font-bold text-slate-950">Gantt Excel 다운로드</h2><p className="mt-1 text-xs text-slate-500">현재 화면의 필터와 정렬을 유지해 내보냅니다.</p></div><button type="button" aria-label="닫기" disabled={loading} onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X size={19} /></button></header>
      <div className="space-y-4 p-6">
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold text-slate-800">내보낼 기간</legend>{([ ["current", `현재 Gantt 범위 (${currentStart} ~ ${currentEnd})`], ["month", `현재 월 (${monthStart} ~ ${monthEnd})`], ["custom", "사용자 지정"] ] as const).map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700"><input type="radio" name="gantt-export-range" value={value} checked={range === value} onChange={() => setRange(value)} />{label}</label>)}</fieldset>
        {range === "custom" && <div className="grid grid-cols-2 gap-3"><label className="text-xs font-medium text-slate-600">시작일<input type="date" value={customStartDate} onChange={(event) => setCustomStartDate(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label><label className="text-xs font-medium text-slate-600">종료일<input type="date" value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label></div>}
        {invalid && <p className="text-xs font-medium text-red-600">종료일은 시작일보다 빠를 수 없습니다.</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4"><Button type="button" variant="secondary" disabled={loading} onClick={onClose}>취소</Button><Button type="button" variant="primary" disabled={loading || invalid} onClick={() => onDownload(range, startDate, endDate)}>{loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}{loading ? "생성 중..." : "Excel 다운로드"}</Button></footer>
    </section>
  </div>;
}
