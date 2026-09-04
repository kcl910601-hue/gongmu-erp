"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { MATERIAL_USAGE_REQUESTS_CHANGED_EVENT, scheduleCollaborationEvents } from "@/lib/collaboration-events";
import { toast } from "@/lib/toast";

export function FactoryMaterialRequestDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ quantityKg: "", usageDate: new Date().toISOString().slice(0, 10), purchaseOrderNo: "", memo: "" });
  const [saving, setSaving] = useState(false);
  if (!open) return null;
  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/statistics/lme/usage-requests/factory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "공장재고 발주를 등록하지 못했습니다.");
      scheduleCollaborationEvents([MATERIAL_USAGE_REQUESTS_CHANGED_EVENT]);
      await onSaved();
      setForm({ ...form, quantityKg: "", purchaseOrderNo: "", memo: "" });
      onClose();
      toast.success("공장재고 발주를 등록했습니다.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "공장재고 발주를 등록하지 못했습니다."); }
    finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={onClose}><div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-5" onMouseDown={(event)=>event.stopPropagation()}><h3 className="text-lg font-bold">공장재고 발주</h3><p className="mt-1 text-xs text-slate-500">계약 배정 없이 공장재고 필요량만 등록합니다.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">사용 구분<input value="공장재고" disabled className="mt-1 w-full rounded-xl border bg-slate-50 px-3 py-2 text-sm"/></label><label className="text-xs font-semibold">원자재<input value="AL · 알루미늄" disabled className="mt-1 w-full rounded-xl border bg-slate-50 px-3 py-2 text-sm"/></label><label className="text-xs font-semibold">발주량 (kg)<input type="number" min="0.1" step="0.1" value={form.quantityKg} onChange={(event)=>setForm({...form,quantityKg:event.target.value})} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"/></label><label className="text-xs font-semibold">사용일<input type="date" value={form.usageDate} onChange={(event)=>setForm({...form,usageDate:event.target.value})} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"/></label><label className="text-xs font-semibold sm:col-span-2">발주번호<input maxLength={100} value={form.purchaseOrderNo} onChange={(event)=>setForm({...form,purchaseOrderNo:event.target.value})} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"/></label><label className="text-xs font-semibold sm:col-span-2">메모<textarea rows={3} maxLength={2000} value={form.memo} onChange={(event)=>setForm({...form,memo:event.target.value})} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"/></label></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={onClose}>취소</Button><Button variant="primary" disabled={saving} onClick={()=>void save()}>{saving?"등록 중...":"등록"}</Button></div></div></div>;
}
