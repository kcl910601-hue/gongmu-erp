"use client";

import { Check, Plus, Search, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PERSONAL_NOTES_CHANGED_EVENT, dispatchPersonalNotesChanged, getPersonalNoteAccess, openNoteEditor, sortPersonalNotes, type NoteEditorPreset, type PersonalNote, type PersonalNoteColor } from "@/lib/personal-notes";
import { ShareDialog } from "@/components/sharing/ShareDialog";
import { ShareInvitationList } from "@/components/sharing/ShareInvitationList";
import { CommentSection } from "@/components/comments/CommentSection";
import { TimelineSection } from "@/components/timeline/TimelineSection";
import { PersonalNoteActions } from "@/components/workspace/PersonalNoteActions";
import { useAppShellUser } from "@/contexts/AppShellUserContext";
import { COMMENT_COUNT_DELTA_EVENT, COMMENT_COUNTS_INVALIDATED_EVENT, COMMENT_UNREAD_CLEARED_EVENT } from "@/lib/collaboration-events";
import { applyCommentCounts, loadCommentCounts } from "@/lib/comment-counts";
import { withShortEditingLock } from "@/lib/editing-locks";
import { ReferenceTaskSection } from "@/components/workspace/ReferenceTaskSection";

const colorClass: Record<PersonalNoteColor, string> = { default: "border-slate-200 bg-white", yellow: "border-amber-200 bg-amber-50", red: "border-red-200 bg-red-50", green: "border-emerald-200 bg-emerald-50", blue: "border-blue-200 bg-blue-50" };

