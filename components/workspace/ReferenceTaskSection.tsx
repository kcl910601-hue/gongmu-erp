"use client";

import Link from "next/link";
import { Check, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { COMMENTS_CHANGED_EVENT, PERSONAL_NOTES_CHANGED_EVENT, REFERENCE_TASKS_CHANGED_EVENT } from "@/lib/collaboration-events";
import type { ReferenceTask } from "@/lib/reference-tasks";
import { toast } from "@/lib/toast";

export function ReferenceTaskSection() {
  const [tasks, setTasks] = useState<ReferenceTask[]>([]);
  const [error, setError] = useState("");
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const load = useCallback(async () => {
    const response = await fetch("/api/reference-tasks", { cache: "no-store" });
    const result = await response.json() as { tasks?: ReferenceTask[]; error?: string };
    if (!response.ok) { setError(result.error ?? "요청받은 작업을 불러오지 못했습니다."); return; }
    setTasks(result.tasks ?? []); setError("");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    window.addEventListener(REFERENCE_TASKS_CHANGED_EVENT, load);
    window.addEventListener(COMMENTS_CHANGED_EVENT, load);
    window.addEventListener(PERSONAL_NOTES_CHANGED_EVENT, load);
    return () => { window.clearTimeout(timer); window.removeEventListener(REFERENCE_TASKS_CHANGED_EVENT, load); window.removeEventListener(COMMENTS_CHANGED_EVENT, load); window.removeEventListener(PERSONAL_NOTES_CHANGED_EVENT, load); };
  }, [load]);

  async function toggle(task: ReferenceTask) {
    if (pendingIds.has(task.id)) return;
    const completed = task.status !== "completed";
    const previous = tasks;
    setPendingIds((current) => new Set(current).add(task.id));
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: completed ? "completed" : "pending", completedAt: completed ? new Date().toISOString() : null } : item));
    const response = await fetch(`/api/reference-tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed }) });
    if (!response.ok) { setTasks(previous); toast.error("완료 상태를 변경하지 못했습니다."); }
    setPendingIds((current) => { const next = new Set(current); next.delete(task.id); return next; });
  }

  async function remove(task: ReferenceTask) {
    if (!window.confirm("이 작업을 내 할 일에서 삭제하시겠습니까?")) return;
    const previous = tasks;
    setTasks((current) => current.filter((item) => item.id !== task.id));
    const response = await fetch(`/api/reference-tasks/${task.id}`, { method: "DELETE" });
    if (!response.ok) { setTasks(previous); toast.error("내 할 일을 삭제하지 못했습니다."); }
  }

  return <div className="mt-3 rounded-xl bg-violet-50 p-3"><h3 className="text-xs font-bold text-violet-700">요청받은 작업 <span className="text-violet-400">{tasks.length}</span></h3>{error && <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">{error}</p>}<div className="mt-2 space-y-2">{tasks.length === 0 ? <p className="py-3 text-center text-xs text-slate-400">추가한 참조 작업이 없습니다.</p> : tasks.map((task) => <article key={task.id} className="rounded-xl border border-violet-100 bg-white p-3"><div className="flex items-start gap-2"><button type="button" disabled={pendingIds.has(task.id)} onClick={() => void toggle(task)} aria-label="완료 전환" className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${task.status === "completed" ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>{task.status === "completed" && <Check size={13}/>}</button><div className="min-w-0 flex-1">{task.source ? <><p className={`text-sm font-semibold ${task.status === "completed" ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.source.itemTitle}</p><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-slate-600">{task.source.authorName}님 · {task.source.content}</p><Link href={`/calendar?personalNote=${task.source.itemId}#comment-${task.source.commentId}`} className="mt-2 inline-block text-[11px] font-semibold text-blue-600 hover:underline">원본 댓글 보기</Link></> : <><p className="text-sm font-semibold text-slate-500">삭제된 원본</p><p className="mt-1 text-xs text-slate-400">원본 댓글 또는 일정이 삭제되었거나 더 이상 접근할 수 없습니다.</p></>}</div><button type="button" onClick={() => void remove(task)} aria-label="참조 작업 삭제" className="rounded-lg p-1 text-slate-400 hover:text-red-600"><Trash2 size={13}/></button></div></article>)}</div></div>;
}
