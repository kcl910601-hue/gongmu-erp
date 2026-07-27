"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/Button";
import type { ProcessType } from "@/types/process-type";
import type { ProjectSection } from "@/types/project-section";
import { normalizeProcessTypeCode } from "@/lib/process-types";

export type ProjectSectionDialogValue = {
  process_type: string;
  assembly_vendor: string | null;
  task_manager: string | null;
  quantity: number | null;
  start_date: string | null;
  end_date: string | null;
  memo: string | null;
  targetAssemblyVendorIds: number[] | null;
};

type Props = {
  open: boolean;
  mode: "add" | "edit";
  processTypes: ProcessType[];
  initialValue: ProjectSectionDialogValue;
  employees: Array<{ id: number; name: string }>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (value: ProjectSectionDialogValue) => void;
  section?: ProjectSection | null;
  assemblyVendorLocked?: boolean;
  assemblyVendors: Array<{ id: number; organizationName: string }>;
};

const inputClass = "h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-300 focus:bg-white";

function normalizeCompletedDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return undefined;
  return trimmed;
}

function DateDraftInput({ label, initialValue, inputRef }: { label: string; initialValue: string; inputRef: RefObject<HTMLInputElement | null> }) {
  return <div className="flex gap-2">
    <input
      ref={inputRef}
      className={inputClass}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="YYYY-MM-DD"
      defaultValue={initialValue}
      aria-label={`${label} 직접 입력`}
    />
    <input
      className="h-10 w-12 shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-2 outline-none focus:border-blue-300 focus:bg-white"
      type="date"
      defaultValue={normalizeCompletedDate(initialValue) ?? ""}
      onChange={(event) => {
        if (inputRef.current) inputRef.current.value = event.target.value;
      }}
      aria-label={`${label} 달력 선택`}
    />
  </div>;
}

export function ProjectSectionDialog({ open, mode, processTypes, initialValue, employees, saving, onClose, onSubmit, assemblyVendorLocked = false, assemblyVendors }: Props) {
  const [form, setForm] = useState(initialValue);
  const startDateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!saving) submitLockRef.current = false;
  }, [saving]);

  if (!open) return null;

  function submit() {
    if (saving || submitLockRef.current) return;
    const completedStartDate = normalizeCompletedDate(startDateInputRef.current?.value ?? "");
    const completedEndDate = normalizeCompletedDate(endDateInputRef.current?.value ?? "");
    if (completedStartDate === undefined || completedEndDate === undefined) return alert("날짜를 YYYY-MM-DD 형식으로 끝까지 입력하세요.");
    const completedForm = {
      ...form,
      start_date: completedStartDate,
      end_date: completedEndDate,
    };
    if (mode === "add" && !completedForm.process_type) return alert("공정을 선택하세요.");
    if (mode === "add" && completedForm.targetAssemblyVendorIds?.length === 0) return alert("적용할 조립업체를 선택하세요.");
    if (completedForm.quantity !== null && completedForm.quantity < 0) return alert("수량은 0 이상이어야 합니다.");
    if (completedForm.start_date && completedForm.end_date && completedForm.start_date > completedForm.end_date) return alert("시작일은 종료일보다 늦을 수 없습니다.");
    submitLockRef.current = true;
    onSubmit({ ...completedForm, process_type: normalizeProcessTypeCode(completedForm.process_type) });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <h2 className="text-xl font-bold text-slate-950">{mode === "add" ? "공정 추가" : "공정 수정"}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {mode === "add" ? (
            <select className={inputClass} value={form.process_type} onChange={(e) => setForm({ ...form, process_type: e.target.value })}>
              <option value="">새 공정 선택</option>
              {processTypes.map((item) => <option key={item.id} value={normalizeProcessTypeCode(item.code)}>{normalizeProcessTypeCode(item.name)}</option>)}
            </select>
          ) : <input className={inputClass} value={form.process_type} disabled aria-label="공정 유형" />}
          <input className={inputClass} placeholder="조립처" value={form.assembly_vendor ?? ""} onChange={(e) => setForm({ ...form, assembly_vendor: e.target.value })} disabled={assemblyVendorLocked} />
          <select className={inputClass} value={form.task_manager ?? ""} onChange={(e) => setForm({ ...form, task_manager: e.target.value })}>
            <option value="">미지정</option>
            {employees.map((employee) => <option key={employee.id} value={employee.name}>{employee.name}</option>)}
          </select>
          <input className={inputClass} type="number" min="0" placeholder="수량" value={form.quantity ?? ""} onChange={(e) => setForm({ ...form, quantity: e.target.value === "" ? null : Number(e.target.value) })} />
          <DateDraftInput label="시작일" initialValue={initialValue.start_date ?? ""} inputRef={startDateInputRef} />
          <DateDraftInput label="종료일" initialValue={initialValue.end_date ?? ""} inputRef={endDateInputRef} />
          <textarea className="min-h-24 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-300 sm:col-span-2" placeholder="메모" value={form.memo ?? ""} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>
        {mode === "add" && assemblyVendors.length > 0 && (
          <fieldset className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <legend className="px-1 text-sm font-semibold text-slate-700">적용 대상</legend>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="section-vendor-scope"
                checked={form.targetAssemblyVendorIds === null}
                onChange={() => setForm({ ...form, targetAssemblyVendorIds: null })}
              />
              모든 조립업체 (기본)
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="section-vendor-scope"
                checked={form.targetAssemblyVendorIds !== null}
                onChange={() => setForm({ ...form, targetAssemblyVendorIds: [assemblyVendors[0].id] })}
              />
              선택한 조립업체만
            </label>
            {form.targetAssemblyVendorIds !== null && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {assemblyVendors.map((vendor) => (
                  <label key={vendor.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.targetAssemblyVendorIds?.includes(vendor.id) ?? false}
                      onChange={(event) => {
                        const current = form.targetAssemblyVendorIds ?? [];
                        const next = event.target.checked
                          ? [...current, vendor.id]
                          : current.filter((id) => id !== vendor.id);
                        setForm({ ...form, targetAssemblyVendorIds: next });
                      }}
                    />
                    {vendor.organizationName}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}
        {mode === "add" && <p className="mt-3 text-xs text-slate-500">업무 목록은 선택한 공정의 템플릿으로 새로 생성됩니다. 기존 공정의 업무와 날짜는 복사되지 않습니다.</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>취소</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
        </div>
      </div>
    </div>
  );
}
