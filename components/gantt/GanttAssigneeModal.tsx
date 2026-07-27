"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import type { IntegratedProject, IntegratedTask } from "@/components/gantt/IntegratedProjectGantt";

type EmployeeOption = {
  id: number;
  name: string;
  position: string | null;
  email: string | null;
};

type GanttAssigneeModalProps = {
  project: IntegratedProject;
  task: IntegratedTask;
  onClose: () => void;
  onSave: (assignee: string | null) => Promise<void>;
};

const UNASSIGNED_VALUE = "__unassigned__";

export function GanttAssigneeModal({ project, task, onClose, onSave }: GanttAssigneeModalProps) {
  const initialValue = task.assignee || UNASSIGNED_VALUE;
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedValue, setSelectedValue] = useState(initialValue);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;
    async function loadEmployees() {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, position, email")
        .eq("active", true)
        .order("name", { ascending: true });
      if (!isActive) return;
      if (error) {
        setErrorMessage(error.message);
      } else {
        setEmployees((data || []) as EmployeeOption[]);
      }
      setIsLoading(false);
    }
    void loadEmployees();
    return () => { isActive = false; };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose]);

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("ko-KR");
    if (!query) return employees;
    return employees.filter((employee) =>
      [employee.name, employee.position, employee.email]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase("ko-KR").includes(query))
    );
  }, [employees, searchQuery]);
  const currentAssigneeIsListed = task.assignee
    ? filteredEmployees.some((employee) => employee.name === task.assignee)
    : true;

  async function saveAssignee() {
    if (selectedValue === initialValue || isSaving) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      await onSave(selectedValue === UNASSIGNED_VALUE ? null : selectedValue);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "담당자를 저장하지 못했습니다.");
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4" onClick={() => { if (!isSaving) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="gantt-assignee-title" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <p className="text-xs font-semibold text-blue-600">담당자 변경</p>
        <h2 id="gantt-assignee-title" className="mt-1 truncate text-lg font-bold text-slate-950">{project.project_name}</h2>
        <p className="mt-1 truncate text-sm text-slate-500">{task.task_name || "업무명 없음"}</p>

        <div className="mt-5 rounded-2xl bg-slate-50 p-3 text-sm">
          <span className="text-slate-500">현재 담당자</span>
          <strong className="ml-2 text-slate-900">{task.assignee || "미지정"}</strong>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-500">직원 검색</span>
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="이름, 직급, 이메일 검색" className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100" />
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-500">변경할 담당자</span>
          <select value={selectedValue} onChange={(event) => setSelectedValue(event.target.value)} disabled={isLoading || isSaving} className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100">
            <option value={UNASSIGNED_VALUE}>미지정</option>
            {task.assignee && !currentAssigneeIsListed && (
              <option value={task.assignee}>{task.assignee} · 현재 담당자</option>
            )}
            {filteredEmployees.map((employee) => (
              <option key={employee.id} value={employee.name}>{employee.name}{employee.position ? ` · ${employee.position}` : ""}{employee.email ? ` · ${employee.email}` : ""}</option>
            ))}
          </select>
          {!isLoading && filteredEmployees.length === 0 && <p className="mt-2 text-sm text-slate-500">검색 결과가 없습니다.</p>}
        </label>

        {errorMessage && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{errorMessage}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>취소</Button>
          <Button type="button" variant="primary" onClick={() => void saveAssignee()} disabled={isLoading || isSaving || selectedValue === initialValue}>{isSaving ? "저장 중..." : "저장"}</Button>
        </div>
      </div>
    </div>
  );
}