export default function PersonalWorkspace() {
  const { employee } = useAppShellUser();
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [shareTarget, setShareTarget] = useState<PersonalNote | null>(null);
  const [sharingRefreshKey, setSharingRefreshKey] = useState(0);
  const load = useCallback(async () => { const response = await fetch("/api/personal-notes", { cache: "no-store" }); const result = await response.json() as { notes?: PersonalNote[]; error?: string }; if (!response.ok) { setError(result.error ?? "My Workspace를 불러오지 못했습니다."); return; } setNotes(sortPersonalNotes(result.notes ?? [])); setError(""); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); window.addEventListener(PERSONAL_NOTES_CHANGED_EVENT, load); return () => { window.clearTimeout(timer); window.removeEventListener(PERSONAL_NOTES_CHANGED_EVENT, load); }; }, [load]);
  const filtered = useMemo(() => { const keyword = search.trim().toLocaleLowerCase("ko-KR"); return notes.filter((note) => !keyword || note.title.toLocaleLowerCase("ko-KR").includes(keyword) || note.content.toLocaleLowerCase("ko-KR").includes(keyword)); }, [notes, search]);
  const pinned = filtered.filter((note) => note.is_pinned);
  const memos = filtered.filter((note) => !note.is_pinned && note.note_type === "memo");
  const openTodos = filtered.filter((note) => !note.is_pinned && note.note_type === "todo" && !note.is_completed);
  const completedTodos = filtered.filter((note) => !note.is_pinned && note.note_type === "todo" && note.is_completed);
  const noteIdsKey = notes.map((note) => note.id).join(",");
  useEffect(() => {
    function handleDelta(event: Event) {
      const detail = (event as CustomEvent<{ itemId: string; delta: number }>).detail;
      if (!detail) return;
      setNotes((current) => current.map((note) => note.id === detail.itemId ? { ...note, comment_count: Math.max(0, (note.comment_count ?? 0) + detail.delta) } : note));
    }
    function handleUnreadCleared(event: Event) {
      const itemId = (event as CustomEvent<{ itemId: string }>).detail?.itemId;
      if (itemId) setNotes((current) => current.map((note) => note.id === itemId ? { ...note, unread_comment_count: 0 } : note));
    }
    async function refreshCounts() {
      try {
        const counts = await loadCommentCounts(noteIdsKey ? noteIdsKey.split(",") : []);
        setNotes((current) => applyCommentCounts(current, counts));
      } catch { /* 다음 Realtime 이벤트 또는 일반 데이터 갱신에서 재시도합니다. */ }
    }
    window.addEventListener(COMMENT_COUNT_DELTA_EVENT, handleDelta);
    window.addEventListener(COMMENT_COUNTS_INVALIDATED_EVENT, refreshCounts);
    window.addEventListener(COMMENT_UNREAD_CLEARED_EVENT, handleUnreadCleared);
    return () => {
      window.removeEventListener(COMMENT_COUNT_DELTA_EVENT, handleDelta);
      window.removeEventListener(COMMENT_COUNTS_INVALIDATED_EVENT, refreshCounts);
      window.removeEventListener(COMMENT_UNREAD_CLEARED_EVENT, handleUnreadCleared);
    };
  }, [noteIdsKey]);
  async function patchNote(note: PersonalNote, changes: Record<string, unknown>) { const previous = notes; setNotes(sortPersonalNotes(notes.map((item) => item.id === note.id ? { ...item, is_completed: typeof changes.isCompleted === "boolean" ? changes.isCompleted : item.is_completed, is_pinned: typeof changes.isPinned === "boolean" ? changes.isPinned : item.is_pinned } : item))); try { await withShortEditingLock("personal_note", note.id, async () => { const response = await fetch(`/api/personal-notes/${note.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) }); if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error ?? "변경사항을 저장하지 못했습니다."); } }); dispatchPersonalNotesChanged(); } catch (cause) { setNotes(previous); setError(cause instanceof Error ? cause.message : "변경사항을 저장하지 못했습니다."); } }
  async function deleteNote(note: PersonalNote) { const previous = notes; setNotes((current) => current.filter((item) => item.id !== note.id)); const response = await fetch(`/api/personal-notes/${note.id}`, { method: "DELETE" }); if (!response.ok) { setNotes(previous); setError("메모를 삭제하지 못했습니다."); return; } dispatchPersonalNotesChanged(); }
  return <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div><h2 className="text-lg font-bold text-slate-950">My Workspace</h2><p className="mt-0.5 text-xs text-slate-500">프로젝트와 분리된 나만의 메모와 할 일</p></div><label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"><Search size={15} className="text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="제목과 내용 검색" className="w-full bg-transparent text-sm outline-none"/></label><ShareInvitationList refreshKey={sharingRefreshKey}/><ReferenceTaskSection/>{error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}<div className="mt-3 grid gap-3 xl:grid-cols-2"><NoteSection title="📌 고정 메모" preset="sticky" notes={pinned} ownerName={employee?.name ?? "-"} onPatch={patchNote} onDelete={deleteNote} onShare={setShareTarget}/><NoteSection title="✅ Todo" preset="todo" notes={openTodos} ownerName={employee?.name ?? "-"} onPatch={patchNote} onDelete={deleteNote} onShare={setShareTarget}/><NoteSection title="📝 메모" preset="memo" notes={memos} ownerName={employee?.name ?? "-"} onPatch={patchNote} onDelete={deleteNote} onShare={setShareTarget}/><NoteSection title="완료한 할 일" notes={completedTodos} ownerName={employee?.name ?? "-"} onPatch={patchNote} onDelete={deleteNote} onShare={setShareTarget}/></div>{shareTarget && <ShareDialog note={shareTarget} onClose={() => setShareTarget(null)} onChanged={() => { setSharingRefreshKey((value) => value + 1); void load(); }}/>}</section>;
}

function NoteSection({ title, preset, notes, ownerName, onPatch, onDelete, onShare }: { title: string; preset?: NoteEditorPreset; notes: PersonalNote[]; ownerName: string; onPatch: (note: PersonalNote, changes: Record<string, unknown>) => Promise<void>; onDelete: (note: PersonalNote) => Promise<void>; onShare: (note: PersonalNote) => void }) {
  const [commentNoteId, setCommentNoteId] = useState<string | null>(null);
  const [timelineNoteId, setTimelineNoteId] = useState<string | null>(null);
  return <div className="rounded-xl bg-slate-50 p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-bold text-slate-600">{title} <span className="text-slate-400">{notes.length}</span></h3>{preset && <button type="button" aria-label={`${title} 추가`} onClick={() => openNoteEditor(preset)} className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm hover:bg-blue-50"><Plus size={14}/></button>}</div><div className="space-y-2">{notes.length === 0 ? <p className="py-2 text-center text-xs text-slate-400">등록된 항목이 없습니다.</p> : notes.map((note) => { const canEdit = getPersonalNoteAccess(note).canEdit; const commentsOpen = commentNoteId === note.id; const timelineOpen = timelineNoteId === note.id; const displayedOwnerName = note.sharing?.ownerName ?? ownerName; const sharedMemberCount = note.sharing?.memberCount ?? 0; return <article key={note.id} className={`rounded-xl border p-3 ${colorClass[note.color]}`}><div className="flex items-start gap-2">{note.note_type === "todo" && <button type="button" disabled={!canEdit} aria-label="완료 전환" onClick={() => void onPatch(note, { isCompleted: !note.is_completed })} className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border disabled:cursor-not-allowed disabled:opacity-40 ${note.is_completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"}`}>{note.is_completed && <Check size={13}/>}</button>}<div className="min-w-0 flex-1"><p className={`text-sm font-semibold ${note.is_completed ? "text-slate-400 line-through" : "text-slate-800"}`}>{note.title || note.content}</p>{note.title && note.content && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{note.content}</p>}{note.due_date && <p className="mt-1 text-[10px] text-slate-400">기한 {note.due_date}</p>}<p className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700"><Users size={10}/> 소유자 {displayedOwnerName} · {sharedMemberCount}명에게 공유{note.sharing?.permission === "view" ? " · 보기" : note.sharing?.permission === "edit" ? " · 편집" : ""}</p></div><PersonalNoteActions note={note} commentsOpen={commentsOpen} timelineOpen={timelineOpen} onEdit={() => openNoteEditor({ note })} onShare={() => onShare(note)} onTogglePin={() => void onPatch(note, { isPinned: !note.is_pinned })} onDelete={() => void onDelete(note)} onToggleComments={() => setCommentNoteId(commentsOpen ? null : note.id)} onToggleTimeline={() => setTimelineNoteId(timelineOpen ? null : note.id)}/></div>{commentsOpen && <CommentSection itemId={note.id}/>} {timelineOpen && <TimelineSection itemId={note.id}/>}</article>; })}</div></div>;
}
