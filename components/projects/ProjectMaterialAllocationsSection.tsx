"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { MaterialContractAllocationDialog } from "@/components/statistics/lme/MaterialContractAllocationDialog";
import { Button } from "@/components/ui/Button";
import { formatNumber } from "@/lib/lme";
import type { MaterialContractAllocation } from "@/lib/material-contract-allocations";
import type { ProjectMaterialCostSummary } from "@/lib/project-material-allocation-cost";
import type { RawMaterialContract } from "@/lib/raw-material-contracts";
import { toast } from "@/lib/toast";
import { MATERIAL_USAGE_GROUP_STATUS_LABELS, type MaterialUsageGroupStatus } from "@/lib/material-usage-groups";

type ProjectTarget = { id: number; project_code: string | null; project_name: string; client_name: string | null; site_address: string | null };
type ProjectAllocation = MaterialContractAllocation & { contract_name: string; material_code: string; material_name: string | null; contract_price_krw_per_kg: number; amount_krw: number | null; supplier_name: string };
type GroupSummary = { id:string; name:string; status:MaterialUsageGroupStatus; requestedTons:number; unallocatedTons:number };
const statusLabel = { planned: "예정", confirmed: "확정", cancelled: "취소" } as const;
const emptySummary: ProjectMaterialCostSummary = { plannedTons: 0, confirmedTons: 0, totalAllocatedTons: 0, plannedCostKrw: 0, confirmedCostKrw: 0 };

