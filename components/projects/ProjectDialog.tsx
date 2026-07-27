"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { ProjectCreateForm } from "@/components/projects/ProjectCreateForm";
import { ProjectEditForm } from "@/components/projects/ProjectEditForm";
import type { ProjectListItem } from "@/lib/projects";

type Props = {
  open: boolean;
  project: ProjectListItem | null;
  onClose: () => void;
  onSaved: () => void;
};

export function ProjectDialog({ open, project, onClose, onSaved }: Props) {
  const [dirty, setDirty] = useState(false);
  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("작성 중인 내용이 있습니다. 닫으시겠습니까?")) return;
    setDirty(false);
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose]);

  if (!open) return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="project-dialog-title" className="text-2xl font-bold text-slate-950">{project ? "프로젝트 정보 수정" : "신규 프로젝트 등록"}</h2>
        <button type="button" onClick={requestClose} aria-label="닫기" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={19} /></button>
      </div>
      {project ? <ProjectEditForm project={project} onCancel={requestClose} onDirtyChange={setDirty} onSaved={() => { setDirty(false); onSaved(); }} /> : <ProjectCreateForm onCancel={requestClose} onDirtyChange={setDirty} onSuccess={() => { setDirty(false); onSaved(); }} />}
    </section>
  </div>;
}
