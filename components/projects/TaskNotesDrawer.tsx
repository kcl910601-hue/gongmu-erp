"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { addActivity } from "@/lib/activity";
import { getCurrentEmployee, type CurrentEmployee } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { dispatchTaskNotesChanged } from "@/lib/task-notes";

export type TaskNote = {
  id: string;
  task_id: number;
  note: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  created_by_name: string | null;
  is_important: boolean;
  check_date: string | null;
};

export type TaskNoteSummary = {
  count: number;
  latestNote: {
    id: string;
    note: string;
    createdAt: string;
    createdByName: string | null;
    isImportant: boolean;
    checkDate: string | null;
  } | null;
};

type TaskNotesDrawerProps = {
  taskId: number;
  taskName: string;
  projectId: number;
  onClose: () => void;
  onSummaryChange: (taskId: number, summary: TaskNoteSummary) => void;
};

const noteTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function TaskNotesDrawer({
  taskId,
  taskName,
  projectId,
  onClose,
  onSummaryChange,
}: TaskNotesDrawerProps) {
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [currentEmployee, setCurrentEmployee] = useState<CurrentEmployee | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [newNoteImportant, setNewNoteImportant] = useState(false);
  const [newNoteCheckDate, setNewNoteCheckDate] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingImportant, setEditingImportant] = useState(false);
  const [editingCheckDate, setEditingCheckDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;

    async function loadNotes() {
      setIsLoading(true);
      const [employee, userResult, noteResult] = await Promise.all([
        getCurrentEmployee(),
        supabase.auth.getUser(),
        supabase
          .from("task_notes")
          .select("id, task_id, note, created_at, created_by, updated_at, created_by_name, is_important, check_date")
          .eq("task_id", taskId)
          .order("created_at", { ascending: true }),
      ]);

      if (!active) return;
      setCurrentEmployee(employee);
      setCurrentUserId(userResult.data.user?.id ?? null);

      if (noteResult.error) {
        toast.error(`업무 메모를 불러오지 못했습니다. ${noteResult.error.message}`);
      } else {
        const loadedNotes = (noteResult.data ?? []) as TaskNote[];
        setNotes(loadedNotes);
        onSummaryChange(taskId, buildTaskNoteSummary(loadedNotes));
      }
      setIsLoading(false);
    }

    void loadNotes();
    return () => {
      active = false;
    };
  }, [onSummaryChange, taskId]);

  function scrollToLatest() {
    window.requestAnimationFrame(() => {
      listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  async function createNote() {
    const normalizedNote = newNote.trim();
    if (!normalizedNote || isSaving || !currentUserId) return;

    setIsSaving(true);
    const { data, error } = await supabase
      .from("task_notes")
      .insert({
        task_id: taskId,
        note: normalizedNote,
        created_by: currentUserId,
        created_by_name: currentEmployee?.name ?? null,
        is_important: newNoteImportant,
        check_date: newNoteCheckDate || null,
      })
      .select("id, task_id, note, created_at, created_by, updated_at, created_by_name, is_important, check_date")
      .single();

    if (error) {
      toast.error(`메모 등록에 실패했습니다. ${error.message}`);
      setIsSaving(false);
      return;
    }

    const createdNote = data as TaskNote;
    const nextNotes = [...notes, createdNote];
    setNotes(nextNotes);
    setNewNote("");
    setNewNoteImportant(false);
    setNewNoteCheckDate("");
    onSummaryChange(taskId, buildTaskNoteSummary(nextNotes));
    scrollToLatest();
    toast.success("메모가 등록되었습니다.");
    dispatchTaskNotesChanged();
    void addActivity({
      type: "task_note_create",
      title: "업무 메모 등록",
      description: `${taskName} 업무에 메모를 등록했습니다.`,
      projectId,
      targetType: "task",
      targetId: taskId,
      metadata: { taskNoteId: createdNote.id },
    });
    setIsSaving(false);
  }

  async function updateNote(noteId: string) {
    const normalizedNote = editingValue.trim();
    if (!normalizedNote || isSaving) return;
    const originalNote = notes.find((note) => note.id === noteId);
    if (originalNote && originalNote.note === normalizedNote && originalNote.is_important === editingImportant && (originalNote.check_date ?? "") === editingCheckDate) { setEditingNoteId(null); setEditingValue(""); setEditingImportant(false); setEditingCheckDate(""); return; }

    setIsSaving(true);
    const { data, error } = await supabase
      .from("task_notes")
      .update({ note: normalizedNote, is_important: editingImportant, check_date: editingCheckDate || null })
      .eq("id", noteId)
      .select("id, task_id, note, created_at, created_by, updated_at, created_by_name, is_important, check_date")
      .single();

    if (error) {
      toast.error(`메모 수정에 실패했습니다. ${error.message}`);
      setIsSaving(false);
      return;
    }

    const nextNotes = notes.map((note) => note.id === noteId ? data as TaskNote : note);
    setNotes(nextNotes);
    onSummaryChange(taskId, buildTaskNoteSummary(nextNotes));
    setEditingNoteId(null);
    setEditingValue("");
    setEditingImportant(false);
    setEditingCheckDate("");
    toast.success("메모가 수정되었습니다.");
    dispatchTaskNotesChanged();
    void addActivity({
      type: originalNote && (originalNote.check_date ?? "") !== editingCheckDate ? "task_note_check_date_update" : originalNote && originalNote.is_important !== editingImportant ? "task_note_importance_update" : "task_note_update",
      title: originalNote && (originalNote.check_date ?? "") !== editingCheckDate ? "메모 확인일 변경" : originalNote && originalNote.is_important !== editingImportant ? "업무 메모 중요도 변경" : "업무 메모 수정",
      description: originalNote && (originalNote.check_date ?? "") !== editingCheckDate ? `${taskName} 업무 메모 확인일을 ${originalNote.check_date ?? "미지정"} → ${editingCheckDate || "미지정"}으로 변경했습니다.` : originalNote && originalNote.is_important !== editingImportant ? `${taskName} 업무의 메모를 ${editingImportant ? "중요" : "일반"}로 변경했습니다.` : `${taskName} 업무의 메모를 수정했습니다.`,
      projectId,
      targetType: "task",
      targetId: taskId,
      metadata: { taskNoteId: noteId },
    });
    setIsSaving(false);
  }

  async function deleteNote(noteId: string) {
    if (isSaving || !window.confirm("메모를 삭제하시겠습니까?")) return;

    setIsSaving(true);
    const { error } = await supabase.from("task_notes").delete().eq("id", noteId);
    if (error) {
      toast.error(`메모 삭제에 실패했습니다. ${error.message}`);
      setIsSaving(false);
      return;
    }

    const nextNotes = notes.filter((note) => note.id !== noteId);
    setNotes(nextNotes);
    onSummaryChange(taskId, buildTaskNoteSummary(nextNotes));
    toast.success("메모가 삭제되었습니다.");
    dispatchTaskNotesChanged();
    void addActivity({
      type: "task_note_delete",
      title: "업무 메모 삭제",
      description: `${taskName} 업무의 메모를 삭제했습니다.`,
      projectId,
      targetType: "task",
      targetId: taskId,
      metadata: { taskNoteId: noteId },
    });
    setIsSaving(false);
  }

  function canManage(note: TaskNote) {
    return note.created_by === currentUserId || currentEmployee?.role === "admin";
  }

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/25" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-notes-title"
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-600">업무 메모</p>
            <h2 id="task-notes-title" className="mt-1 truncate text-lg font-bold text-slate-950">{taskName}</h2>
          </div>
          <button type="button" aria-label="업무 메모 닫기" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400"><Loader2 size={18} className="mr-2 animate-spin" />불러오는 중...</div>
          ) : notes.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">등록된 업무 메모가 없습니다.</div>
          ) : (
            <div className="space-y-4">
              {notes.map((note) => (
                <article key={note.id} className="border-b border-slate-100 pb-4 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-xs text-slate-400">
                      <span className="font-semibold text-slate-600">{note.created_by_name || "작성자 미확인"}</span>
                      <span className="ml-2">{noteTimeFormatter.format(new Date(note.created_at))}</span>
                      {note.updated_at !== note.created_at && <span className="ml-1">(수정됨)</span>}
                      {note.is_important && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">⚠ 중요 메모</span>}
                      {note.check_date && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">확인 {note.check_date}</span>}
                    </div>
                    {canManage(note) && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" aria-label="메모 수정" disabled={isSaving} onClick={() => { setEditingNoteId(note.id); setEditingValue(note.note); setEditingImportant(note.is_important); setEditingCheckDate(note.check_date ?? ""); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"><Pencil size={14} /></button>
                        <button type="button" aria-label="메모 삭제" disabled={isSaving} onClick={() => void deleteNote(note.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </div>
                  {editingNoteId === note.id ? (
                    <div className="mt-2 flex items-end gap-2">
                      <div className="min-w-0 flex-1"><textarea value={editingValue} onChange={(event) => setEditingValue(event.target.value)} rows={3} className="min-h-20 w-full resize-y rounded-xl border border-blue-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /><div className="mt-1 flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={editingImportant} onChange={(event) => setEditingImportant(event.target.checked)} />중요 메모</label><input aria-label="확인일" type="date" value={editingCheckDate} onChange={(event) => setEditingCheckDate(event.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-xs" /><button type="button" onClick={() => setEditingCheckDate("")} className="text-xs text-slate-500">미지정</button></div></div>
                      <button type="button" aria-label="메모 수정 저장" disabled={!editingValue.trim() || isSaving} onClick={() => void updateNote(note.id)} className="rounded-xl bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-50"><Check size={16} /></button>
                    </div>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{note.note}</p>
                  )}
                </article>
              ))}
              <div ref={listEndRef} />
            </div>
          )}
        </div>

        <footer className="border-t border-slate-200 bg-slate-50 p-4">
          <textarea
            value={newNote}
            onChange={(event) => setNewNote(event.target.value)}
            placeholder="메모 입력..."
            rows={3}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={newNoteImportant} onChange={(event) => setNewNoteImportant(event.target.checked)} />중요 메모</label><input aria-label="확인일" type="date" value={newNoteCheckDate} onChange={(event) => setNewNoteCheckDate(event.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-xs" /><button type="button" onClick={() => setNewNoteCheckDate(new Date().toLocaleDateString("sv-SE"))} className="text-xs text-blue-600">오늘</button><button type="button" onClick={() => { const date = new Date(); date.setDate(date.getDate() + 1); setNewNoteCheckDate(date.toLocaleDateString("sv-SE")); }} className="text-xs text-blue-600">내일</button><button type="button" onClick={() => setNewNoteCheckDate("")} className="text-xs text-slate-500">미지정</button></div>
            <Button type="button" variant="primary" disabled={!newNote.trim() || isSaving || !currentUserId} onClick={() => void createNote()}>
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} 등록
            </Button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function buildTaskNoteSummary(notes: TaskNote[]): TaskNoteSummary {
  const latestNote = notes[notes.length - 1] ?? null;
  return {
    count: notes.length,
    latestNote: latestNote ? {
      id: latestNote.id,
      note: latestNote.note,
      createdAt: latestNote.created_at,
      createdByName: latestNote.created_by_name,
      isImportant: latestNote.is_important,
      checkDate: latestNote.check_date,
    } : null,
  };
}
