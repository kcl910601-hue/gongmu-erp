"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ProjectMaterialRequestDialog } from "@/components/projects/ProjectMaterialRequestDialog";
import { Button } from "@/components/ui/Button";
import { formatNumber } from "@/lib/lme";
import type { MaterialContractAllocation } from "@/lib/material-contract-allocations";
import type { ProjectMaterialCostSummary } from "@/lib/project-material-allocation-cost";
import { toast } from "@/lib/toast";
import { MATERIAL_USAGE_GROUP_STATUS_LABELS, type MaterialUsageGroupStatus } from "@/lib/material-usage-groups";
import { MATERIAL_USAGE_REQUESTS_CHANGED_EVENT } from "@/lib/collaboration-events";
import type { ProjectMaterialOrderStatus } from "@/lib/project-material-allocation-cost";

type ProjectTarget = { id: number; project_code: string | null; project_name: string; client_name: string | null; site_address: string | null };
type ProjectAllocation = MaterialContractAllocation & { contract_name: string; material_code: string; material_name: string | null; contract_price_krw_per_kg: number; amount_krw: number | null; supplier_name: string };
type GroupSummary = { id:string; name:string; status:MaterialUsageGroupStatus; requestedTons:number; unallocatedTons:number };
const statusLabel = { planned: "예정", confirmed: "확정", cancelled: "취소" } as const;
const emptySummary: ProjectMaterialCostSummary = { plannedTons: 0, confirmedTons: 0, totalAllocatedTons: 0, plannedCostKrw: 0, confirmedCostKrw: 0 };
const emptyOrderStatus: ProjectMaterialOrderStatus = { requestedTons: 0, plannedTons: 0, confirmedTons: 0, allocatedTons: 0, unallocatedTons: 0, allocationRate: 0 };
const kilogramFormatter = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
const formatKg = (tons: number) => `${kilogramFormatter.format(tons * 1_000)} kg`;

