"use client";

import { CheckSquare, Pin, StickyNote, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { dispatchPersonalNotesChanged, getNoteEditorDefaults, NOTE_EDITOR_OPEN_EVENT, type NoteEditorPreset, type PersonalNote, type PersonalNoteColor } from "@/lib/personal-notes";
import { toast } from "@/lib/toast";

const noteOptions = [
  { value: "memo", label: "메모", description: "자유 메모를 작성합니다.", icon: StickyNote },
  { value: "todo", label: "Todo", description: "체크리스트 업무를 추가합니다.", icon: CheckSquare },
  { value: "sticky", label: "고정메모", description: "Dashboard 상단에 항상 표시됩니다.", icon: Pin },
] as const;

const colors: { value: PersonalNoteColor; label: string; className: string }[] = [
  { value: "default", label: "기본", className: "bg-slate-200" },
  { value: "yellow", label: "노랑", className: "bg-amber-300" },
  { value: "green", label: "초록", className: "bg-emerald-400" },
  { value: "red", label: "빨강", className: "bg-red-400" },
  { value: "blue", label: "파랑", className: "bg-blue-400" },
];

function localDate(offset = 0) {
  const date = new Date(); date.setDate(date.getDate() + offset);
  const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function NoteEditorModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<PersonalNote | null>(null);
  const [noteType, setNoteType] = useState<NoteEditorPreset>("memo");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState<PersonalNoteColor>("default");
  const [dateMode, setDateMode] = useState<"none" | "today" | "tomorrow" | "custom">("none");
  const [customDate, setCustomDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const close = useCallback(() => { if (!isSaving) setIsOpen(false); }, [isSaving]);
  useEffect(() => {
    function open(event: Event) {
      const detail = (event as CustomEvent<{ preset?: NoteEditorPreset; dueDate?: string | null; note?: PersonalNote }>).detail;
      const preset = detail?.preset;
      setNoteType(preset === "todo" || preset === "sticky" ? preset : "memo");
      setEditingNote(detail?.note ?? null);
      setTitle(detail?.note?.title ?? ""); setContent(detail?.note?.content ?? ""); setColor(detail?.note?.color ?? "default"); setDateMode(detail?.dueDate ? "custom" : "none"); setCustomDate(detail?.dueDate ?? ""); setError(""); setIsOpen(true);
    }
    window.addEventListener(NOTE_EDITOR_OPEN_EVENT, open);
    return () => window.removeEventListener(NOTE_EDITOR_OPEN_EVENT, open);
  }, []);
  useEffect(() => {
    if (!isOpen) return;
    function keydown(event: KeyboardEvent) { if (event.key === "Escape") close(); }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [close, isOpen]);

  async function save() {
    if (!title.trim() && !content.trim()) { setError("제목 또는 내용을 입력하세요."); return; }
    const dueDate = dateMode === "today" ? localDate() : dateMode === "tomorrow" ? localDate(1) : dateMode === "custom" ? customDate || null : null;
    setIsSaving(true); setError("");
    try {
      const response = await fetch(editingNote ? `/api/personal-notes/${editingNote.id}` : "/api/personal-notes", { method: editingNote ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...getNoteEditorDefaults(noteType), noteType, title, content, color, dueDate, isCompleted: editingNote?.is_completed ?? false, isPinned: editingNote?.is_pinned ?? noteType === "sticky" }) });
      const result = await response.json() as { error?: string; note?: PersonalNote };
      if (!response.ok) throw new Error(result.error ?? "저장하지 못했습니다.");
      dispatchPersonalNotesChanged(); setIsOpen(false); toast.success(editingNote ? "일정이 수정되었습니다." : "내 업무가 추가되었습니다.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "저장하지 못했습니다."); }
    finally { setIsSaving(false); }
  }

  if (!isOpen) return null;
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={close}>
    <div role="dialog" aria-modal="true" aria-labelledby="note-editor-title" className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-blue-600">My Workspace</p><h2 id="note-editor-title" className="mt-1 text-xl font-bold text-slate-950">{editingNote ? "일정 수정" : "새 일정 등록"}</h2><p className="mt-1 text-sm text-slate-500">{editingNote ? "기존 일정의 내용을 수정합니다." : "무엇을 추가하시겠습니까?"}</p></div><button type="button" aria-label="닫기" onClick={close} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">{noteOptions.map((option) => { const Icon = option.icon; return <button key={option.value} type="button" onClick={() => setNoteType(option.value)} className={`rounded-2xl border p-3 text-left transition ${noteType === option.value ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 hover:bg-slate-50"}`}><Icon size={18} className={noteType === option.value ? "text-blue-600" : "text-slate-500"}/><p className="mt-2 text-sm font-bold">{option.label}</p><p className="mt-1 text-xs text-slate-500">{option.description}</p></button>; })}</div>
      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4"><label className="block text-xs font-semibold text-slate-600">제목<input autoFocus maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300"/></label><label className="block text-xs font-semibold text-slate-600">내용<textarea maxLength={5000} rows={4} value={content} onChange={(event) => setContent(event.target.value)} className="mt-1 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"/></label>
        <div className="grid gap-3 sm:grid-cols-2"><fieldset><legend className="text-xs font-semibold text-slate-600">색상</legend><div className="mt-2 flex gap-2">{colors.map((item) => <button key={item.value} type="button" title={item.label} aria-label={item.label} onClick={() => setColor(item.value)} className={`h-7 w-7 rounded-full ${item.className} ${color === item.value ? "ring-2 ring-blue-600 ring-offset-2" : ""}`}/>)}</div></fieldset><fieldset><legend className="text-xs font-semibold text-slate-600">날짜</legend><div className="mt-1 flex flex-wrap gap-1">{(["none","today","tomorrow","custom"] as const).map((mode) => <button key={mode} type="button" onClick={() => setDateMode(mode)} className={`rounded-lg px-2 py-1.5 text-xs ${dateMode === mode ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{({none:"없음",today:"오늘",tomorrow:"내일",custom:"직접 선택"})[mode]}</button>)}</div>{dateMode === "custom" && <input type="date" value={customDate} onChange={(event) => setCustomDate(event.target.value)} className="mt-2 rounded-lg border px-2 py-1 text-xs"/>}</fieldset></div>
      </div>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={close} disabled={isSaving} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">취소</button><button type="button" onClick={() => void save()} disabled={isSaving || (dateMode === "custom" && !customDate)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isSaving ? "저장 중..." : editingNote ? "일정 수정" : "일정 등록"}</button></div>
    </div>
  </div>;
}
