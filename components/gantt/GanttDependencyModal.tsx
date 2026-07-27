"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { IntegratedTask } from "@/components/gantt/IntegratedProjectGantt";

export type GanttDependencyItem = {
  id: string;
  predecessor_task_id: number;
  successor_task_id: number;
  dependency_type: "FS";
};

type Props = {
  task: IntegratedTask;
  projectName: string;
  projectTasks: IntegratedTask[];
  dependencies: GanttDependencyItem[];
  canEdit: boolean;
  onCreate: (predecessorTaskId: number) => Promise<void>;
  onDelete: (dependency: GanttDependencyItem) => Promise<void>;
  onClose: () => void;
};

export function GanttDependencyModal({ task, projectName, projectTasks, dependencies, canEdit, onCreate, onDelete, onClose }: Props) {
  const [predecessorId, setPredecessorId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const currentDependencies = dependencies.filter((item) => item.successor_task_id === task.id);
  const taskName = (id: number) => projectTasks.find((item) => item.id === id)?.task_name || `업무 #${id}`;

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isSaving, onClose]);

  async function run(action: () => Promise<void>) {
    setIsSaving(true);
    setErrorMessage("");
    try {
      await action();
      setPredecessorId("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "선후관계를 저장하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <p className="text-xs font-semibold text-blue-600">선후관계 · FS</p>
        <h2 className="mt-1 text-lg font-bold">{projectName}</h2>
        <p className="text-sm text-slate-500">후행 업무: {task.task_name || "업무"}</p>
        {canEdit && (
          <div className="mt-5 flex gap-2">
            <select value={predecessorId} onChange={(event) => setPredecessorId(event.target.value)} disabled={isSaving} className="h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm">
              <option value="">선행 업무 선택</option>
              {projectTasks
                .filter((item) => item.id !== task.id && !currentDependencies.some((dependency) => dependency.predecessor_task_id === item.id))
                .map((item) => <option key={item.id} value={item.id}>{item.task_name || `업무 #${item.id}`}</option>)}
            </select>
            <Button type="button" variant="primary" disabled={!predecessorId || isSaving} onClick={() => void run(() => onCreate(Number(predecessorId)))}>추가</Button>
          </div>
        )}
        <div className="mt-5 space-y-2">
          {currentDependencies.map((dependency) => (
            <div key={dependency.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm">
              <span>{taskName(dependency.predecessor_task_id)} → {task.task_name || "업무"} · FS</span>
              {canEdit && <Button type="button" size="sm" variant="danger" disabled={isSaving} onClick={() => void run(() => onDelete(dependency))}>삭제</Button>}
            </div>
          ))}
          {currentDependencies.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">등록된 선행 업무가 없습니다.</p>}
        </div>
        {errorMessage && <p className="mt-3 text-sm text-red-600">{errorMessage}</p>}
        <div className="mt-5 flex justify-end"><Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>닫기</Button></div>
      </div>
    </div>
  );
}
