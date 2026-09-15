"use client";

import { CheckSquare, Pin, StickyNote, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ShareEmployee, type SharePermission, type SharingOverview } from "@/lib/sharing";
import { scheduleCollaborationEvents, SHARING_CHANGED_EVENT, NOTIFICATIONS_CHANGED_EVENT } from "@/lib/collaboration-events";
import { dispatchPersonalNotesChanged, getNoteEditorDefaults, NOTE_EDITOR_OPEN_EVENT, type NoteEditorPreset, type PersonalNote, type PersonalNoteColor } from "@/lib/personal-notes";
import { toast } from "@/lib/toast";
import { EditingLockNotice } from "@/components/editing/EditingLockNotice";
import { useEditingLock } from "@/hooks/useEditingLock";

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
  const savingRef = useRef(false);
  const [calendarEntry, setCalendarEntry] = useState(false);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [employees, setEmployees] = useState<ShareEmployee[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [permission, setPermission] = useState<SharePermission>("view");
  const [search, setSearch] = useState("");
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeeError, setEmployeeError] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);
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
  const editingLock = useEditingLock("personal_note", editingNote?.id ?? null, isOpen && Boolean(editingNote));

  const close = useCallback(() => { if (!savingRef.current && !isSaving) setIsOpen(false); }, [isSaving]);
  useEffect(() => {
    function open(event: Event) {
      if (savingRef.current) return;
      const detail = (event as CustomEvent<{ preset?: NoteEditorPreset; dueDate?: string | null; note?: PersonalNote; source?: "calendar" }>).detail;
      setCalendarEntry(detail?.source === "calendar" && !detail?.note);
      setShareEnabled(false); setSelected([]); setPermission("view"); setSearch(""); setCreatedNoteId(null); setEmployees([]); setEmployeeError("");
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

  useEffect(() => {
    if (!isOpen || !calendarEntry || !shareEnabled) return;
    const controller = new AbortController();
    async function load() {
      setLoadingEmployees(true); setEmployeeError("");
      try {
        const response = await fetch("/api/sharing", { cache: "no-store", signal: controller.signal });
        const result = await response.json() as SharingOverview & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "직원 목록을 불러오지 못했습니다.");
        if (!controller.signal.aborted) setEmployees(result.employees);
      } catch (error) {
        if (!controller.signal.aborted) setEmployeeError(error instanceof Error ? error.message : "직원 목록을 불러오지 못했습니다.");
      } finally { if (!controller.signal.aborted) setLoadingEmployees(false); }
    }
    void load();
    return () => controller.abort();
  }, [isOpen, calendarEntry, shareEnabled, loadVersion]);

  async function save() {
    if (savingRef.current || (editingNote && !editingLock.canEdit)) return;
    if (!title.trim() && !content.trim()) { setError("제목 또는 내용을 입력하세요."); return; }
    if (calendarEntry && shareEnabled && selected.length === 0) { setError("공유할 직원을 선택하세요."); return; }
    const dueDate = dateMode === "today" ? localDate() : dateMode === "tomorrow" ? localDate(1) : dateMode === "custom" ? customDate || null : null;
    savingRef.current = true; setIsSaving(true); setError("");
    try {
      let savedId = createdNoteId;
      if (!savedId) {
        const response = await fetch(editingNote ? `/api/personal-notes/${editingNote.id}` : "/api/personal-notes", { method: editingNote ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...getNoteEditorDefaults(noteType), noteType, title, content, color, dueDate, isCompleted: editingNote?.is_completed ?? false, isPinned: editingNote?.is_pinned ?? noteType === "sticky" }) });
        const result = await response.json() as { error?: string; note?: PersonalNote };
        if (!response.ok) throw new Error(result.error ?? "저장하지 못했습니다.");
        savedId = result.note?.id ?? null;
        if (calendarEntry) setCreatedNoteId(savedId);
        dispatchPersonalNotesChanged();
      }
      if (calendarEntry && shareEnabled) {
        if (!savedId) throw new Error("저장된 일정 정보를 확인할 수 없습니다. 일정 목록을 확인해주세요.");
        const failed: number[] = [];
        for (const inviteeId of selected) {
          try {
            const response = await fetch("/api/sharing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", itemId: savedId, inviteeId, permission }) });
            if (!response.ok) failed.push(inviteeId);
          } catch { failed.push(inviteeId); }
        }
        scheduleCollaborationEvents([SHARING_CHANGED_EVENT, NOTIFICATIONS_CHANGED_EVENT]);
        dispatchPersonalNotesChanged();
        if (failed.length > 0) {
          setSelected(failed);
          setError(`일정은 저장되었습니다. ${failed.length}명의 공유 요청을 보내지 못했습니다. 실패한 대상만 다시 요청할 수 있습니다.`);
          return;
        }
      }
      setIsOpen(false); toast.success(calendarEntry && shareEnabled ? "일정을 등록하고 공유 요청을 보냈습니다." : editingNote ? "일정이 수정되었습니다." : "내 업무가 추가되었습니다.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "저장하지 못했습니다."); }
    finally { savingRef.current = false; setIsSaving(false); }
  }

  const visibleEmployees = employees.filter((employee) => `${employee.name} ${employee.position ?? ""}`.toLocaleLowerCase("ko-KR").includes(search.trim().toLocaleLowerCase("ko-KR")));
  const typeControls = (<div className="mt-4 grid gap-2 sm:grid-cols-3">{noteOptions.map((option) => { const Icon = option.icon; return <button key={option.value} type="button" onClick={() => setNoteType(option.value)} className={`rounded-2xl border p-3 text-left transition ${noteType === option.value ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 hover:bg-slate-50"}`}><Icon size={18} className={noteType === option.value ? "text-blue-600" : "text-slate-500"}/><p className="mt-2 text-sm font-bold">{option.label}</p><p className="mt-1 text-xs text-slate-500">{option.description}</p></button>; })}</div>);
  const colorControls = (<fieldset><legend className="text-xs font-semibold text-slate-600">색상</legend><div className="mt-2 flex gap-2">{colors.map((item) => <button key={item.value} type="button" title={item.label} aria-label={item.label} onClick={() => setColor(item.value)} className={`h-7 w-7 rounded-full ${item.className} ${color === item.value ? "ring-2 ring-blue-600 ring-offset-2" : ""}`}/>)}</div></fieldset>);
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={close}>
    <div role="dialog" aria-modal="true" aria-labelledby="note-editor-title" className={`flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xl ${calendarEntry ? "max-w-3xl sm:p-6" : "max-w-2xl"}`} onMouseDown={(event) => event.stopPropagation()}>
      <EditingLockNotice state={editingLock.state} lock={editingLock.lock} error={editingLock.error}/>
      <div className="flex shrink-0 items-start justify-between"><div><p className="text-xs font-semibold text-blue-600">My Workspace</p><h2 id="note-editor-title" className="mt-1 text-xl font-bold text-slate-950">{editingNote ? "일정 수정" : calendarEntry ? "내 일정 추가" : "새 일정 등록"}</h2><p className="mt-1 text-sm text-slate-500">{editingNote ? "기존 일정의 내용을 수정합니다." : calendarEntry ? "일정을 작성하고 필요한 직원에게 함께 공유하세요." : "무엇을 추가하시겠습니까?"}</p></div><button type="button" aria-label="닫기" onClick={close} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>
      <div className="min-h-0 min-w-0 flex-auto overflow-y-auto overscroll-contain px-1 pb-1 [scrollbar-gutter:stable]">
      <fieldset disabled={isSaving || Boolean(createdNoteId)} className="min-w-0 border-0 p-0 disabled:opacity-70">
      {calendarEntry ? <>
      <div className="mt-5 space-y-5">
        <label className="block text-sm font-semibold text-slate-700">일정 제목<input autoFocus maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: ○○현장 도면 확인" className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-base outline-none focus:border-blue-400"/></label>
        <fieldset><legend className="text-sm font-semibold text-slate-700">날짜</legend><div className="mt-2 flex flex-wrap items-center gap-2">
          <input aria-label="일정 날짜" type="date" value={dateMode === "today" ? localDate() : dateMode === "tomorrow" ? localDate(1) : dateMode === "custom" ? customDate : ""} onChange={(event) => { setDateMode("custom"); setCustomDate(event.target.value); }} className="h-10 rounded-xl border border-slate-200 px-3 text-sm"/>
          {(["today", "tomorrow", "none"] as const).map((mode) => <button key={mode} type="button" onClick={() => setDateMode(mode)} aria-pressed={dateMode === mode} className={`rounded-xl px-3 py-2 text-sm ${dateMode === mode ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{({today:"오늘",tomorrow:"내일",none:"날짜 없음"})[mode]}</button>)}
        </div></fieldset>
        <label className="block text-sm font-semibold text-slate-700">상세내용
          <textarea maxLength={5000} rows={8} value={content} onChange={(event) => setContent(event.target.value)} placeholder={"일정에 필요한 내용을 자유롭게 작성하세요.\n예: 확인할 사항, 준비물, 전달할 내용"} className="mt-2 min-h-56 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-base font-normal leading-7 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"/>
          <span className="mt-1 flex flex-wrap justify-between gap-2 text-xs font-normal text-slate-400"><span>오른쪽 아래를 끌어 입력란을 더 늘릴 수 있습니다.</span><span>{content.length.toLocaleString()} / 5,000</span></span>
        </label>
        <fieldset className="rounded-2xl border border-slate-200 p-4"><legend className="px-1 text-sm font-semibold text-slate-700">공유 설정</legend>
          <div className="flex flex-wrap gap-4">{[false, true].map((enabled) => <label key={String(enabled)} className="flex items-center gap-2 text-sm"><input type="radio" name="note-share-mode" checked={shareEnabled === enabled} onChange={() => setShareEnabled(enabled)}/>{enabled ? "직원에게 공유" : "나만 보기"}</label>)}</div>
          {shareEnabled && <div className="mt-4 space-y-3">
            <p className="text-xs text-slate-500">상대방이 요청을 수락하면 상대방 일정에 표시됩니다.</p>
            <label className="flex items-center gap-3 text-sm text-slate-600">공유 권한<select value={permission} onChange={(event) => setPermission(event.target.value as SharePermission)} className="rounded-lg border border-slate-200 px-3 py-2"><option value="view">보기</option><option value="edit">편집</option></select></label>
            <input aria-label="공유할 직원 검색" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름 또는 직책으로 직원 검색" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"/>
            {selected.length > 0 && <div className="flex flex-wrap gap-2">{selected.map((id) => <button key={id} type="button" aria-label={`${employees.find((employee) => employee.id === id)?.name ?? id} 선택 해제`} onClick={() => setSelected((current) => current.filter((value) => value !== id))} className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">{employees.find((employee) => employee.id === id)?.name ?? id}<X size={12}/></button>)}</div>}
            {loadingEmployees ? <p className="text-sm text-slate-500">직원 목록을 불러오는 중...</p> : employeeError ? <p role="alert" className="text-sm text-red-600">{employeeError} <button type="button" onClick={() => setLoadVersion((value) => value + 1)} className="underline">다시 불러오기</button></p> : <div className="max-h-40 overflow-y-auto rounded-xl bg-slate-50 p-2">
              {visibleEmployees.map((employee) => <label key={employee.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-white"><input type="checkbox" checked={selected.includes(employee.id)} onChange={() => setSelected((current) => current.includes(employee.id) ? current.filter((id) => id !== employee.id) : [...current, employee.id])}/><span>{employee.name}</span><span className="text-xs text-slate-400">{employee.position}</span></label>)}
              {visibleEmployees.length === 0 && <p className="p-2 text-sm text-slate-500">검색 결과가 없습니다.</p>}
            </div>}
          </div>}
        </fieldset>
        <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-600">추가 옵션 — 일정 유형, 색상</summary>
      {typeControls}
{colorControls}
        </details>
      </div>
      </> : <>
      {typeControls}
      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4"><label className="block text-xs font-semibold text-slate-600">제목<input autoFocus maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300"/></label><label className="block text-xs font-semibold text-slate-600">내용<textarea maxLength={5000} rows={4} value={content} onChange={(event) => setContent(event.target.value)} className="mt-1 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"/></label>
        <div className="grid gap-3 sm:grid-cols-2">{colorControls}<fieldset><legend className="text-xs font-semibold text-slate-600">날짜</legend><div className="mt-1 flex flex-wrap gap-1">{(["none","today","tomorrow","custom"] as const).map((mode) => <button key={mode} type="button" onClick={() => setDateMode(mode)} className={`rounded-lg px-2 py-1.5 text-xs ${dateMode === mode ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{({none:"없음",today:"오늘",tomorrow:"내일",custom:"직접 선택"})[mode]}</button>)}</div>{dateMode === "custom" && <input type="date" value={customDate} onChange={(event) => setCustomDate(event.target.value)} className="mt-2 rounded-lg border px-2 py-1 text-xs"/>}</fieldset></div>
      </div>
      </>}
      </fieldset>
      </div>
      {error && <p role="alert" className="mt-3 shrink-0 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex shrink-0 justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={close} disabled={isSaving} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">{createdNoteId ? "닫기" : "취소"}</button><button type="button" onClick={() => void save()} disabled={isSaving || (calendarEntry && shareEnabled && (selected.length === 0 || loadingEmployees || Boolean(employeeError))) || (dateMode === "custom" && !customDate) || (Boolean(editingNote) && !editingLock.canEdit)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isSaving ? "저장 중..." : createdNoteId ? "실패한 공유 요청 다시 보내기" : editingNote ? "일정 수정" : calendarEntry && shareEnabled ? "등록 및 공유 요청" : "일정 등록"}</button></div>
    </div>
  </div>;
}
