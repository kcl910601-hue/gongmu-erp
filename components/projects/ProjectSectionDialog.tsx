"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ProcessType } from "@/types/process-type";
import type { ProjectSection } from "@/types/project-section";

export type ProjectSectionDialogValue = {
  process_type: string;
  assembly_vendor: string | null;
  task_manager: string | null;
  quantity: number | null;
  start_date: string | null;
  end_date: string | null;
  memo: string | null;
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
};

const inputClass = "h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-300 focus:bg-white";

export function ProjectSectionDialog({ open, mode, processTypes, initialValue, employees, saving, onClose, onSubmit }: Props) {
  const [form, setForm] = useState(initialValue);

  if (!open) return null;

  function submit() {
    if (mode === "add" && !form.process_type) return alert("공정을 선택하세요.");
    if (form.quantity !== null && form.quantity < 0) return alert("수량은 0 이상이어야 합니다.");
    if (form.start_date && form.end_date && form.start_date > form.end_date) return alert("시작일은 종료일보다 늦을 수 없습니다.");
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <h2 className="text-xl font-bold text-slate-950">{mode === "add" ? "공정 추가" : "공정 수정"}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {mode === "add" ? (
            <select className={inputClass} value={form.process_type} onChange={(e) => setForm({ ...form, process_type: e.target.value })}>
              <option value="">새 공정 선택</option>
              {processTypes.map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}
            </select>
          ) : <input className={inputClass} value={form.process_type} disabled aria-label="공정 유형" />}
          <input className={inputClass} placeholder="조립처" value={form.assembly_vendor ?? ""} onChange={(e) => setForm({ ...form, assembly_vendor: e.target.value })} />
          <select className={inputClass} value={form.task_manager ?? ""} onChange={(e) => setForm({ ...form, task_manager: e.target.value })}>
            <option value="">미지정</option>
            {employees.map((employee) => <option key={employee.id} value={employee.name}>{employee.name}</option>)}
          </select>
          <input className={inputClass} type="number" min="0" placeholder="수량" value={form.quantity ?? ""} onChange={(e) => setForm({ ...form, quantity: e.target.value === "" ? null : Number(e.target.value) })} />
          <input className={inputClass} type="date" value={form.start_date ?? ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          <input className={inputClass} type="date" value={form.end_date ?? ""} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          <textarea className="min-h-24 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-300 sm:col-span-2" placeholder="메모" value={form.memo ?? ""} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>
        {mode === "add" && <p className="mt-3 text-xs text-slate-500">업무 목록은 선택한 공정의 템플릿으로 새로 생성됩니다. 기존 공정의 업무와 날짜는 복사되지 않습니다.</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>취소</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
        </div>
      </div>
    </div>
  );
}