export function ProjectMaterialAllocationsSection({ project }: { project: ProjectTarget }) {
  const [allocations, setAllocations] = useState<ProjectAllocation[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ProjectMaterialCostSummary>(emptySummary);
  const [orderStatus, setOrderStatus] = useState<ProjectMaterialOrderStatus>(emptyOrderStatus);
  const [groupSummaries, setGroupSummaries] = useState<GroupSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "planned" | "confirmed">("all");

  const load = useCallback(async () => {
    const allocationResponse = await fetch(`/api/projects/${project.id}/material-allocations`, { cache: "no-store" });
    const allocationResult = await allocationResponse.json() as { allocations?: ProjectAllocation[]; summary?: ProjectMaterialCostSummary; orderStatus?: ProjectMaterialOrderStatus; groupSummaries?:GroupSummary[]; canManage?: boolean; error?: string };
    if (!allocationResponse.ok) throw new Error(allocationResult.error ?? "원자재 사용 이력을 불러오지 못했습니다.");
    setAllocations(allocationResult.allocations ?? []); setSummary(allocationResult.summary ?? emptySummary); setOrderStatus(allocationResult.orderStatus ?? emptyOrderStatus); setGroupSummaries(allocationResult.groupSummaries??[]); setCanManage(allocationResult.canManage === true);
  }, [project.id]);

  useEffect(() => { const timer = window.setTimeout(() => { setLoading(true); void load().catch((error) => toast.error(error instanceof Error ? error.message : "원자재 사용 이력을 불러오지 못했습니다.")).finally(() => setLoading(false)); }, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const reload = () => void load().catch((error) => toast.error(error instanceof Error ? error.message : "원자재 사용 이력을 갱신하지 못했습니다.")); window.addEventListener(MATERIAL_USAGE_REQUESTS_CHANGED_EVENT, reload); return () => window.removeEventListener(MATERIAL_USAGE_REQUESTS_CHANGED_EVENT, reload); }, [load]);
  const visibleAllocations = useMemo(() => allocations.filter((allocation) => statusFilter === "all" || allocation.status === statusFilter), [allocations, statusFilter]);

  return <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-base font-bold">원자재 사용 및 원가</h2><p className="mt-1 text-xs text-slate-500">프로젝트에서는 발주량을 등록하고, 계약 배정은 원자재 계약 화면에서 관리합니다.</p></div><div className="flex gap-2"><Button variant="outline" onClick={()=>window.location.assign("/statistics/lme")}>원자재 계약에서 배정</Button>{canManage&&<Button variant="primary" onClick={()=>setRequestOpen(true)}><Plus size={14}/>알루미늄 발주 등록</Button>}</div></div>
    {loading?<p className="py-8 text-center text-sm text-slate-400">불러오는 중...</p>:<>
      {groupSummaries.length>0&&<div className="mt-4"><h3 className="text-sm font-bold">자재 사용 구분</h3><div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{groupSummaries.map(group=><a key={group.id} href={`/statistics/lme?group=${group.id}`} className="rounded-xl border p-3 transition hover:border-blue-300 hover:bg-blue-50"><div className="flex justify-between gap-2"><strong className="truncate text-sm">{group.name}</strong><span className="text-xs text-slate-500">{MATERIAL_USAGE_GROUP_STATUS_LABELS[group.status]}</span></div><p className={`mt-1 text-xs ${group.unallocatedTons>0?"font-semibold text-amber-700":"text-slate-500"}`}>요청 {formatKg(group.requestedTons)} · {group.unallocatedTons>0?`미배정 ${formatKg(group.unallocatedTons)}`:"미배정 없음"}</p></a>)}</div></div>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["발주량",formatKg(orderStatus.requestedTons)],["계약 배정",formatKg(orderStatus.allocatedTons)],["미배정",formatKg(orderStatus.unallocatedTons)],["배정률",`${formatNumber(orderStatus.allocationRate,2)}%`]].map(([label,value])=><div key={label} className={`rounded-xl border p-3 ${label==="미배정"&&orderStatus.unallocatedTons>0?"border-amber-200 bg-amber-50":"border-slate-200 bg-slate-50"}`}><div className="flex items-center gap-2"><p className="text-xs font-semibold text-slate-500">{label}</p>{label==="미배정"&&<span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${orderStatus.unallocatedTons>0?"bg-amber-100 text-amber-700":"bg-emerald-100 text-emerald-700"}`}>{orderStatus.unallocatedTons>0?"미배정":"전량 배정"}</span>}</div><p className="mt-1 text-lg font-bold text-slate-900">{value}</p>{label==="계약 배정"&&<p className="mt-1 text-[11px] text-slate-500">예정 {formatKg(orderStatus.plannedTons)} · 확정 {formatKg(orderStatus.confirmedTons)}</p>}</div>)}</div>
      {orderStatus.unallocatedTons>0&&<p className="mt-3 text-xs font-medium text-amber-700">미배정 알루미늄 {formatKg(orderStatus.unallocatedTons)}가 있어 계약 배정 원가가 아직 최종 확정되지 않았습니다.</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{[["계약 배정 예정 원가",`${formatNumber(summary.plannedCostKrw)}원`],["계약 배정 확정 원가",`${formatNumber(summary.confirmedCostKrw)}원`]].map(([label,value])=><div key={label} className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-base font-bold text-slate-900">{value}</p></div>)}</div>
      <div className="mt-4 flex justify-end"><select aria-label="원자재 배정 상태 필터" value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value as "all"|"planned"|"confirmed")} className="rounded-xl border px-3 py-2 text-xs"><option value="all">전체</option><option value="planned">예정</option><option value="confirmed">확정</option></select></div>
      <div className="mt-3 overflow-x-auto rounded-xl border"><table className="min-w-[1150px] w-full text-left text-xs"><thead className="bg-slate-100"><tr>{["배정일","공급업체","계약명","원자재","상태","배정량","계약단가","금액","발주번호","메모"].map((label)=><th key={label} className="whitespace-nowrap px-3 py-2">{label}</th>)}</tr></thead><tbody>{visibleAllocations.map((allocation)=><tr key={allocation.id} className={`border-t ${allocation.status==="cancelled"?"bg-slate-50 text-slate-400":""}`}><td className="whitespace-nowrap px-3 py-2">{allocation.allocation_date}</td><td className="whitespace-nowrap px-3 py-2">{allocation.supplier_name}</td><td className="px-3 py-2 font-semibold">{allocation.contract_name}</td><td className="whitespace-nowrap px-3 py-2">{allocation.material_code}{allocation.material_name?` · ${allocation.material_name}`:""}</td><td className="whitespace-nowrap px-3 py-2">{statusLabel[allocation.status]}</td><td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatKg(allocation.quantity_tons)}</td><td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatNumber(allocation.contract_price_krw_per_kg)}원/kg</td><td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{allocation.amount_krw===null?"계산 불가":`${formatNumber(allocation.amount_krw)}원`}</td><td className="max-w-48 truncate px-3 py-2" title={allocation.purchase_order_no??""}>{allocation.purchase_order_no??"-"}</td><td className="max-w-52 truncate px-3 py-2" title={allocation.memo??""}>{allocation.memo??"-"}</td></tr>)}{visibleAllocations.length===0&&<tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">조건에 맞는 원자재 사용 이력이 없습니다.</td></tr>}</tbody></table></div>
    </>}
    <ProjectMaterialRequestDialog projectId={project.id} open={requestOpen} onClose={()=>setRequestOpen(false)} onSaved={load}/>
  </section>;
}
