"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { GanttExportTemplate } from "@/lib/excel/gantt-export";

export type GanttExportRange = "current" | "month" | "custom";
export type GanttExportProject = { key: string; name: string };
type Props = {
  open: boolean;
  currentStart: string;
  currentEnd: string;
  monthStart: string;
  monthEnd: string;
  projects: GanttExportProject[];
  loading: boolean;
  onClose: () => void;
  onDownload: (template: GanttExportTemplate, range: GanttExportRange, startDate: string, endDate: string, projectKey: string) => void;
};

const templates: Array<{ value: GanttExportTemplate; label: string; description: string }> = [
  { value: "current", label: "현재 화면형", description: "현재 Gantt에 보이는 구성 그대로 출력" },
  { value: "project", label: "현장별 공정표", description: "프로젝트별 공정 일정을 Sheet별 출력" },
  { value: "summary", label: "보고용 요약", description: "프로젝트별 진행 현황을 간단히 요약" },
];

export function GanttExcelExportDialog({ open, currentStart, currentEnd, monthStart, monthEnd, projects, loading, onClose, onDownload }: Props) {
  const [template, setTemplate] = useState<GanttExportTemplate>("current");
  const [range, setRange] = useState<GanttExportRange>("current");
  const [projectKey, setProjectKey] = useState("all");
  const [customStartDate, setCustomStartDate] = useState(currentStart);
  const [customEndDate, setCustomEndDate] = useState(currentEnd);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLElement>("input, select, button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loading, onClose, open]);
  if (!open) return null;
  const startDate = range === "current" ? currentStart : range === "month" ? monthStart : customStartDate;
  const endDate = range === "current" ? currentEnd : range === "month" ? monthEnd : customEndDate;
  const invalid = !startDate || !endDate || startDate > endDate;
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="gantt-excel-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4"><div><h2 id="gantt-excel-title" className="text-lg font-bold text-slate-950">Gantt Excel 다운로드</h2><p className="mt-1 text-xs text-slate-500">현재 화면의 조회 데이터와 필터 범위 안에서 생성합니다.</p></div><button type="button" aria-label="닫기" disabled={loading} onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X size={19} /></button></header>
      <div className="space-y-5 p-6">
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold text-slate-800">출력 양식</legend>{templates.map((item) => <label key={item.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700"><input className="mt-1" type="radio" name="gantt-export-template" value={item.value} checked={template === item.value} onChange={() => setTemplate(item.value)} /><span><span className="block font-semibold text-slate-800">{item.label}</span><span className="mt-0.5 block text-xs text-slate-500">{item.description}</span></span></label>)}</fieldset>
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold text-slate-800">기간</legend>{([ ["current", `현재 Gantt 기간 (${currentStart} ~ ${currentEnd})`], ["month", `현재 월 (${monthStart} ~ ${monthEnd})`], ["custom", "직접 선택"] ] as const).map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700"><input type="radio" name="gantt-export-range" value={value} checked={range === value} onChange={() => setRange(value)} />{label}</label>)}</fieldset>
        {range === "custom" && <div className="grid grid-cols-2 gap-3"><label className="text-xs font-medium text-slate-600">시작일<input aria-label="시작일" type="date" value={customStartDate} onChange={(event) => setCustomStartDate(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label><label className="text-xs font-medium text-slate-600">종료일<input aria-label="종료일" type="date" value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label></div>}
        {template === "project" && <label className="block text-sm font-semibold text-slate-800">출력 프로젝트<select value={projectKey} onChange={(event) => setProjectKey(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal"><option value="all">전체 (프로젝트별 Sheet)</option>{projects.map((project) => <option key={project.key} value={project.key}>{project.name}</option>)}</select></label>}
        {invalid && <p className="text-xs font-medium text-red-600">종료일은 시작일보다 빠를 수 없습니다.</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4"><Button type="button" variant="secondary" disabled={loading} onClick={onClose}>취소</Button><Button type="button" variant="primary" disabled={loading || invalid} onClick={() => onDownload(template, range, startDate, endDate, projectKey)}>{loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}{loading ? "생성 중..." : "Excel 다운로드"}</Button></footer>
    </section>
  </div>;
}
