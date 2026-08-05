"use client";

import { Pencil, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useState } from "react";
import { addReferenceTask, type ReferenceTask, type ReferenceTaskOptions, type ReferenceTaskPriority } from "@/lib/reference-tasks";
import { toast } from "@/lib/toast";

function localDate(offset = 0) { const date = new Date(); date.setDate(date.getDate() + offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

function ReferenceTaskOptionsDialog({ title, initial, saving, onClose, onSave }: { title: string; initial: ReferenceTaskOptions; saving: boolean; onClose: () => void; onSave: (options: ReferenceTaskOptions) => void }) {
  const [taskTitle, setTaskTitle] = useState(initial.title);
  const [dueDate, setDueDate] = useState(initial.dueDate ?? "");
  const [priority, setPriority] = useState<ReferenceTaskPriority>(initial.priority);
  return createPortal(<div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">{title}</h2><button type="button" disabled={saving} onClick={onClose} className="rounded-lg p-1 text-slate-400"><X size={17}/></button></div><label className="mt-4 block text-xs font-semibold text-slate-600">제목<input value={taskTitle} maxLength={200} onChange={(event) => setTaskTitle(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"/></label><div className="mt-3"><p className="text-xs font-semibold text-slate-600">마감일</p><div className="mt-1 flex flex-wrap gap-1">{[["오늘", localDate()], ["내일", localDate(1)], ["미지정", ""]].map(([label, value]) => <button key={label} type="button" onClick={() => setDueDate(value)} className={`rounded-lg px-2 py-1 text-xs ${dueDate === value ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}>{label}</button>)}</div><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"/></div><div className="mt-3"><p className="text-xs font-semibold text-slate-600">우선순위</p><div className="mt-1 grid grid-cols-3 gap-1">{([['low','낮음'],['normal','보통'],['high','높음']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setPriority(value)} className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${priority === value ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}>{label}</button>)}</div></div><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="rounded-xl px-3 py-2 text-sm text-slate-500">취소</button><button type="button" disabled={saving || !taskTitle.trim()} onClick={() => onSave({ title: taskTitle.trim(), dueDate: dueDate || null, priority })} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{saving ? "저장 중..." : "저장"}</button></div></section></div>, document.body);
}

export function AddReferenceTaskButton({ commentId, defaultTitle, added = false, onAdded }: { commentId: number; defaultTitle: string; added?: boolean; onAdded?: (commentId: number, task: ReferenceTask) => void }) {
  const [isAdded, setIsAdded] = useState(added);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  async function save(options: ReferenceTaskOptions) {
    setSaving(true);
    try { const result = await addReferenceTask(commentId, options); setIsAdded(true); setOpen(false); onAdded?.(commentId, result.task); toast.success(result.created ? "내 할 일에 추가했습니다." : "이미 내 할 일에 추가되어 있습니다."); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "내 할 일에 추가하지 못했습니다."); }
    setSaving(false);
  }
  return <>{<button type="button" disabled={isAdded} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(true); }} className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-[10px] font-semibold text-violet-700 disabled:border-slate-200 disabled:text-slate-400">{isAdded ? "내 할 일에 추가됨" : "내 할 일에 추가"}</button>}{open && <ReferenceTaskOptionsDialog title="내 할 일에 추가" initial={{ title: defaultTitle.slice(0, 200) || "요청받은 작업", dueDate: null, priority: "normal" }} saving={saving} onClose={() => setOpen(false)} onSave={(options) => void save(options)}/>}</>;
}

export function EditReferenceTaskButton({ task, onSaved }: { task: ReferenceTask; onSaved: () => void }) {
  const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false);
  async function save(options: ReferenceTaskOptions) { setSaving(true); const response = await fetch(`/api/reference-tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(options) }); if (!response.ok) { const result = await response.json() as { error?: string }; toast.error(result.error ?? "내 할 일을 수정하지 못했습니다."); } else { setOpen(false); onSaved(); toast.success("내 할 일을 수정했습니다."); } setSaving(false); }
  return <><button type="button" onClick={() => setOpen(true)} aria-label="참조 작업 수정" className="rounded-lg p-1 text-slate-400 hover:text-violet-600"><Pencil size={13}/></button>{open && <ReferenceTaskOptionsDialog title="내 할 일 수정" initial={{ title: task.title, dueDate: task.dueDate, priority: task.priority }} saving={saving} onClose={() => setOpen(false)} onSave={(options) => void save(options)}/>}</>;
}
