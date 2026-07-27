"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { TASK_TAGS, type TaskTagCode } from "@/lib/task-tags";
import { getTaskStatusLabel } from "@/lib/status";

export type GanttBulkEditKind = "assignee" | "status" | "tags";

type EmployeeOption = { id: number; name: string };
type GanttBulkEditModalProps = {
  kind: GanttBulkEditKind;
  taskCount: number;
  initialTags: TaskTagCode[];
  onClose: () => void;
  onSave: (value: string | null | TaskTagCode[]) => Promise<void>;
};

export function GanttBulkEditModal({ kind, taskCount, initialTags, onClose, onSave }: GanttBulkEditModalProps) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedValue, setSelectedValue] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<TaskTagCode>>(() => new Set(initialTags));
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (kind !== "assignee") return;
    let active = true;
    void supabase.from("employees").select("id, name").eq("active", true).order("name").then(({ data, error }) => {
      if (!active) return;
      if (error) setErrorMessage(error.message);
      else setEmployees((data || []) as EmployeeOption[]);
    });
    return () => { active = false; };
  }, [kind]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose]);

  async function save() {
    if (isSaving) return;
    if (kind !== "tags" && !selectedValue) {
      setErrorMessage("변경할 값을 선택하세요.");
      return;
    }
    setIsSaving(true);
    setErrorMessage("");
    try {
      const value = kind === "tags"
        ? TASK_TAGS.map((tag) => tag.code).filter((code) => selectedTags.has(code))
        : selectedValue === "__unassigned__" ? null : selectedValue;
      await onSave(value);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "일괄 변경에 실패했습니다.");
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4" onClick={() => { if (!isSaving) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="gantt-bulk-edit-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <p className="text-xs font-semibold text-blue-600">{taskCount}개 업무 일괄 변경</p>
        <h2 id="gantt-bulk-edit-title" className="mt-1 text-lg font-bold text-slate-950">{kind === "assignee" ? "담당자 변경" : kind === "status" ? "상태 변경" : "태그 변경"}</h2>
        <div className="mt-5">
          {kind === "assignee" && (
            <select value={selectedValue} onChange={(event) => setSelectedValue(event.target.value)} disabled={isSaving} className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100">
              <option value="">담당자 선택</option><option value="__unassigned__">미지정</option>
              {employees.map((employee) => <option key={employee.id} value={employee.name}>{employee.name}</option>)}
            </select>
          )}
          {kind === "status" && (
            <div className="grid grid-cols-3 gap-2">
              {["pending", "in_progress", "completed"].map((status) => <button key={status} type="button" onClick={() => setSelectedValue(status)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${selectedValue === status ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>{getTaskStatusLabel(status)}</button>)}
            </div>
          )}
          {kind === "tags" && (
            <div className="space-y-2">
              <p className="mb-3 text-xs text-slate-500">선택한 태그 구성으로 모든 업무를 맞춥니다.</p>
              {TASK_TAGS.map((tag) => <label key={tag.code} className={`flex items-center justify-between rounded-xl px-3 py-2 ring-1 ${tag.colorClassName}`}><span className="text-sm font-semibold">{tag.icon} {tag.label}</span><input type="checkbox" checked={selectedTags.has(tag.code)} disabled={isSaving} onChange={() => setSelectedTags((current) => { const next = new Set(current); if (next.has(tag.code)) next.delete(tag.code); else next.add(tag.code); return next; })} /></label>)}
            </div>
          )}
        </div>
        {errorMessage && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{errorMessage}</p>}
        <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>취소</Button><Button type="button" variant="primary" onClick={() => void save()} disabled={isSaving}>{isSaving ? "저장 중..." : "저장"}</Button></div>
      </div>
    </div>
  );
}
