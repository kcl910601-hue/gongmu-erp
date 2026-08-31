"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ExpandableMemo } from "@/components/calendar/ExpandableMemo";
import type { TaskNote } from "@/components/projects/TaskNotesDrawer";
import { addActivity } from "@/lib/activity";
import { getCurrentEmployee, type CurrentEmployee } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { canManageCalendarTaskNote, dispatchTaskNotesChanged, getCompactTaskNotes, getTaskNoteCheckDateStatus, mergeTaskNoteNewest, removeTaskNote, replaceTaskNote, TASK_NOTES_CHANGED_EVENT } from "@/lib/task-notes";
import { toast } from "@/lib/toast";

type Props = { taskId: number; taskName: string; projectId: number; today: string; canCreate: boolean };
const SELECT = "id, task_id, note, created_at, created_by, updated_at, created_by_name, is_important, check_date";
const dateFormatter = new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" });

export function CalendarTaskNotesSection({ taskId, taskName, projectId, today, canCreate }: Props) {
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [employee, setEmployee] = useState<CurrentEmployee | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [note, setNote] = useState("");
  const [isImportant, setIsImportant] = useState(false);
  const [checkDate, setCheckDate] = useState("");
  const [saveError, setSaveError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState("");
  const [editingImportant, setEditingImportant] = useState(false);
  const [editingCheckDate, setEditingCheckDate] = useState("");
  const [editError, setEditError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadNotes = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setLoadError("");
    const result = await supabase.from("task_notes").select(SELECT).eq("task_id", taskId).order("created_at", { ascending: false });
    if (result.error) setLoadError("메모를 불러오지 못했습니다.");
    else setNotes((result.data ?? []) as TaskNote[]);
    if (showLoading) setIsLoading(false);
  }, [taskId]);

  useEffect(() => {
    let active = true;
    void Promise.all([getCurrentEmployee(), supabase.auth.getUser()]).then(([currentEmployee, userResult]) => {
      if (!active) return;
      setEmployee(currentEmployee);
      setUserId(userResult.data.user?.id ?? null);
    });
    const initialLoadTimer = window.setTimeout(() => void loadNotes(), 0);
    const handleChanged = () => void loadNotes(false);
    window.addEventListener(TASK_NOTES_CHANGED_EVENT, handleChanged);
    return () => { active = false; window.clearTimeout(initialLoadTimer); window.removeEventListener(TASK_NOTES_CHANGED_EVENT, handleChanged); };
  }, [loadNotes]);

  const visibleNotes = useMemo(() => getCompactTaskNotes(notes, isExpanded), [isExpanded, notes]);

  function setTomorrow() {
    const date = new Date(`${today}T00:00:00`);
    date.setDate(date.getDate() + 1);
    setCheckDate(date.toLocaleDateString("sv-SE"));
  }

  async function createNote() {
    const normalized = note.trim();
    if (!normalized || isSaving || !userId || !canCreate) return;
    setIsSaving(true);
    setSaveError("");
    const taskResult = await supabase.from("tasks").select("id").eq("id", taskId).maybeSingle();
    if (taskResult.error || !taskResult.data) {
      setSaveError("삭제되었거나 접근할 수 없는 업무입니다. 메모를 추가할 수 없습니다.");
      setIsSaving(false);
      return;
    }
    const result = await supabase.from("task_notes").insert({ task_id: taskId, note: normalized, created_by: userId, created_by_name: employee?.name ?? null, is_important: isImportant, check_date: checkDate || null }).select(SELECT).single();
    if (result.error) {
      setSaveError(`메모 등록에 실패했습니다. ${result.error.message}`);
      setIsSaving(false);
      return;
    }
    const created = result.data as TaskNote;
    setNotes((current) => mergeTaskNoteNewest(current, created));
    setNote(""); setIsImportant(false); setCheckDate(""); setIsFormOpen(false); setIsSaving(false);
    toast.success("메모가 등록되었습니다.");
    dispatchTaskNotesChanged();
    void addActivity({ type: "task_note_create", title: "업무 메모 등록", description: `${taskName} 업무에 메모를 등록했습니다.`, projectId, targetType: "task", targetId: taskId, metadata: { taskNoteId: created.id } });
  }

  function canManage(item: TaskNote) {
    return canManageCalendarTaskNote({ canEditCalendar: canCreate, createdBy: item.created_by, currentUserId: userId, role: employee?.role });
  }

  function beginEdit(item: TaskNote) {
    setEditingId(item.id);
    setEditingNote(item.note);
    setEditingImportant(item.is_important);
    setEditingCheckDate(item.check_date ?? "");
    setEditError("");
  }

  function cancelEdit() {
    if (isSaving) return;
    setEditingId(null);
    setEditError("");
  }

  async function updateNote(item: TaskNote) {
    const normalized = editingNote.trim();
    if (!normalized || isSaving || !canManage(item)) return;
    if (item.note === normalized && item.is_important === editingImportant && (item.check_date ?? "") === editingCheckDate) {
      cancelEdit();
      return;
    }
    setIsSaving(true);
    setEditError("");
    const taskResult = await supabase.from("tasks").select("id").eq("id", taskId).maybeSingle();
    if (taskResult.error || !taskResult.data) {
      setEditError("삭제되었거나 접근할 수 없는 업무입니다. 메모를 수정할 수 없습니다.");
      setIsSaving(false);
      dispatchTaskNotesChanged();
      return;
    }
    const result = await supabase.from("task_notes").update({ note: normalized, is_important: editingImportant, check_date: editingCheckDate || null }).eq("id", item.id).select(SELECT).single();
    if (result.error) {
      setEditError(`메모 수정에 실패했습니다. ${result.error.message}`);
      setIsSaving(false);
      return;
    }
    const updated = result.data as TaskNote;
    setNotes((current) => replaceTaskNote(current, updated));
    setEditingId(null);
    setIsSaving(false);
    toast.success("메모가 수정되었습니다.");
    dispatchTaskNotesChanged();
    const checkDateChanged = (item.check_date ?? "") !== editingCheckDate;
    const importanceChanged = item.is_important !== editingImportant;
    void addActivity({
      type: checkDateChanged ? "task_note_check_date_update" : importanceChanged ? "task_note_importance_update" : "task_note_update",
      title: checkDateChanged ? "메모 확인일 변경" : importanceChanged ? "업무 메모 중요도 변경" : "업무 메모 수정",
      description: checkDateChanged ? `${taskName} 업무 메모 확인일을 ${item.check_date ?? "미지정"} → ${editingCheckDate || "미지정"}으로 변경했습니다.` : importanceChanged ? `${taskName} 업무의 메모를 ${editingImportant ? "중요" : "일반"}로 변경했습니다.` : `${taskName} 업무의 메모를 수정했습니다.`,
      projectId, targetType: "task", targetId: taskId, metadata: { taskNoteId: item.id },
    });
  }

  async function deleteNote(item: TaskNote) {
    if (isSaving || !canManage(item)) return;
    const detail = item.is_important || item.check_date ? "\n중요 메모 및 연결된 확인 일정도 함께 제거됩니다." : "";
    if (!window.confirm(`이 메모를 삭제하시겠습니까?${detail}`)) return;
    setDeletingId(item.id);
    setIsSaving(true);
    const taskResult = await supabase.from("tasks").select("id").eq("id", taskId).maybeSingle();
    if (taskResult.error || !taskResult.data) {
      toast.error("삭제되었거나 접근할 수 없는 업무입니다. 메모를 삭제할 수 없습니다.");
      setDeletingId(null);
      setIsSaving(false);
      dispatchTaskNotesChanged();
      return;
    }
    const result = await supabase.from("task_notes").delete().eq("id", item.id);
    if (result.error) {
      toast.error(`메모 삭제에 실패했습니다. ${result.error.message}`);
      setDeletingId(null);
      setIsSaving(false);
      return;
    }
    setNotes((current) => removeTaskNote(current, item.id));
    if (editingId === item.id) setEditingId(null);
    setDeletingId(null);
    setIsSaving(false);
    toast.success("메모가 삭제되었습니다.");
    dispatchTaskNotesChanged();
    void addActivity({ type: "task_note_delete", title: "업무 메모 삭제", description: `${taskName} 업무의 메모를 삭제했습니다.`, projectId, targetType: "task", targetId: taskId, metadata: { taskNoteId: item.id } });
  }

  return <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="calendar-task-notes-title">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id="calendar-task-notes-title" className="text-sm font-bold text-slate-900">메모 {notes.length}건</h3>
      {canCreate && !isFormOpen && <button type="button" onClick={() => setIsFormOpen(true)} className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"><Plus size={14}/>{notes.length ? "메모 작성" : "첫 메모 작성"}</button>}
    </div>
    {isFormOpen && canCreate && <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="메모 내용" className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"/>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={isImportant} onChange={(event) => setIsImportant(event.target.checked)}/>중요 메모</label>
        <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-slate-500">확인일</span><button type="button" onClick={() => setCheckDate("")} className="text-xs text-slate-500">미지정</button><button type="button" onClick={() => setCheckDate(today)} className="text-xs text-blue-600">오늘</button><button type="button" onClick={setTomorrow} className="text-xs text-blue-600">내일</button><input aria-label="확인일 직접 선택" type="date" value={checkDate} onChange={(event) => setCheckDate(event.target.value)} className="h-8 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs"/></div>
      </div>
      {saveError && <p className="mt-2 text-xs font-medium text-red-600">{saveError}</p>}
      <div className="mt-3 flex justify-end gap-2"><Button type="button" variant="secondary" disabled={isSaving} onClick={() => { setIsFormOpen(false); setSaveError(""); }}>취소</Button><Button type="button" variant="primary" disabled={!note.trim() || isSaving || !userId} onClick={() => void createNote()}>{isSaving ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>} 저장</Button></div>
    </div>}
    <div className="mt-3">{isLoading ? <div className="space-y-2" aria-label="메모 불러오는 중"><div className="h-14 animate-pulse rounded-xl bg-slate-100"/><div className="h-14 animate-pulse rounded-xl bg-slate-100"/></div> : loadError ? <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{loadError} <button type="button" onClick={() => void loadNotes()} className="font-semibold underline">다시 시도</button></div> : notes.length === 0 ? <p className="rounded-xl bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">등록된 메모가 없습니다.</p> : <div className="space-y-2">{visibleNotes.map((item) => <CompactRow key={item.id} note={item} today={today} canManage={canManage(item)} isEditing={editingId === item.id} isSaving={isSaving} isDeleting={deletingId === item.id} editingNote={editingNote} editingImportant={editingImportant} editingCheckDate={editingCheckDate} editError={editingId === item.id ? editError : ""} onEdit={() => beginEdit(item)} onCancel={cancelEdit} onSave={() => void updateNote(item)} onDelete={() => void deleteNote(item)} onNoteChange={setEditingNote} onImportantChange={setEditingImportant} onCheckDateChange={setEditingCheckDate}/>)}</div>}</div>
    {notes.length > 3 && <button type="button" onClick={() => setIsExpanded((current) => !current)} className="mt-3 text-xs font-semibold text-blue-600">{isExpanded ? "접기" : `전체 ${notes.length}건 보기`}</button>}
    <div className="mt-3 border-t border-slate-100 pt-3"><Link href={`/projects/${projectId}?task=${taskId}`} className="text-xs font-medium text-slate-500 hover:text-blue-600">프로젝트에서 전체 메모 보기</Link></div>
  </section>;
}

type CompactRowProps = {
  note: TaskNote; today: string; canManage: boolean; isEditing: boolean; isSaving: boolean; isDeleting: boolean;
  editingNote: string; editingImportant: boolean; editingCheckDate: string; editError: string;
  onEdit: () => void; onCancel: () => void; onSave: () => void; onDelete: () => void;
  onNoteChange: (value: string) => void; onImportantChange: (value: boolean) => void; onCheckDateChange: (value: string) => void;
};

function CompactRow({ note, today, canManage, isEditing, isSaving, isDeleting, editingNote, editingImportant, editingCheckDate, editError, onEdit, onCancel, onSave, onDelete, onNoteChange, onImportantChange, onCheckDateChange }: CompactRowProps) {
  const status = getTaskNoteCheckDateStatus(note.check_date, today);
  const shortDate = note.check_date?.slice(5).replace("-", "/");
  const checkLabel = note.check_date ? status === "today" ? "오늘 확인" : status === "overdue" ? `확인일 지남 · ${shortDate}` : `확인 ${shortDate}` : null;
  const metadata = <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px]"><span className={`font-semibold ${note.is_important ? "text-amber-800" : "text-slate-600"}`}>{note.is_important ? "⚠ 중요" : "📝 메모"}</span><span className="text-slate-400">{note.created_by_name || "작성자 미확인"} · {dateFormatter.format(new Date(note.created_at))}</span>{checkLabel && <span className={`rounded-full px-1.5 py-0.5 font-semibold ${status === "overdue" ? "bg-red-100 text-red-700" : "bg-blue-50 text-blue-700"}`}>{checkLabel}</span>}</div>;
  const manageActions = canManage ? <><button type="button" aria-label="메모 수정" disabled={isSaving} onClick={onEdit} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-blue-600 disabled:opacity-50"><Pencil size={13}/></button><button type="button" aria-label="메모 삭제" disabled={isSaving} onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-red-600 disabled:opacity-50">{isDeleting ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>}</button></> : null;
  return <article className={`rounded-xl border p-3 ${note.is_important ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50"}`}>
    {isEditing ? <><div className="flex items-start justify-between gap-2">{metadata}</div><div className="mt-2">
      <textarea value={editingNote} onChange={(event) => onNoteChange(event.target.value)} rows={3} className="w-full resize-y rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"/>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"><label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={editingImportant} onChange={(event) => onImportantChange(event.target.checked)}/>중요 메모</label><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => onCheckDateChange("")} className="text-xs text-slate-500">미지정</button><button type="button" onClick={() => onCheckDateChange(today)} className="text-xs text-blue-600">오늘</button><input aria-label="수정 확인일" type="date" value={editingCheckDate} onChange={(event) => onCheckDateChange(event.target.value)} className="h-8 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs"/></div></div>
      {editError && <p className="mt-2 text-xs font-medium text-red-600">{editError}</p>}
      <div className="mt-2 flex justify-end gap-1"><button type="button" aria-label="메모 수정 취소" disabled={isSaving} onClick={onCancel} className="rounded-lg p-2 text-slate-500 hover:bg-white disabled:opacity-50"><X size={15}/></button><button type="button" aria-label="메모 수정 저장" disabled={!editingNote.trim() || isSaving} onClick={onSave} className="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-50">{isSaving ? <Loader2 size={15} className="animate-spin"/> : <Check size={15}/>}</button></div>
    </div></> : <ExpandableMemo text={note.note} header={metadata} actions={manageActions}/>}
  </article>;
}
