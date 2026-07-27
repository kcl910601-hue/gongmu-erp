"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TASK_TAGS, type TaskTagCode } from "@/lib/task-tags";

type TaskTagSelectorProps = {
  projectName: string;
  taskName: string;
  value: TaskTagCode[];
  disabled?: boolean;
  onClose: () => void;
  onSave: (tags: TaskTagCode[]) => Promise<void>;
};

export function TaskTagSelector({ projectName, taskName, value, disabled = false, onClose, onSave }: TaskTagSelectorProps) {
  const [selectedTags, setSelectedTags] = useState<Set<TaskTagCode>>(() => new Set(value));
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const isDirty = TASK_TAGS.some((tag) => selectedTags.has(tag.code) !== value.includes(tag.code));

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose]);

  async function saveTags() {
    if (!isDirty || disabled || isSaving) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      await onSave(TASK_TAGS.map((tag) => tag.code).filter((code) => selectedTags.has(code)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "태그를 저장하지 못했습니다.");
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4" onClick={() => { if (!isSaving) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="task-tag-selector-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <p className="text-xs font-semibold text-blue-600">업무 태그</p>
        <h2 id="task-tag-selector-title" className="mt-1 truncate text-lg font-bold text-slate-950">{projectName}</h2>
        <p className="mt-1 truncate text-sm text-slate-500">{taskName}</p>
        <div className="mt-5 space-y-2">
          {TASK_TAGS.map((tag) => (
            <label key={tag.code} className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 ring-1 ${tag.colorClassName}`}>
              <span className="flex items-center gap-2 text-sm font-semibold"><span>{tag.icon}</span>{tag.label}</span>
              <input type="checkbox" checked={selectedTags.has(tag.code)} disabled={disabled || isSaving} onChange={() => setSelectedTags((current) => { const next = new Set(current); if (next.has(tag.code)) next.delete(tag.code); else next.add(tag.code); return next; })} className="h-4 w-4 rounded border-slate-300" />
            </label>
          ))}
        </div>
        {errorMessage && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{errorMessage}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>취소</Button>
          <Button type="button" variant="primary" onClick={() => void saveTags()} disabled={disabled || isSaving || !isDirty}>{isSaving ? "저장 중..." : "저장"}</Button>
        </div>
      </div>
    </div>
  );
}
