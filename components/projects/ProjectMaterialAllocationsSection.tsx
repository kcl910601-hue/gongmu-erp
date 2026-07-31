"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { MaterialContractAllocationDialog } from "@/components/statistics/lme/MaterialContractAllocationDialog";
import { Button } from "@/components/ui/Button";
import { formatNumber } from "@/lib/lme";
import type { MaterialContractAllocation } from "@/lib/material-contract-allocations";
import type { RawMaterialContract } from "@/lib/raw-material-contracts";
import { toast } from "@/lib/toast";

type ProjectTarget = { id: number; project_code: string | null; project_name: string; client_name: string | null; site_address: string | null };
type ProjectAllocation = MaterialContractAllocation & { contract_name: string; material_code: string; contract_price_krw_per_kg: number; supplier_name: string };
const statusLabel = { planned: "예정", confirmed: "확정", cancelled: "취소" } as const;

export function ProjectMaterialAllocationsSection({ project }: { project: ProjectTarget }) {
  const [allocations, setAllocations] = useState<ProjectAllocation[]>([]);
  const [contracts, setContracts] = useState<RawMaterialContract[]>([]);
  const [selectedContractId, setSelectedContractId] = useState("");
  const [dialogContract, setDialogContract] = useState<RawMaterialContract | null>(null);
  const [editAllocationId, setEditAllocationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [allocationResponse, contractResponse] = await Promise.all([
      fetch(`/api/projects/${project.id}/material-allocations`, { cache: "no-store" }),
      fetch("/api/statistics/lme/contracts", { cache: "no-store" }),
    ]);
    const allocationResult = await allocationResponse.json() as { allocations?: ProjectAllocation[]; canManage?: boolean; error?: string };
    const contractResult = await contractResponse.json() as { contracts?: RawMaterialContract[]; error?: string };
    if (!allocationResponse.ok) throw new Error(allocationResult.error ?? "원자재 사용 이력을 불러오지 못했습니다.");
    if (!contractResponse.ok) throw new Error(contractResult.error ?? "원자재 계약을 불러오지 못했습니다.");
    setAllocations(allocationResult.allocations ?? []); setContracts(contractResult.contracts ?? []); setCanManage(allocationResult.canManage === true);
  }, [project.id]);

  useEffect(() => { const timer = window.setTimeout(() => { setLoading(true); void load().catch((error) => toast.error(error instanceof Error ? error.message : "원자재 사용 이력을 불러오지 못했습니다.")).finally(() => setLoading(false)); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const availableContracts = useMemo(() => contracts.filter((contract) => contract.status === "active" && contract.allocation_summary.availableTons > 0), [contracts]);
  function openCreate() { const contract = availableContracts.find((item) => item.id === selectedContractId); if (!contract) return toast.error("가용 물량이 있는 계약을 선택해주세요."); setEditAllocationId(null); setDialogContract(contract); }
  function openEdit(allocation: ProjectAllocation) { const contract = contracts.find((item) => item.id === allocation.contract_id); if (!contract) return toast.error("계약 정보를 찾을 수 없습니다."); setEditAllocationId(allocation.id); setDialogContract(contract); }

  return <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-base font-bold">원자재 사용</h2><p className="mt-1 text-xs text-slate-500">발주 시점의 계약 물량 배정 이력입니다. 프로젝트 원가에는 아직 반영되지 않습니다.</p></div>{canManage&&<div className="flex min-w-0 gap-2"><select value={selectedContractId} onChange={(event)=>setSelectedContractId(event.target.value)} className="min-w-0 max-w-3xl rounded-xl border px-3 py-2 text-xs"><option value="">계약 선택</option>{availableContracts.map((contract)=><option key={contract.id} value={contract.id}>{contract.supplier_name} · {contract.contract_name} · {contract.material_code} · {contract.contract_year}년 · {formatNumber(contract.contract_price_krw_per_kg)}원/kg · 계약 {formatNumber(contract.contract_quantity_ton,4)}t · 확정 {formatNumber(contract.allocation_summary.confirmedTons,4)}t · 예정 {formatNumber(contract.allocation_summary.plannedTons,4)}t · 가용 {formatNumber(contract.allocation_summary.availableTons,4)}t · {contract.status} · {contract.effective_start_date}~{contract.effective_end_date}</option>)}</select><Button variant="primary" onClick={openCreate}><Plus size={14}/>원자재 사용등록</Button></div>}</div>
    {loading?<p className="py-8 text-center text-sm text-slate-400">불러오는 중...</p>:<div className="mt-4 overflow-x-auto rounded-xl border"><table className="min-w-[1100px] w-full text-left text-xs"><thead className="bg-slate-100"><tr>{["배정일","공급업체","계약명","원자재","계약단가","상태","톤수","발주번호","메모","관리"].map((label)=><th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{allocations.map((allocation)=><tr key={allocation.id} className={`border-t ${allocation.status==="cancelled"?"bg-slate-50 text-slate-400":""}`}><td className="px-3 py-2">{allocation.allocation_date}</td><td className="px-3 py-2">{allocation.supplier_name}</td><td className="px-3 py-2 font-semibold">{allocation.contract_name}</td><td className="px-3 py-2">{allocation.material_code}</td><td className="px-3 py-2">{formatNumber(allocation.contract_price_krw_per_kg)}원/kg</td><td className="px-3 py-2">{statusLabel[allocation.status]}</td><td className="px-3 py-2">{formatNumber(allocation.quantity_tons,4)}t</td><td className="px-3 py-2">{allocation.purchase_order_no??"-"}</td><td className="max-w-52 truncate px-3 py-2">{allocation.memo??"-"}</td><td className="px-3 py-2">{canManage&&allocation.status!=="cancelled"&&<button aria-label="원자재 사용 수정" className="rounded-lg border p-1.5" onClick={()=>openEdit(allocation)}><Pencil size={13}/></button>}</td></tr>)}{allocations.length===0&&<tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">원자재 사용 이력이 없습니다.</td></tr>}</tbody></table></div>}
    <MaterialContractAllocationDialog contract={dialogContract} fixedProject={project} initialAllocationId={editAllocationId} startInCreateMode={!editAllocationId} onClose={()=>{setDialogContract(null);setEditAllocationId(null);}} onChanged={load}/>
  </section>;
}
