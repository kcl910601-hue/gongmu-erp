"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { formatMaterialAllocationAuditChange, type MaterialAllocationAuditEntry } from "@/lib/material-allocation-audit";
import type { MaterialContractAllocation } from "@/lib/material-contract-allocations";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function MaterialAllocationHistoryDialog({ contractId, allocation, onClose }: { contractId: string; allocation: MaterialContractAllocation | null; onClose: () => void }) {
  const [activities, setActivities] = useState<MaterialAllocationAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!allocation) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/statistics/lme/contracts/${contractId}/allocations/${allocation.id}/history`, { cache: "no-store" });
      const result = await response.json() as { activities?: MaterialAllocationAuditEntry[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "변경 이력을 불러오지 못했습니다.");
      setActivities(result.activities ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "변경 이력을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [allocation, contractId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  if (!allocation) return null;

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="max-h-[82vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">변경 이력</h3><p className="mt-1 truncate text-xs text-slate-500">{allocation.allocation_type === "project" ? allocation.project_name : allocation.destination_name ?? "공장 재고"}</p></div><button type="button" aria-label="변경 이력 닫기" onClick={onClose}><X size={18}/></button></div>
      {loading?<p className="py-10 text-center text-sm text-slate-400">변경 이력을 불러오는 중...</p>:error?<div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}<button type="button" onClick={()=>void load()} className="ml-2 font-semibold">재시도</button></div>:activities.length===0?<p className="py-10 text-center text-sm text-slate-400">기록된 변경 이력이 없습니다.</p>:<ol className="mt-5 space-y-3">{activities.map((activity)=><li key={activity.id} className="relative ml-2 border-l border-slate-200 pb-3 pl-5 last:pb-0"><span className="absolute -left-1 top-1.5 h-2 w-2 rounded-full bg-blue-500"/><div className="flex flex-wrap items-center gap-x-2 text-xs"><span className="font-bold text-slate-800">{activity.employee_name??"시스템"}</span><time className="ml-auto text-[11px] text-slate-400">{formatDateTime(activity.created_at)}</time></div><p className="mt-1 text-sm font-semibold text-slate-700">{activity.title}</p><p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600">{formatMaterialAllocationAuditChange(activity.metadata)}</p></li>)}</ol>}
    </div>
  </div>;
}
