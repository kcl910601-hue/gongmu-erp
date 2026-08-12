"use client";

import { Check, ChevronDown, ChevronUp, Clock3, ListFilter, Plus, Search, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PERSONAL_NOTES_CHANGED_EVENT, dispatchPersonalNotesChanged, getPersonalNoteAccess, getPersonalNoteCommentBadge, getPersonalTodoDateBucket, isOverduePersonalTodo, isTodayPersonalTodo, openNoteEditor, type NoteEditorPreset, type PersonalNote, type PersonalNoteColor } from "@/lib/personal-notes";
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
import { useDashboardCardSize } from "@/components/dashboard/DashboardCustomization";
import { shouldUseReferenceTaskSidebar } from "@/lib/workspace-layout";

const colorClass: Record<PersonalNoteColor, string> = { default: "border-slate-200 bg-white", yellow: "border-amber-200 bg-amber-50", red: "border-red-200 bg-red-50", green: "border-emerald-200 bg-emerald-50", blue: "border-blue-200 bg-blue-50" };
const TODO_PAGE_SIZE = 15;
const COMPLETED_PAGE_SIZE = 20;
const SMALL_PAGE_SIZE = 10;
const WORKSPACE_PREFERENCE_KEY = "my-workspace-todo-preferences";

type WorkspaceTab = "todo" | "schedule" | "memo" | "all";
type TodoFilter = "open" | "today" | "overdue" | "upcoming" | "pinned" | "owned" | "shared";
type TodoSort = "recommended" | "due" | "updated" | "created";
type WorkspacePreferences = { tab: WorkspaceTab; filter: TodoFilter; sort: TodoSort; completedOpen: boolean };

const defaultPreferences: WorkspacePreferences = { tab: "todo", filter: "open", sort: "recommended", completedOpen: false };
const tabOptions: Array<{ value: WorkspaceTab; label: string }> = [{ value: "todo", label: "Todo" }, { value: "schedule", label: "일정" }, { value: "memo", label: "메모" }, { value: "all", label: "전체" }];
const filterOptions: Array<{ value: TodoFilter; label: string }> = [{ value: "open", label: "전체 미완료" }, { value: "today", label: "오늘" }, { value: "overdue", label: "지연" }, { value: "upcoming", label: "예정" }, { value: "pinned", label: "고정" }, { value: "owned", label: "내가 소유" }, { value: "shared", label: "공유받음" }];
const sortOptions: Array<{ value: TodoSort; label: string }> = [{ value: "recommended", label: "추천 순" }, { value: "due", label: "날짜 빠른 순" }, { value: "updated", label: "최근 수정 순" }, { value: "created", label: "최근 생성 순" }];

function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function isOwned(note: PersonalNote) { return !note.sharing || note.sharing.permission === "owner"; }
function dueRank(note: PersonalNote, currentDate: string) { const bucket = getPersonalTodoDateBucket(note, currentDate); return bucket === "overdue" ? 1 : bucket === "today" ? 2 : bucket === "upcoming" ? 3 : 4; }
function normalizePreferences(value: string | null): WorkspacePreferences { try { const parsed = JSON.parse(value ?? "") as Partial<WorkspacePreferences>; return { tab: tabOptions.some((item) => item.value === parsed.tab) ? parsed.tab as WorkspaceTab : "todo", filter: filterOptions.some((item) => item.value === parsed.filter) ? parsed.filter as TodoFilter : "open", sort: sortOptions.some((item) => item.value === parsed.sort) ? parsed.sort as TodoSort : "recommended", completedOpen: parsed.completedOpen === true }; } catch { return defaultPreferences; } }

