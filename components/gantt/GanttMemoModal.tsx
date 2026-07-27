"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

export type GanttMemoTarget = {
  type: "project" | "task";
  projectId: number;
  projectName: string;
  date: string | null;
  taskId: number | null;
  taskName: string | null;
  memoId: string | null;
  content: string;
};

type GanttMemoModalProps = {
  target: GanttMemoTarget;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
  onDelete: () => Promise<void>;
};

export function GanttMemoModal({ target, onClose, onSave, onDelete }: GanttMemoModalProps) {
  const [content, setContent] = useState(target.content);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose]);

  async function saveMemo() {
    if (!content.trim()) {
      setErrorMessage("메모 내용을 입력하세요.");
      return;
    }
    setIsSaving(true);
    setErrorMessage("");
    try {
      await onSave(content.trim());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "메모를 저장하지 못했습니다.");
      setIsSaving(false);
    }
  }

  async function deleteMemo() {
    if (!target.memoId || !window.confirm("이 메모를 삭제하시겠습니까?")) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      await onDelete();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "메모를 삭제하지 못했습니다.");
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="gantt-memo-title" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5">
          <p className="text-xs font-semibold text-blue-600">{target.type === "task" ? "업무 메모" : "프로젝트 날짜 메모"}</p>
          <h2 id="gantt-memo-title" className="mt-1 text-lg font-bold text-slate-950">{target.projectName}</h2>
          <p className="mt-1 text-sm text-slate-500">{target.taskName || target.date}</p>
        </div>
        <textarea autoFocus value={content} onChange={(event) => setContent(event.target.value)} placeholder="회의 메모를 입력하세요." className="min-h-40 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100" />
        {errorMessage && <p className="mt-2 text-sm font-medium text-red-600">{errorMessage}</p>}
        <div className="mt-5 flex items-center justify-between gap-2">
          <div>{target.memoId && <Button type="button" variant="danger" onClick={() => void deleteMemo()} disabled={isSaving}>삭제</Button>}</div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>취소</Button>
            <Button type="button" variant="primary" onClick={() => void saveMemo()} disabled={isSaving}>{isSaving ? "저장 중..." : "저장"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