export function ProjectMaterialAllocationsSection({ project }: { project: ProjectTarget }) {
  const [allocations, setAllocations] = useState<ProjectAllocation[]>([]);
  const [contracts, setContracts] = useState<RawMaterialContract[]>([]);
  const [selectedContractId, setSelectedContractId] = useState("");
  const [dialogContract, setDialogContract] = useState<RawMaterialContract | null>(null);
  const [editAllocationId, setEditAllocationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ProjectMaterialCostSummary>(emptySummary);
  const [unallocatedTons, setUnallocatedTons] = useState(0);
  const [groupSummaries, setGroupSummaries] = useState<GroupSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "planned" | "confirmed">("all");

  const load = useCallback(async () => {
    const [allocationResponse, contractResponse] = await Promise.all([
      fetch(`/api/projects/${project.id}/material-allocations`, { cache: "no-store" }),
      fetch("/api/statistics/lme/contracts", { cache: "no-store" }),
    ]);
    const allocationResult = await allocationResponse.json() as { allocations?: ProjectAllocation[]; summary?: ProjectMaterialCostSummary; unallocatedTons?: number; groupSummaries?:GroupSummary[]; canManage?: boolean; error?: string };
    const contractResult = await contractResponse.json() as { contracts?: RawMaterialContract[]; error?: string };
    if (!allocationResponse.ok) throw new Error(allocationResult.error ?? "원자재 사용 이력을 불러오지 못했습니다.");
    if (!contractResponse.ok) throw new Error(contractResult.error ?? "원자재 계약을 불러오지 못했습니다.");
    setAllocations(allocationResult.allocations ?? []); setSummary(allocationResult.summary ?? emptySummary); setUnallocatedTons(Number(allocationResult.unallocatedTons ?? 0)); setGroupSummaries(allocationResult.groupSummaries??[]); setContracts(contractResult.contracts ?? []); setCanManage(allocationResult.canManage === true);
  }, [project.id]);

  useEffect(() => { const timer = window.setTimeout(() => { setLoading(true); void load().catch((error) => toast.error(error instanceof Error ? error.message : "원자재 사용 이력을 불러오지 못했습니다.")).finally(() => setLoading(false)); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const availableContracts = useMemo(() => contracts.filter((contract) => contract.status === "active" && contract.allocation_summary.availableTons > 0), [contracts]);
  const visibleAllocations = useMemo(() => allocations.filter((allocation) => statusFilter === "all" || allocation.status === statusFilter), [allocations, statusFilter]);
  function openCreate() { const contract = availableContracts.find((item) => item.id === selectedContractId); if (!contract) return toast.error("가용 물량이 있는 계약을 선택해주세요."); setEditAllocationId(null); setDialogContract(contract); }
  function openEdit(allocation: ProjectAllocation) { const contract = contracts.find((item) => item.id === allocation.contract_id); if (!contract) return toast.error("계약 정보를 찾을 수 없습니다."); setEditAllocationId(allocation.id); setDialogContract(contract); }

  return <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-base font-bold">원자재 사용 및 원가</h2><p className="mt-1 text-xs text-slate-500">프로젝트 배정 원본과 현재 계약단가(원/kg)를 기준으로 예정·확정 원가를 계산합니다.</p></div>{canManage&&<div className="flex min-w-0 gap-2"><select value={selectedContractId} onChange={(event)=>setSelectedContractId(event.target.value)} className="min-w-0 max-w-3xl rounded-xl border px-3 py-2 text-xs"><option value="">계약 선택</option>{availableContracts.map((contract)=><option key={contract.id} value={contract.id}>{contract.supplier_name} · {contract.contract_name} · {contract.material_code} · {contract.contract_year}년 · {formatNumber(contract.contract_price_krw_per_kg)}원/kg · 계약 {formatNumber(contract.contract_quantity_ton,4)}t · 확정 {formatNumber(contract.allocation_summary.confirmedTons,4)}t · 예정 {formatNumber(contract.allocation_summary.plannedTons,4)}t · 가용 {formatNumber(contract.allocation_summary.availableTons,4)}t · {contract.status} · {contract.effective_start_date}~{contract.effective_end_date}</option>)}</select><Button variant="primary" onClick={openCreate}><Plus size={14}/>원자재 사용등록</Button></div>}</div>
    {loading?<p className="py-8 text-center text-sm text-slate-400">불러오는 중...</p>:<>
      {groupSummaries.length>0&&<div className="mt-4"><h3 className="text-sm font-bold">자재 사용 구분</h3><div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{groupSummaries.map(group=><a key={group.id} href={`/statistics/lme?group=${group.id}`} className="rounded-xl border p-3 transition hover:border-blue-300 hover:bg-blue-50"><div className="flex justify-between gap-2"><strong className="truncate text-sm">{group.name}</strong><span className="text-xs text-slate-500">{MATERIAL_USAGE_GROUP_STATUS_LABELS[group.status]}</span></div><p className={`mt-1 text-xs ${group.unallocatedTons>0?"font-semibold text-amber-700":"text-slate-500"}`}>요청 {formatNumber(group.requestedTons,4)}t · {group.unallocatedTons>0?`미배정 ${formatNumber(group.unallocatedTons,4)}t`:"미배정 없음"}</p></a>)}</div></div>}
      {unallocatedTons>0&&<p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">미배정 원자재 {formatNumber(unallocatedTons,4)}t가 있어 원자재 원가가 아직 최종 확정되지 않았습니다.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["원자재 예정 원가",`${formatNumber(summary.plannedCostKrw)}원`],["원자재 확정 원가",`${formatNumber(summary.confirmedCostKrw)}원`],["총 배정 물량",`${formatNumber(summary.totalAllocatedTons,4)}t`],["확정 물량",`${formatNumber(summary.confirmedTons,4)}t`]].map(([label,value])=><div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{value}</p></div>)}</div>
      <div className="mt-4 flex justify-end"><select aria-label="원자재 배정 상태 필터" value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value as "all"|"planned"|"confirmed")} className="rounded-xl border px-3 py-2 text-xs"><option value="all">전체</option><option value="planned">예정</option><option value="confirmed">확정</option></select></div>
      <div className="mt-3 overflow-x-auto rounded-xl border"><table className="min-w-[1240px] w-full text-left text-xs"><thead className="bg-slate-100"><tr>{["배정일","공급업체","계약명","원자재","상태","톤수","계약단가","금액","발주번호","메모","관리"].map((label)=><th key={label} className="whitespace-nowrap px-3 py-2">{label}</th>)}</tr></thead><tbody>{visibleAllocations.map((allocation)=><tr key={allocation.id} className={`border-t ${allocation.status==="cancelled"?"bg-slate-50 text-slate-400":""}`}><td className="whitespace-nowrap px-3 py-2">{allocation.allocation_date}</td><td className="whitespace-nowrap px-3 py-2">{allocation.supplier_name}</td><td className="px-3 py-2 font-semibold">{allocation.contract_name}</td><td className="whitespace-nowrap px-3 py-2">{allocation.material_code}{allocation.material_name?` · ${allocation.material_name}`:""}</td><td className="whitespace-nowrap px-3 py-2">{statusLabel[allocation.status]}</td><td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatNumber(allocation.quantity_tons,4)}t</td><td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatNumber(allocation.contract_price_krw_per_kg)}원/kg</td><td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{allocation.amount_krw===null?"계산 불가":`${formatNumber(allocation.amount_krw)}원`}</td><td className="max-w-48 truncate px-3 py-2" title={allocation.purchase_order_no??""}>{allocation.purchase_order_no??"-"}</td><td className="max-w-52 truncate px-3 py-2" title={allocation.memo??""}>{allocation.memo??"-"}</td><td className="px-3 py-2">{canManage&&allocation.status!=="cancelled"&&<button aria-label="원자재 사용 수정" className="rounded-lg border p-1.5" onClick={()=>openEdit(allocation)}><Pencil size={13}/></button>}</td></tr>)}{visibleAllocations.length===0&&<tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400">조건에 맞는 원자재 사용 이력이 없습니다.</td></tr>}</tbody></table></div>
    </>}
    <MaterialContractAllocationDialog contract={dialogContract} fixedProject={project} initialAllocationId={editAllocationId} startInCreateMode={!editAllocationId} onClose={()=>{setDialogContract(null);setEditAllocationId(null);}} onChanged={load}/>
  </section>;
}
