"use client";

import { CheckSquare, Pin } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PERSONAL_NOTES_CHANGED_EVENT, selectPersonalNotesForBrief, type PersonalNote } from "@/lib/personal-notes";

export function MorningBriefWorkspaceSummary() {
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const load = useCallback(async () => {
    const response = await fetch("/api/personal-notes", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as { notes?: PersonalNote[] };
    setNotes(result.notes ?? []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    window.addEventListener(PERSONAL_NOTES_CHANGED_EVENT, load);
    return () => { window.clearTimeout(timer); window.removeEventListener(PERSONAL_NOTES_CHANGED_EVENT, load); };
  }, [load]);

  const brief = selectPersonalNotesForBrief(notes);
  return <div className="mt-5 border-t border-slate-100 pt-4">
    <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">My Workspace</h3><span className="text-xs text-slate-400">더보기는 아래 Widget에서 확인</span></div>
    <div className="grid gap-3 md:grid-cols-2">
      <BriefList title="📌 내 메모" notes={brief.memos}/>
      <BriefList title="✅ 오늘 할 일" notes={brief.todos} todo/>
    </div>
  </div>;
}

function BriefList({ title, notes, todo = false }: { title: string; notes: PersonalNote[]; todo?: boolean }) {
  return <div className="rounded-xl bg-slate-50 p-3"><h4 className="mb-2 text-xs font-bold text-slate-600">{title}</h4>{notes.length === 0 ? <p className="text-xs text-slate-400">등록된 항목이 없습니다.</p> : <ul className="space-y-1.5">{notes.map((note) => <li key={note.id} className="flex items-center gap-2 text-sm text-slate-700">{todo ? <CheckSquare size={14} className="shrink-0 text-slate-400"/> : note.is_pinned ? <Pin size={13} className="shrink-0 text-blue-600"/> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300"/>}<span className="truncate">{note.title || note.content}</span></li>)}</ul>}</div>;
}
