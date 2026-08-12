"use client";

import Link from "next/link";
import { AlertTriangle, CheckSquare, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { PERSONAL_NOTES_CHANGED_EVENT, isOverduePersonalTodo, isTodayPersonalTodo, type PersonalNote } from "@/lib/personal-notes";
import { getLocalDateString } from "@/lib/task-priority";

export function MorningBriefWorkspaceSummary() {
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const today = getLocalDateString();
  const load = useCallback(async () => {
    const noteResponse = await fetch("/api/personal-notes", { cache: "no-store" });
    if (noteResponse.ok) { const result = await noteResponse.json() as { notes?: PersonalNote[] }; setNotes(result.notes ?? []); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); window.addEventListener(PERSONAL_NOTES_CHANGED_EVENT, load); return () => { window.clearTimeout(timer); window.removeEventListener(PERSONAL_NOTES_CHANGED_EVENT, load); }; }, [load]);
  const buckets = useMemo(() => {
    return { today: notes.filter((note) => isTodayPersonalTodo(note, today)).length, overdue: notes.filter((note) => isOverduePersonalTodo(note, today)).length };
  }, [notes, today]);
  return <div className="mt-5 border-t border-slate-100 pt-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-900">개인 Todo 요약</h3><p className="mt-0.5 text-xs text-slate-400">상세 처리와 관리는 My Workspace에서 합니다.</p></div><Link href="/?workspace=personal#my-workspace" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">My Workspace <ChevronRight size={13}/></Link></div><div className="grid grid-cols-2 gap-2"><SummaryCount label="오늘 Todo" value={buckets.today} icon={<CheckSquare size={14}/>} /><SummaryCount label="지연 Todo" value={buckets.overdue} overdue icon={<AlertTriangle size={14}/>} /></div></div>;
}

function SummaryCount({ label, value, icon, overdue = false }: { label: string; value: number; icon: ReactNode; overdue?: boolean }) {
  return <Link href="/?workspace=personal#my-workspace" className={`flex min-w-0 items-center justify-between rounded-xl border p-3 ${overdue ? "border-red-100 bg-red-50 text-red-700" : "border-slate-100 bg-slate-50 text-slate-700"}`}><span className="flex min-w-0 items-center gap-2 text-xs font-semibold">{icon}<span className="truncate">{label}</span></span><strong className="text-lg">{value}</strong></Link>;
}
