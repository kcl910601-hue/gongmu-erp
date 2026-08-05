"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { AssemblyVendorMultiSelect } from "@/components/projects/AssemblyVendorMultiSelect";
import { addActivity } from "@/lib/activity";
import { createAuditChanges, PROJECT_AUDIT_FIELDS } from "@/lib/audit";
import { getProjectEntryOptions } from "@/lib/project-master-data";
import { updateProjectWithVendors } from "@/lib/project-assembly-vendors";
import type { ProjectListItem } from "@/lib/projects";
import { getActiveProcessTypes, normalizeProcessTypeCode } from "@/lib/process-types";
import { toast } from "@/lib/toast";
import { formatProjectQuantity, parseProjectQuantity } from "@/lib/project-quantity";
import { EditingLockNotice } from "@/components/editing/EditingLockNotice";
import { useEditingLock } from "@/hooks/useEditingLock";

type Props = {
  project: ProjectListItem;
  onCancel: () => void;
  onSaved: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

const inputClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

export function ProjectEditForm({ project, onCancel, onSaved, onDirtyChange }: Props) {
  const editingLock = useEditingLock("project", project.id);
  const initial = useMemo(() => ({
    project_code: project.project_code ?? "",
    project_name: project.project_name,
    client_name: project.client_name ?? "",
    site_address: project.site_address ?? "",
    salesperson: project.salesperson ?? "",
    task_manager: project.task_manager ?? "",
    assemblyVendorIds: project.assemblyVendors.map((vendor) => vendor.organizationId),
    process_type: normalizeProcessTypeCode(project.process_type ?? ""),
    start_date: project.start_date ?? "",
    end_date: project.end_date ?? project.completion_due_date ?? "",
    memo: project.memo ?? "",
    quantity: project.quantity === null ? "" : String(project.quantity),
    quantity_unit: project.quantity_unit ?? "",
  }), [project]);
  const [form, setForm] = useState(initial);
  const [salespeople, setSalespeople] = useState<Array<{ value: string; label: string }>>([]);
  const [managers, setManagers] = useState<Array<{ value: string; label: string }>>([]);
  const [vendors, setVendors] = useState<Array<{ id: number; name: string }>>([]);
  const [processes, setProcesses] = useState<Array<{ code: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    void Promise.all([getProjectEntryOptions(), getActiveProcessTypes()]).then(([entry, process]) => {
      setSalespeople(entry.data.salespeople);
      setManagers(entry.data.taskManagers);
      setVendors(entry.data.assemblyVendors);
      setProcesses(process.data.map(({ code, name }) => ({ code, name })));
    });
  }, []);

  function field<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !editingLock.canEdit) return;
    if (!form.project_code.trim() || !form.project_name.trim()) {
      toast.warning("프로젝트 코드와 프로젝트명은 필수입니다.");
      return;
    }
    if (form.start_date && form.end_date && form.start_date > form.end_date) {
      toast.warning("종료예정일은 시작일보다 빠를 수 없습니다.");
      return;
    }
    const quantity = parseProjectQuantity(form.quantity);
    if (form.quantity.trim() && quantity === null) return toast.warning("프로젝트 수량을 숫자로 입력하세요.");
    if (quantity !== null && quantity < 0) return toast.warning("프로젝트 수량은 0 이상이어야 합니다.");

    const payload = {
      project_code: form.project_code.trim(),
      project_name: form.project_name.trim(),
      client_name: form.client_name.trim() || null,
      site_address: form.site_address.trim() || null,
      salesperson: form.salesperson || null,
      task_manager: form.task_manager || null,
      process_type: normalizeProcessTypeCode(form.process_type),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      memo: form.memo.trim() || null,
      quantity,
      quantity_unit: form.quantity_unit.trim() || null,
    };
    const changes = createAuditChanges(project as unknown as Record<string, unknown>, payload, PROJECT_AUDIT_FIELDS);
    const vendorsChanged = JSON.stringify(form.assemblyVendorIds) !== JSON.stringify(initial.assemblyVendorIds);
    if (changes.length === 0 && !vendorsChanged) return onCancel();

    setSaving(true);
    try {
      const { error } = await updateProjectWithVendors(project.id, payload, form.assemblyVendorIds);
      if (error) throw error;
      await addActivity({
        type: "project_update",
        title: `프로젝트 수정 · ${changes.length + (vendorsChanged ? 1 : 0)}개 항목 변경`,
        description: changes.some((change) => change.field === "quantity" || change.field === "quantity_unit")
          ? `프로젝트 수량 변경: ${formatProjectQuantity(project.quantity, project.quantity_unit)} → ${formatProjectQuantity(quantity, payload.quantity_unit)}`
          : `${payload.project_name} 프로젝트 정보를 수정했습니다.`,
        projectId: project.id,
        targetType: "project",
        targetId: project.id,
        metadata: { changes, assemblyVendorIds: form.assemblyVendorIds },
      });
      toast.success("프로젝트 정보가 수정되었습니다.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "프로젝트를 수정하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={submit} className="space-y-5">
    <EditingLockNotice state={editingLock.state} lock={editingLock.lock} error={editingLock.error}/>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold text-slate-700">프로젝트 코드 *<input className={inputClass} value={form.project_code} onChange={(e) => field("project_code", e.target.value)} /></label>
      <label className="text-sm font-semibold text-slate-700">프로젝트명 *<input className={inputClass} value={form.project_name} onChange={(e) => field("project_name", e.target.value)} /></label>
      <label className="text-sm font-semibold text-slate-700">발주처<input className={inputClass} value={form.client_name} onChange={(e) => field("client_name", e.target.value)} /></label>
      <label className="text-sm font-semibold text-slate-700">공정유형<select className={inputClass} value={form.process_type} onChange={(e) => field("process_type", e.target.value)}><option value="">선택</option>{processes.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
      <label className="text-sm font-semibold text-slate-700 sm:col-span-2">현장주소<input className={inputClass} value={form.site_address} onChange={(e) => field("site_address", e.target.value)} /></label>
      <label className="text-sm font-semibold text-slate-700">영업담당<select className={inputClass} value={form.salesperson} onChange={(e) => field("salesperson", e.target.value)}><option value="">선택</option>{salespeople.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="text-sm font-semibold text-slate-700">공무담당<select className={inputClass} value={form.task_manager} onChange={(e) => field("task_manager", e.target.value)}><option value="">선택</option>{managers.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="text-sm font-semibold text-slate-700">조립업체<AssemblyVendorMultiSelect options={vendors} value={form.assemblyVendorIds} onChange={(value) => field("assemblyVendorIds", value)} disabled={saving} /></label>
      <label className="text-sm font-semibold text-slate-700">프로젝트 수량<input type="number" min={0} step="any" className={inputClass} value={form.quantity} onChange={(e) => field("quantity", e.target.value)} /></label>
      <label className="text-sm font-semibold text-slate-700">수량 단위<input className={inputClass} value={form.quantity_unit} onChange={(e) => field("quantity_unit", e.target.value)} placeholder="세대, 개, 짝, SET, 식" /></label>
      <label className="text-sm font-semibold text-slate-700">시작일<input type="date" className={inputClass} value={form.start_date} onChange={(e) => field("start_date", e.target.value)} /></label>
      <label className="text-sm font-semibold text-slate-700">종료예정일<input type="date" className={inputClass} value={form.end_date} onChange={(e) => field("end_date", e.target.value)} /></label>
      <label className="text-sm font-semibold text-slate-700 sm:col-span-2">메모<textarea className={`${inputClass} min-h-24 resize-y`} value={form.memo} onChange={(e) => field("memo", e.target.value)} /></label>
    </div>
    <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white py-3">
      <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">취소</button>
      <button type="submit" disabled={saving || !editingLock.canEdit} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300">{saving && <Loader2 size={15} className="animate-spin" />}{saving ? "저장 중..." : "저장"}</button>
    </div>
  </form>;
}
