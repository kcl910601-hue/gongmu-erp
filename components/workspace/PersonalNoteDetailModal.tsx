"use client";

import { useEffect, useState } from "react";
import { Check, Circle, Copy, X } from "lucide-react";
import { CommentSection } from "@/components/comments/CommentSection";
import { TimelineSection } from "@/components/timeline/TimelineSection";
import { PersonalNoteActions } from "@/components/workspace/PersonalNoteActions";
import { getPersonalNoteAccess, getPersonalNoteCommentBadge, type PersonalNote } from "@/lib/personal-notes";
import { useAppShellUser } from "@/contexts/AppShellUserContext";
import { isCalendarOnlyStaff } from "@/lib/permissions";
import { toast } from "@/lib/toast";

const noteTypeLabels: Record<PersonalNote["note_type"], string> = {
  memo: "메모",
  todo: "TODO",
  sticky: "고정 메모",
  reminder: "알림",
};

const colorLabels: Record<PersonalNote["color"], string> = {
  default: "기본",
  yellow: "노랑",
  green: "초록",
  red: "빨강",
  blue: "파랑",
};

export function PersonalNoteDetailModal({ note, authorName, onClose, onEdit, onShare, onTogglePin, onToggleCompleted, onDelete }: {
  note: PersonalNote;
  authorName: string;
  onClose: () => void;
  onEdit: () => void;
  onShare: () => void;
  onTogglePin: () => void;
  onToggleCompleted: () => void;
  onDelete: () => void;
}) {
  const { employee } = useAppShellUser();
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const sharingLabel = note.sharing?.permission === "owner"
    ? note.sharing.memberCount > 0 ? "공유 중" : "내 일정"
    : note.sharing ? "공유받음" : "내 일정";
  const permissionLabel = note.sharing?.permission ?? "owner";
  const canEdit = !isCalendarOnlyStaff(employee) && getPersonalNoteAccess(note).canEdit;
  const hasContent = note.content.trim().length > 0;
  const hasSeparateContent = hasContent && note.content !== note.title;

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(note.content);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1600);
    } catch {
      toast.error("일정 내용을 복사하지 못했습니다.");
    }
  }

  const copyButton = hasContent ? <button type="button" aria-label="내용 복사" title={isCopied ? "복사됨" : "내용 복사"} onClick={() => void copyContent()} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-400 transition-colors hover:bg-slate-100 hover:text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-100">{isCopied ? <Check size={14}/> : <Copy size={14}/>} {isCopied ? "복사됨" : "복사"}</button> : null;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="개인 일정 상세" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-violet-600">개인 일정 상세</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className={`break-words text-xl font-bold ${note.is_completed ? "text-slate-500 line-through" : "text-slate-900"}`}>{note.title || note.content}</h2>
              {note.is_completed && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><Check size={12}/>완료</span>}
              {!hasSeparateContent && copyButton}
            </div>
          </div>
          <PersonalNoteActions note={note} commentsOpen={commentsOpen} timelineOpen={timelineOpen} onEdit={onEdit} onShare={onShare} onTogglePin={onTogglePin} onDelete={onDelete} onToggleComments={() => setCommentsOpen((open) => !open)} onToggleTimeline={() => setTimelineOpen((open) => !open)}/>
          <button type="button" aria-label="상세 닫기" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18}/></button>
        </div>

        {canEdit && <button type="button" onClick={onToggleCompleted} className={`mt-4 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${note.is_completed ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>{note.is_completed ? <Circle size={15}/> : <Check size={15}/>} {note.is_completed ? "미완료로 전환" : "완료로 전환"}</button>}

        {hasSeparateContent && <section className="mt-4 rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold text-slate-500">내용</h3>{copyButton}</div><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{note.content}</p></section>}

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-200 p-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-400">날짜</dt><dd className="mt-1 font-medium text-slate-700">{note.due_date ?? "날짜 없음"}</dd></div>
          <div><dt className="text-xs text-slate-400">유형</dt><dd className="mt-1 font-medium text-slate-700">{noteTypeLabels[note.note_type]}</dd></div>
          <div><dt className="text-xs text-slate-400">색상</dt><dd className="mt-1 font-medium text-slate-700">{colorLabels[note.color]}</dd></div>
          <div><dt className="text-xs text-slate-400">완료 여부</dt><dd className="mt-1 font-medium text-slate-700">{note.is_completed ? "완료" : "진행 중"}</dd></div>
          <div><dt className="text-xs text-slate-400">고정 여부</dt><dd className="mt-1 font-medium text-slate-700">{note.is_pinned ? "고정" : "고정 안 함"}</dd></div>
          <div><dt className="text-xs text-slate-400">소유자</dt><dd className="mt-1 font-medium text-slate-700">{authorName}</dd></div>
          <div><dt className="text-xs text-slate-400">공유 상태</dt><dd className="mt-1 font-medium text-slate-700">{sharingLabel}</dd></div>
          <div><dt className="text-xs text-slate-400">내 권한</dt><dd className="mt-1 font-medium text-slate-700">{permissionLabel}</dd></div>
          <div><dt className="text-xs text-slate-400">참여자 수</dt><dd className="mt-1 font-medium text-slate-700">{note.sharing?.memberCount ?? 0}명</dd></div>
          <div><dt className="text-xs text-slate-400">댓글 수</dt><dd className="mt-1 font-medium text-slate-700">{getPersonalNoteCommentBadge(note) ?? "0"}개</dd></div>
        </dl>

        {commentsOpen && <CommentSection itemId={note.id}/>} 
        {timelineOpen && <TimelineSection itemId={note.id}/>} 
      </section>
    </div>
  );
}
