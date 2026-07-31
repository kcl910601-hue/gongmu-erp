"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatNumber } from "@/lib/lme";
import { MATERIAL_ALLOCATION_TYPES, MATERIAL_ALLOCATION_TYPE_LABELS, type ContractAllocationSummary, type MaterialAllocationType, type MaterialContractAllocation } from "@/lib/material-contract-allocations";
import type { RawMaterialContract } from "@/lib/raw-material-contracts";
import { toast } from "@/lib/toast";

type ProjectOption = { id: number; project_code: string | null; project_name: string; client_name: string | null; site_address: string | null };
type FormState = { allocationType: MaterialAllocationType; projectId: string; destinationName: string; quantityTons: string; allocationDate: string; status: "planned" | "confirmed"; purchaseOrderNo: string; memo: string };
const emptyForm = (fixedProject?: ProjectOption): FormState => ({ allocationType: "project", projectId: fixedProject ? String(fixedProject.id) : "", destinationName: "", quantityTons: "", allocationDate: new Date().toISOString().slice(0, 10), status: "planned", purchaseOrderNo: "", memo: "" });
const statusLabel = { planned: "예정", confirmed: "확정", cancelled: "취소" } as const;

export function MaterialContractAllocationDialog({ contract, fixedProject, initialAllocationId, startInCreateMode = false, onClose, onChanged }: { contract: RawMaterialContract | null; fixedProject?: ProjectOption; initialAllocationId?: string | null; startInCreateMode?: boolean; onClose: () => void; onChanged: () => Promise<void> }) {
  const [allocations, setAllocations] = useState<MaterialContractAllocation[]>([]);
  const [summary, setSummary] = useState<ContractAllocationSummary | null>(contract?.allocation_summary ?? null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MaterialContractAllocation | "new" | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(fixedProject));
  const [projects, setProjects] = useState<ProjectOption[]>(fixedProject ? [fixedProject] : []);
  const [projectQuery, setProjectQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const initialEditOpened = useRef(false);
  const initialCreateOpened = useRef(false);

  const load = useCallback(async () => {
    if (!contract) return;
    const response = await fetch(`/api/statistics/lme/contracts/${contract.id}/allocations`, { cache: "no-store" });
    const result = await response.json() as { allocations?: MaterialContractAllocation[]; summary?: ContractAllocationSummary; canManage?: boolean; error?: string };
    if (!response.ok) throw new Error(result.error ?? "배정 이력을 불러오지 못했습니다.");
    setAllocations(result.allocations ?? []);
    setSummary(result.summary ?? null);
    setCanManage(result.canManage === true);
  }, [contract]);

  useEffect(() => { if (!contract) return; const timer = window.setTimeout(() => { setLoading(true); void load().catch((error) => toast.error(error instanceof Error ? error.message : "배정 이력을 불러오지 못했습니다.")).finally(() => setLoading(false)); }, 0); return () => window.clearTimeout(timer); }, [contract, load]);
  useEffect(() => {
    if (!editing || fixedProject) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(); if (projectQuery.trim()) params.set("search", projectQuery.trim());
      void fetch(`/api/statistics/cost-analysis/projects?${params}`, { cache: "no-store" }).then(async (response) => {
        const result = await response.json() as { projects?: ProjectOption[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "현장을 불러오지 못했습니다."); setProjects(result.projects ?? []);
      }).catch((error) => toast.error(error instanceof Error ? error.message : "현장을 불러오지 못했습니다."));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [editing, fixedProject, projectQuery]);
  useEffect(() => { if (!initialAllocationId || initialEditOpened.current) return; const allocation = allocations.find((item) => item.id === initialAllocationId); if (!allocation) return; initialEditOpened.current = true; const timer = window.setTimeout(() => startEdit(allocation), 0); return () => window.clearTimeout(timer); }, [allocations, initialAllocationId]);
  useEffect(() => { if (!startInCreateMode || !canManage || initialAllocationId || initialCreateOpened.current) return; initialCreateOpened.current = true; const timer = window.setTimeout(() => { setEditing("new"); setForm(emptyForm(fixedProject)); setProjectQuery(fixedProject ? `${fixedProject.project_code ?? ""} ${fixedProject.project_name}`.trim() : ""); }, 0); return () => window.clearTimeout(timer); }, [canManage, fixedProject, initialAllocationId, startInCreateMode]);

  const editableAllocation = editing === "new" ? null : editing;
  const maximum = useMemo(() => (summary?.availableTons ?? 0) + (editableAllocation && editableAllocation.status !== "cancelled" ? editableAllocation.quantity_tons : 0), [editableAllocation, summary]);
  if (!contract) return null;
  const contractId = contract.id;

  function startCreate() { setEditing("new"); setForm(emptyForm(fixedProject)); setProjectQuery(fixedProject ? `${fixedProject.project_code ?? ""} ${fixedProject.project_name}`.trim() : ""); }
  function startEdit(allocation: MaterialContractAllocation) {
    setEditing(allocation); setProjectQuery(`${allocation.project_code ?? ""} ${allocation.project_name}`.trim());
    setForm({ allocationType: allocation.allocation_type, projectId: allocation.project_id === null ? "" : String(allocation.project_id), destinationName: allocation.destination_name ?? "", quantityTons: String(allocation.quantity_tons), allocationDate: allocation.allocation_date, status: allocation.status === "confirmed" ? "confirmed" : "planned", purchaseOrderNo: allocation.purchase_order_no ?? "", memo: allocation.memo ?? "" });
  }
  async function refresh() { await Promise.all([load(), onChanged()]); }
  async function save() {
    const quantity = Number(form.quantityTons);
    if ((form.allocationType === "project" && !form.projectId) || (form.allocationType !== "project" && !form.destinationName.trim()) || !Number.isFinite(quantity) || quantity <= 0 || !/^\d+(\.\d{1,4})?$/.test(form.quantityTons)) return toast.error("사용 대상과 0보다 큰 소수점 4자리 이하 톤수를 확인해주세요.");
    setSaving(true);
    try {
      const url = editing === "new" ? `/api/statistics/lme/contracts/${contractId}/allocations` : `/api/statistics/lme/contracts/${contractId}/allocations/${editing?.id}`;
      const response = await fetch(url, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, projectId: form.allocationType === "project" ? Number(form.projectId) : null, destinationName: form.allocationType === "project" ? null : form.destinationName.trim(), quantityTons: quantity, contextProjectId: fixedProject?.id }) });
      const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error ?? "배정을 저장하지 못했습니다.");
      toast.success(editing === "new" ? "원자재 사용을 등록했습니다." : "원자재 사용을 수정했습니다."); setEditing(null); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "배정을 저장하지 못했습니다."); } finally { setSaving(false); }
  }
  async function cancelAllocation(allocation: MaterialContractAllocation) {
    if (!window.confirm("이 배정을 취소하시겠습니까?\n취소된 배정은 물량 집계에서 제외됩니다.")) return;
    const response = await fetch(`/api/statistics/lme/contracts/${contractId}/allocations/${allocation.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", contextProjectId: fixedProject?.id }) });
    const result = await response.json() as { error?: string }; if (!response.ok) return toast.error(result.error ?? "배정을 취소하지 못했습니다.");
    toast.success("배정을 취소했습니다."); await refresh();
  }

  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-5">
      <div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">원자재 사용등록</h2><p className="mt-1 text-sm text-slate-500">{contract.contract_name} · {contract.supplier_name}</p></div><button aria-label="닫기" onClick={onClose}><X size={18}/></button></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-5">{[["계약 수량",summary?.contractQuantityTons],["확정 사용량",summary?.confirmedTons],["예정 배정량",summary?.plannedTons],["잔여 계약량",summary?.remainingTons],["현재 가용량",summary?.availableTons]].map(([label,value])=><div key={String(label)} className="rounded-xl bg-slate-50 p-3 text-xs"><span className="text-slate-500">{label}</span><p className="mt-1 font-bold">{formatNumber(Number(value ?? 0),4)}t</p></div>)}</div>
      <div className="mt-4 flex justify-end">{canManage&&<Button variant="primary" onClick={startCreate}><Plus size={14}/>사용등록</Button>}</div>
      {editing&&<section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/30 p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-semibold">사용 구분<select disabled={Boolean(fixedProject)} value={form.allocationType} onChange={(event)=>setForm({...form,allocationType:event.target.value as MaterialAllocationType,projectId:"",destinationName:""})} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm">{MATERIAL_ALLOCATION_TYPES.map((type)=><option key={type} value={type}>{MATERIAL_ALLOCATION_TYPE_LABELS[type]}</option>)}</select></label>
        {form.allocationType==="project"?<label className="text-xs font-semibold lg:col-span-2">프로젝트 {fixedProject?null:<input value={projectQuery} onChange={(event)=>setProjectQuery(event.target.value)} placeholder="프로젝트 코드 또는 현장명" className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/>}<select disabled={Boolean(fixedProject)} value={form.projectId} onChange={(event)=>setForm({...form,projectId:event.target.value})} className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm"><option value="">프로젝트 선택</option>{projects.map((project)=><option key={project.id} value={project.id}>{project.project_code ?? "코드 없음"} · {project.project_name} · {project.client_name ?? project.site_address ?? "-"}</option>)}</select></label>:<label className="text-xs font-semibold lg:col-span-2">사용처명<input maxLength={200} value={form.destinationName} onChange={(event)=>setForm({...form,destinationName:event.target.value})} placeholder="사용처를 입력하세요" className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/></label>}
        <label className="text-xs font-semibold">배정 톤수<div className="mt-1 flex"><input type="number" min="0.0001" step="0.0001" value={form.quantityTons} onChange={(event)=>setForm({...form,quantityTons:event.target.value})} className="w-full rounded-l-xl border px-3 py-2 text-sm"/><span className="rounded-r-xl border border-l-0 bg-white px-3 py-2 text-sm">t</span></div><span className="mt-1 block font-normal text-slate-500">수정 가능 최대 {formatNumber(maximum,4)}t</span></label><label className="text-xs font-semibold">배정일<input type="date" value={form.allocationDate} onChange={(event)=>setForm({...form,allocationDate:event.target.value})} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/></label><label className="text-xs font-semibold">상태<select value={form.status} onChange={(event)=>setForm({...form,status:event.target.value as "planned"|"confirmed"})} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"><option value="planned">예정 - 가용량 선점</option><option value="confirmed">확정 - 실제 발주</option></select></label><label className="text-xs font-semibold">발주번호<input maxLength={100} value={form.purchaseOrderNo} onChange={(event)=>setForm({...form,purchaseOrderNo:event.target.value})} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/></label><label className="text-xs font-semibold sm:col-span-2 lg:col-span-3">메모<textarea rows={3} maxLength={2000} value={form.memo} onChange={(event)=>setForm({...form,memo:event.target.value})} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/></label></div><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={()=>setEditing(null)}>취소</Button><Button variant="primary" disabled={saving} onClick={()=>void save()}>{saving?"저장 중...":"저장"}</Button></div></section>}
      {loading?<p className="py-12 text-center text-sm text-slate-400">불러오는 중...</p>:<div className="mt-4 overflow-x-auto rounded-xl border"><table className="min-w-[1300px] w-full text-left text-xs"><thead className="bg-slate-100"><tr>{["배정일","사용 구분","대상","프로젝트 코드","상태","톤수","발주번호","메모","작성자","작성일","관리"].map((label)=><th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{allocations.filter((allocation)=>!fixedProject||allocation.project_id===fixedProject.id).map((allocation)=><tr key={allocation.id} className={`border-t ${allocation.status==="cancelled"?"bg-slate-50 text-slate-400":""}`}><td className="px-3 py-2">{allocation.allocation_date}</td><td className="px-3 py-2"><span className="rounded-full bg-slate-100 px-2 py-1">{MATERIAL_ALLOCATION_TYPE_LABELS[allocation.allocation_type]}</span></td><td className="px-3 py-2 font-semibold">{allocation.allocation_type==="project"?allocation.project_name:allocation.destination_name}</td><td className="px-3 py-2">{allocation.allocation_type==="project"?allocation.project_code??"-":"-"}</td><td className="px-3 py-2">{statusLabel[allocation.status]}</td><td className="px-3 py-2">{formatNumber(allocation.quantity_tons,4)}t</td><td className="px-3 py-2">{allocation.purchase_order_no??"-"}</td><td className="max-w-52 truncate px-3 py-2">{allocation.memo??"-"}</td><td className="px-3 py-2">{allocation.created_by_name??"-"}</td><td className="px-3 py-2">{allocation.created_at.slice(0,10)}</td><td className="px-3 py-2">{canManage&&allocation.status!=="cancelled"&&<div className="flex gap-1"><button aria-label="사용등록 수정" className="rounded-lg border bg-white p-1.5" onClick={()=>startEdit(allocation)}><Pencil size={13}/></button><Button size="sm" variant="danger" onClick={()=>void cancelAllocation(allocation)}>배정 취소</Button></div>}</td></tr>)}{allocations.filter((allocation)=>!fixedProject||allocation.project_id===fixedProject.id).length===0&&<tr><td colSpan={11} className="px-4 py-12 text-center text-slate-400">사용등록 이력이 없습니다.</td></tr>}</tbody></table></div>}
    </div>
  </div>;
}
