"use client";

import Link from "next/link";
import { AlertTriangle, CheckSquare, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PERSONAL_NOTES_CHANGED_EVENT, isOverduePersonalTodo, isTodayPersonalTodo, type PersonalNote } from "@/lib/personal-notes";
import { REFERENCE_TASKS_CHANGED_EVENT } from "@/lib/collaboration-events";
import { getLocalDateString } from "@/lib/task-priority";
import { getReferenceTaskDueState, type ReferenceTask } from "@/lib/reference-tasks";

type BriefItem = { id: string; title: string; source: "개인 Todo" | "Reference Task"; dueDate: string; href: string; pinned: boolean };

export function MorningBriefWorkspaceSummary() {
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [referenceTasks, setReferenceTasks] = useState<ReferenceTask[]>([]);
  const today = getLocalDateString();
  const load = useCallback(async () => {
    const [noteResponse, referenceResponse] = await Promise.all([fetch("/api/personal-notes", { cache: "no-store" }), fetch("/api/reference-tasks", { cache: "no-store" })]);
    if (noteResponse.ok) { const result = await noteResponse.json() as { notes?: PersonalNote[] }; setNotes(result.notes ?? []); }
    if (referenceResponse.ok) { const result = await referenceResponse.json() as { tasks?: ReferenceTask[] }; setReferenceTasks(result.tasks ?? []); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); window.addEventListener(PERSONAL_NOTES_CHANGED_EVENT, load); window.addEventListener(REFERENCE_TASKS_CHANGED_EVENT, load); return () => { window.clearTimeout(timer); window.removeEventListener(PERSONAL_NOTES_CHANGED_EVENT, load); window.removeEventListener(REFERENCE_TASKS_CHANGED_EVENT, load); }; }, [load]);
  const buckets = useMemo(() => {
    const personalToday: BriefItem[] = notes.filter((note) => isTodayPersonalTodo(note, today)).map((note) => ({ id: `personal-${note.id}`, title: note.title || note.content, source: "개인 Todo", dueDate: today, href: "/?workspace=personal", pinned: note.is_pinned }));
    const personalOverdue: BriefItem[] = notes.filter((note) => isOverduePersonalTodo(note, today)).map((note) => ({ id: `personal-${note.id}`, title: note.title || note.content, source: "개인 Todo", dueDate: note.due_date ?? today, href: "/?workspace=personal", pinned: note.is_pinned }));
    const referenceToday: BriefItem[] = referenceTasks.filter((task) => task.status !== "completed" && getReferenceTaskDueState(task.dueDate, today) === "today").map((task) => ({ id: `reference-${task.id}`, title: task.title, source: "Reference Task", dueDate: task.dueDate ?? today, href: task.source ? `/calendar?personalNote=${task.source.itemId}#comment-${task.source.commentId}` : "/?workspace=personal#reference-tasks", pinned: false }));
    const referenceOverdue: BriefItem[] = referenceTasks.filter((task) => task.status !== "completed" && getReferenceTaskDueState(task.dueDate, today) === "overdue").map((task) => ({ id: `reference-${task.id}`, title: task.title, source: "Reference Task", dueDate: task.dueDate ?? today, href: task.source ? `/calendar?personalNote=${task.source.itemId}#comment-${task.source.commentId}` : "/?workspace=personal#reference-tasks", pinned: false }));
    return { today: [...personalToday, ...referenceToday].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.source.localeCompare(b.source)).slice(0, 5), overdue: [...personalOverdue, ...referenceOverdue].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5) };
  }, [notes, referenceTasks, today]);
  return <div className="mt-5 border-t border-slate-100 pt-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">개인 업무 브리핑</h3><span className="text-xs text-slate-400">My Workspace와 동일한 날짜 기준</span></div><div className="grid gap-3 md:grid-cols-2"><BriefList title={`오늘 할 일 ${buckets.today.length}`} items={buckets.today}/><BriefList title={`지연 항목 ${buckets.overdue.length}`} items={buckets.overdue} overdue/></div></div>;
}

function BriefList({ title, items, overdue = false }: { title: string; items: BriefItem[]; overdue?: boolean }) {
  return <div className={`rounded-xl p-3 ${overdue ? "bg-red-50" : "bg-slate-50"}`}><h4 className={`mb-2 flex items-center gap-1.5 text-xs font-bold ${overdue ? "text-red-700" : "text-slate-700"}`}>{overdue ? <AlertTriangle size={13}/> : <CheckSquare size={13}/>} {title}</h4>{items.length === 0 ? <p className="text-xs text-slate-400">해당 항목이 없습니다.</p> : <ul className="space-y-1.5">{items.map((item) => <li key={item.id}><Link href={item.href} className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-sm text-slate-700 hover:bg-white"><span className="min-w-0 flex-1 truncate">{item.title}</span><span className="shrink-0 text-[10px] text-slate-500">{item.source} · {item.dueDate}</span><ExternalLink size={11} className="shrink-0 text-slate-400"/></Link></li>)}</ul>}</div>;
}
