"use client";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { ProjectCompletionCheckResult } from "@/lib/project-completion";
export function ProjectCompletionDialog({ result, pending, onCancel, onComplete }: { result: ProjectCompletionCheckResult; pending: boolean; onCancel: () => void; onComplete: () => void }) {
  const rows = [
    { label: "미완료 업무", value: `${result.checks.incompleteTasks.count}건`, check: result.checks.incompleteTasks },
    { label: "지연 업무", value: `${result.checks.overdueTasks.count}건`, check: result.checks.overdueTasks },
    { label: "확인일 지난 메모", value: `${result.checks.overdueNoteChecks.count}건`, check: result.checks.overdueNoteChecks },
    { label: "미배정 원자재", value: `${result.checks.unallocatedMaterial.count}건 · ${result.checks.unallocatedMaterial.totalTons.toFixed(3)}t`, check: result.checks.unallocatedMaterial },
    { label: "미완료 출고", value: `${result.checks.incompleteShipments.count}건`, check: result.checks.incompleteShipments },
    { label: "본납-도어 공정", value: result.checks.requiredProcesses.finalDeliveryDoorRegistered ? "등록됨" : "미등록", check: result.checks.requiredProcesses },
  ];
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={onCancel}><section role="dialog" aria-modal="true" aria-labelledby="completion-dialog-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
    <h2 id="completion-dialog-title" className="text-lg font-bold text-slate-950">프로젝트 완료 전 확인</h2><p className="mt-2 break-words text-sm text-slate-500">프로젝트: <strong className="text-slate-800">{result.projectName}</strong></p>
    <div className="mt-5 space-y-2">{rows.map((row) => { const warning = row.check.state === "warning"; return <Link key={row.label} href={row.check.href} className={`flex min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-sm transition hover:brightness-95 ${warning ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-100 bg-emerald-50 text-emerald-800"}`}>{warning ? <AlertTriangle size={17} className="shrink-0"/> : <CheckCircle2 size={17} className="shrink-0"/>}<span className="min-w-0 flex-1 break-words font-semibold">{row.label}</span><span className="shrink-0 font-bold">{row.value}</span></Link>; })}</div>
    <p className={`mt-5 rounded-xl px-3 py-3 text-sm font-medium ${result.hasWarnings ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{result.hasWarnings ? "아직 정리되지 않은 항목이 있습니다." : "모든 주요 점검 항목이 정상입니다."}</p>
    <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={pending} onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50">취소</button><button type="button" disabled={pending} onClick={onComplete} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${result.hasWarnings ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>{pending && <Loader2 size={15} className="animate-spin"/>}{result.hasWarnings ? "그래도 완료" : "완료 처리"}</button></div>
  </section></div>;
}