export default function PersonalWorkspace() {
  const { employee } = useAppShellUser();
  const dashboardSize = useDashboardCardSize("workspace");
  const isSmall = dashboardSize === "small";
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [shareTarget, setShareTarget] = useState<PersonalNote | null>(null);
  const [openReferenceCount, setOpenReferenceCount] = useState(0);
  const [completedReferenceCount, setCompletedReferenceCount] = useState(0);
  const [pendingInvitationCount, setPendingInvitationCount] = useState(0);
  const [preferences, setPreferences] = useState<WorkspacePreferences>(defaultPreferences);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [visibleTodoCount, setVisibleTodoCount] = useState(TODO_PAGE_SIZE);
  const [visibleCompletedCount, setVisibleCompletedCount] = useState(COMPLETED_PAGE_SIZE);
  const [smallTodoCount, setSmallTodoCount] = useState(SMALL_PAGE_SIZE);
  const [smallCompletedCount, setSmallCompletedCount] = useState(SMALL_PAGE_SIZE);
  const preferenceKey = employee?.id ? `${WORKSPACE_PREFERENCE_KEY}:${employee.id}` : null;
  const currentDate = today();
  const hasReferenceSidebar = shouldUseReferenceTaskSidebar(openReferenceCount);

  const load = useCallback(async () => { const response = await fetch("/api/personal-notes", { cache: "no-store" }); const result = await response.json() as { notes?: PersonalNote[]; error?: string }; if (!response.ok) { setError(result.error ?? "My Workspace를 불러오지 못했습니다."); return; } setNotes(result.notes ?? []); setError(""); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); window.addEventListener(PERSONAL_NOTES_CHANGED_EVENT, load); return () => { window.clearTimeout(timer); window.removeEventListener(PERSONAL_NOTES_CHANGED_EVENT, load); }; }, [load]);
  useEffect(() => { if (!preferenceKey) return; const timer = window.setTimeout(() => { setPreferences(normalizePreferences(window.localStorage.getItem(preferenceKey))); setPreferencesLoaded(true); }, 0); return () => window.clearTimeout(timer); }, [preferenceKey]);
  useEffect(() => { if (preferenceKey && preferencesLoaded) window.localStorage.setItem(preferenceKey, JSON.stringify(preferences)); }, [preferenceKey, preferences, preferencesLoaded]);

  const todos = useMemo(() => notes.filter((note) => note.note_type === "todo"), [notes]);
  const openTodos = useMemo(() => todos.filter((note) => !note.is_completed), [todos]);
  const completedTodos = useMemo(() => todos.filter((note) => note.is_completed).sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [todos]);
  const counts = { open: openTodos.length, today: openTodos.filter((note) => isTodayPersonalTodo(note, currentDate)).length, overdue: openTodos.filter((note) => isOverduePersonalTodo(note, currentDate)).length, completed: completedTodos.length };
  const visibleTodos = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("ko-KR");
    const filtered = openTodos.filter((note) => {
      if (keyword && !note.title.toLocaleLowerCase("ko-KR").includes(keyword) && !note.content.toLocaleLowerCase("ko-KR").includes(keyword)) return false;
      if (preferences.filter === "today") return isTodayPersonalTodo(note, currentDate);
      if (preferences.filter === "overdue") return isOverduePersonalTodo(note, currentDate);
      if (preferences.filter === "upcoming") return getPersonalTodoDateBucket(note, currentDate) === "upcoming";
      if (preferences.filter === "pinned") return note.is_pinned;
      if (preferences.filter === "owned") return isOwned(note);
      if (preferences.filter === "shared") return Boolean(note.sharing && note.sharing.permission !== "owner");
      return true;
    });
    return filtered.sort((a, b) => {
      if (preferences.sort === "updated") return b.updated_at.localeCompare(a.updated_at);
      if (preferences.sort === "created") return b.created_at.localeCompare(a.created_at);
      if (preferences.sort === "due") return (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") || b.updated_at.localeCompare(a.updated_at);
      return Number(b.is_pinned) - Number(a.is_pinned) || dueRank(a, currentDate) - dueRank(b, currentDate) || (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") || b.updated_at.localeCompare(a.updated_at);
    });
  }, [currentDate, openTodos, preferences.filter, preferences.sort, search]);
  const schedules = notes.filter((note) => note.note_type !== "todo" && note.due_date !== null);
  const memos = notes.filter((note) => note.note_type !== "todo" && note.due_date === null);
  const noteIdsKey = notes.map((note) => note.id).join(",");
  const todoLimit = isSmall ? smallTodoCount : visibleTodoCount;
  const completedLimit = isSmall ? smallCompletedCount : visibleCompletedCount;
  const todoPageSize = isSmall ? SMALL_PAGE_SIZE : TODO_PAGE_SIZE;
  const completedPageSize = isSmall ? SMALL_PAGE_SIZE : COMPLETED_PAGE_SIZE;

  useEffect(() => {
    function handleDelta(event: Event) { const detail = (event as CustomEvent<{ itemId: string; delta: number }>).detail; if (detail) setNotes((current) => current.map((note) => note.id === detail.itemId ? { ...note, comment_count: Math.max(0, (note.comment_count ?? 0) + detail.delta) } : note)); }
    function handleUnreadCleared(event: Event) { const itemId = (event as CustomEvent<{ itemId: string }>).detail?.itemId; if (itemId) setNotes((current) => current.map((note) => note.id === itemId ? { ...note, unread_comment_count: 0 } : note)); }
    async function refreshCounts() { try { const countsResult = await loadCommentCounts(noteIdsKey ? noteIdsKey.split(",") : []); setNotes((current) => applyCommentCounts(current, countsResult)); } catch { /* 다음 이벤트에서 재시도합니다. */ } }
    window.addEventListener(COMMENT_COUNT_DELTA_EVENT, handleDelta); window.addEventListener(COMMENT_COUNTS_INVALIDATED_EVENT, refreshCounts); window.addEventListener(COMMENT_UNREAD_CLEARED_EVENT, handleUnreadCleared);
    return () => { window.removeEventListener(COMMENT_COUNT_DELTA_EVENT, handleDelta); window.removeEventListener(COMMENT_COUNTS_INVALIDATED_EVENT, refreshCounts); window.removeEventListener(COMMENT_UNREAD_CLEARED_EVENT, handleUnreadCleared); };
  }, [noteIdsKey]);

  async function patchNote(note: PersonalNote, changes: Record<string, unknown>) { const previous = notes; setNotes((current) => current.map((item) => item.id === note.id ? { ...item, is_completed: typeof changes.isCompleted === "boolean" ? changes.isCompleted : item.is_completed, is_pinned: typeof changes.isPinned === "boolean" ? changes.isPinned : item.is_pinned, updated_at: new Date().toISOString() } : item)); try { await withShortEditingLock("personal_note", note.id, async () => { const response = await fetch(`/api/personal-notes/${note.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) }); if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error ?? "변경사항을 저장하지 못했습니다."); } }); dispatchPersonalNotesChanged(); } catch (cause) { setNotes(previous); setError(cause instanceof Error ? cause.message : "변경사항을 저장하지 못했습니다."); } }
  async function deleteNote(note: PersonalNote) { const previous = notes; setNotes((current) => current.filter((item) => item.id !== note.id)); const response = await fetch(`/api/personal-notes/${note.id}`, { method: "DELETE" }); if (!response.ok) { setNotes(previous); setError("메모를 삭제하지 못했습니다."); return; } dispatchPersonalNotesChanged(); }
  function applySummary(filter: TodoFilter | "completed") { if (filter === "completed") setPreferences((current) => ({ ...current, tab: "todo", completedOpen: true })); else setPreferences((current) => ({ ...current, tab: "todo", filter })); }

  return <section className={`mb-4 min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm ${isSmall ? "p-3" : "p-4 sm:p-5"}`}>
    <div className={`flex items-start gap-3 ${isSmall ? "flex-col" : "flex-wrap justify-between"}`}><div className="min-w-0"><h2 className={`${isSmall ? "text-lg" : "text-xl"} break-words font-bold text-slate-950`}>My Workspace</h2><p className="mt-0.5 break-words text-sm text-slate-500">오늘 처리할 Todo를 중심으로 관리합니다.</p></div><button type="button" onClick={() => openNoteEditor("todo")} className={`inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 ${isSmall ? "w-full" : ""}`}><Plus size={16}/>Todo 추가</button></div>
    <div className={`mt-4 grid grid-cols-2 gap-2 ${isSmall ? "" : "sm:grid-cols-4"}`}>{([{ label: "미완료", value: counts.open, filter: "open" }, { label: "오늘", value: counts.today, filter: "today" }, { label: "지연", value: counts.overdue, filter: "overdue" }, { label: "완료", value: counts.completed, filter: "completed" }] as const).map((item) => <button type="button" key={item.label} onClick={() => applySummary(item.filter)} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50"><span className="block break-words text-xs font-medium text-slate-500">{item.label}</span><span className="mt-1 block break-all text-lg font-bold text-slate-900">{item.value}</span></button>)}</div>
    <div className={pendingInvitationCount > 0 ? "mt-3" : ""}><ShareInvitationList compact onPendingCountChange={setPendingInvitationCount}/></div>
    <div className="mt-4 flex min-w-0 flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{tabOptions.map((tab) => <button type="button" key={tab.value} onClick={() => setPreferences((current) => ({ ...current, tab: tab.value }))} className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-sm font-semibold transition ${preferences.tab === tab.value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{tab.label}</button>)}</div>
    {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

    {(preferences.tab === "todo" || preferences.tab === "all") && <div className={`mt-4 grid min-w-0 items-start gap-4 ${isSmall || !hasReferenceSidebar ? "grid-cols-1" : "xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]"}`}>
      <div className={`min-w-0 rounded-2xl border border-slate-200 bg-slate-50 ${isSmall ? "p-3" : "p-3 sm:p-4"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-base font-bold text-slate-900">내 할 일 <span className="text-blue-600">{visibleTodos.length}</span></h3><p className="text-xs text-slate-500">미완료 Todo를 우선순위에 따라 표시합니다.</p></div></div>
        <div className={`mt-3 grid min-w-0 gap-2 ${isSmall ? "grid-cols-2" : "lg:grid-cols-[minmax(220px,1fr)_auto_auto]"}`}><label className={`flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 ${isSmall ? "col-span-2" : ""}`}><Search size={15} className="shrink-0 text-slate-400"/><input value={search} onChange={(event) => { setSearch(event.target.value); setVisibleTodoCount(TODO_PAGE_SIZE); setSmallTodoCount(SMALL_PAGE_SIZE); }} placeholder="Todo 제목과 내용 검색" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/></label><label className="flex min-w-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2"><ListFilter size={14} className="shrink-0 text-slate-400"/><select value={preferences.filter} onChange={(event) => { setPreferences((current) => ({ ...current, filter: event.target.value as TodoFilter })); setVisibleTodoCount(TODO_PAGE_SIZE); setSmallTodoCount(SMALL_PAGE_SIZE); }} className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none">{filterOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><select aria-label="Todo 정렬" value={preferences.sort} onChange={(event) => setPreferences((current) => ({ ...current, sort: event.target.value as TodoSort }))} className="h-10 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm outline-none">{sortOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        <NoteList notes={visibleTodos.slice(0, todoLimit)} ownerName={employee?.name ?? "-"} onPatch={patchNote} onDelete={deleteNote} onShare={setShareTarget} emptyMessage="조건에 맞는 미완료 Todo가 없습니다." compact={isSmall}/>
        {todoLimit < visibleTodos.length && <button type="button" onClick={() => isSmall ? setSmallTodoCount((count) => count + todoPageSize) : setVisibleTodoCount((count) => count + todoPageSize)} className="mt-3 w-full rounded-xl border border-slate-200 bg-white py-2 text-sm font-semibold text-blue-600">더 보기 ({visibleTodos.length - todoLimit}건)</button>}
        {isSmall && <div className={`mt-4 border-t border-slate-200 pt-3 ${openReferenceCount === 0 && completedReferenceCount === 0 ? "hidden" : ""}`}><ReferenceTaskSection compact onOpenCountChange={setOpenReferenceCount} onCompletedCountChange={setCompletedReferenceCount}/></div>}
        <div className="mt-4 border-t border-slate-200 pt-3"><button type="button" onClick={() => setPreferences((current) => ({ ...current, completedOpen: !current.completedOpen }))} className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left"><span className="break-words text-sm font-bold text-slate-700">완료한 일 <span className="text-slate-400">{completedTodos.length}</span></span>{preferences.completedOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</button>{preferences.completedOpen && <><NoteList notes={completedTodos.slice(0, completedLimit)} ownerName={employee?.name ?? "-"} onPatch={patchNote} onDelete={deleteNote} onShare={setShareTarget} emptyMessage="완료한 Todo가 없습니다." completed compact={isSmall}/>{completedLimit < completedTodos.length && <button type="button" onClick={() => isSmall ? setSmallCompletedCount((count) => count + completedPageSize) : setVisibleCompletedCount((count) => count + completedPageSize)} className="mt-3 w-full rounded-xl border border-slate-200 bg-white py-2 text-sm font-semibold text-blue-600">완료 내역 더 보기 ({completedTodos.length - completedLimit}건)</button>}</>}</div>
      </div>
      {!isSmall && <div className={`min-w-0 ${!hasReferenceSidebar ? "xl:col-span-full" : ""} ${openReferenceCount === 0 && completedReferenceCount === 0 ? "hidden" : ""}`}><ReferenceTaskSection compact={!hasReferenceSidebar} onOpenCountChange={setOpenReferenceCount} onCompletedCountChange={setCompletedReferenceCount}/></div>}
    </div>}

    {(preferences.tab === "schedule" || preferences.tab === "all") && <NoteSection title="📅 개인 일정" preset="memo" notes={schedules} ownerName={employee?.name ?? "-"} onPatch={patchNote} onDelete={deleteNote} onShare={setShareTarget} compact={isSmall}/>}
    {(preferences.tab === "memo" || preferences.tab === "all") && <NoteSection title="📝 메모" preset="memo" notes={memos} ownerName={employee?.name ?? "-"} onPatch={patchNote} onDelete={deleteNote} onShare={setShareTarget} compact={isSmall}/>}
    {shareTarget && (
      <ShareDialog
        note={shareTarget}
        onClose={() => setShareTarget(null)}
        onChanged={() => void load()}
      />
    )}
  </section>;
}

function NoteList({ notes, ownerName, onPatch, onDelete, onShare, emptyMessage, completed = false, compact = false }: { notes: PersonalNote[]; ownerName: string; onPatch: (note: PersonalNote, changes: Record<string, unknown>) => Promise<void>; onDelete: (note: PersonalNote) => Promise<void>; onShare: (note: PersonalNote) => void; emptyMessage: string; completed?: boolean; compact?: boolean }) {
  const [commentNoteId, setCommentNoteId] = useState<string | null>(null); const [timelineNoteId, setTimelineNoteId] = useState<string | null>(null);
  return <div className="mt-3 grid min-w-0 gap-2">{notes.length === 0 ? <p className="rounded-xl bg-white py-8 text-center text-sm text-slate-400">{emptyMessage}</p> : notes.map((note) => { const access = getPersonalNoteAccess(note); const commentsOpen = commentNoteId === note.id; const timelineOpen = timelineNoteId === note.id; const owner = note.sharing?.ownerName ?? ownerName; const commentBadge = getPersonalNoteCommentBadge(note); const isShared = Boolean(note.sharing && note.sharing.permission !== "owner"); return <article key={note.id} className={`min-w-0 rounded-xl border p-3 ${colorClass[note.color]} ${completed ? "opacity-75" : ""}`}><div className="flex min-w-0 items-start gap-2"><button type="button" disabled={!access.canEdit} aria-label={note.is_completed ? "미완료로 복원" : "완료"} onClick={() => void onPatch(note, { isCompleted: !note.is_completed })} className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border disabled:cursor-not-allowed disabled:opacity-40 ${note.is_completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"}`}>{note.is_completed && <Check size={13}/>}</button><div className="min-w-0 flex-1"><p className={`${compact ? "line-clamp-2" : ""} break-words text-sm font-semibold [overflow-wrap:anywhere] ${note.is_completed ? "text-slate-400 line-through" : "text-slate-800"}`}>{note.title || note.content}</p>{note.title && note.content && <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs text-slate-600 [overflow-wrap:anywhere]">{note.content}</p>}<div className="mt-2 flex min-w-0 flex-wrap items-center gap-1 text-[10px]"><span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${note.due_date && note.due_date < today() && !note.is_completed ? "bg-red-100 text-red-700" : note.due_date === today() ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}><Clock3 size={10}/><span className="break-all">{note.due_date ? note.due_date < today() && !note.is_completed ? `지연 · ${note.due_date}` : note.due_date === today() ? "오늘" : note.due_date : "날짜 없음"}</span></span><span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">TODO</span>{note.is_pinned && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">고정</span>}<span className={`max-w-full break-words rounded-full px-2 py-0.5 font-semibold ${isShared ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}><Users size={10} className="mr-1 inline"/>{isShared ? "공유받음" : note.sharing?.memberCount ? "공유중" : `소유자 ${owner}`}</span>{commentBadge && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">댓글 {commentBadge}</span>}</div></div><PersonalNoteActions note={note} commentsOpen={commentsOpen} timelineOpen={timelineOpen} onEdit={() => openNoteEditor({ note })} onShare={() => onShare(note)} onTogglePin={() => void onPatch(note, { isPinned: !note.is_pinned })} onDelete={() => void onDelete(note)} onToggleComments={() => setCommentNoteId(commentsOpen ? null : note.id)} onToggleTimeline={() => setTimelineNoteId(timelineOpen ? null : note.id)} compact={compact}/></div>{commentsOpen && <CommentSection itemId={note.id}/>} {timelineOpen && <TimelineSection itemId={note.id}/>}</article>; })}</div>;
}

function NoteSection({ title, preset, notes, ownerName, onPatch, onDelete, onShare, compact = false }: { title: string; preset: NoteEditorPreset; notes: PersonalNote[]; ownerName: string; onPatch: (note: PersonalNote, changes: Record<string, unknown>) => Promise<void>; onDelete: (note: PersonalNote) => Promise<void>; onShare: (note: PersonalNote) => void; compact?: boolean }) {
  return <div className={`mt-4 min-w-0 rounded-2xl bg-slate-50 ${compact ? "p-3" : "p-4"}`}><div className="flex min-w-0 items-center justify-between gap-2"><h3 className="min-w-0 break-words font-bold text-slate-800">{title} <span className="text-slate-400">{notes.length}</span></h3><button type="button" aria-label={`${title} 추가`} onClick={() => openNoteEditor(preset)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm"><Plus size={15}/></button></div><NoteList notes={notes} ownerName={ownerName} onPatch={onPatch} onDelete={onDelete} onShare={onShare} emptyMessage="등록된 항목이 없습니다." compact={compact}/></div>;
}
