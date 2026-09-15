"use client";

import { useEffect, useState } from "react";
import { Check, Circle, Copy, History, MessageCircle, X } from "lucide-react";
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
  const [commentsOpen, setCommentsOpen] = useState(() => typeof window !== "undefined" && /^#comment-\d+$/.test(window.location.hash));
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const sharingLabel = note.sharing?.permission === "owner"
    ? note.sharing.memberCount > 0 ? "공유 중" : "내 일정"
    : note.sharing ? "공유받음" : "내 일정";
  const permissionLabel = ({ owner: "소유자", view: "보기", edit: "편집" })[note.sharing?.permission ?? "owner"];
  const access = getPersonalNoteAccess(note);
  const canEdit = !isCalendarOnlyStaff(employee) && getPersonalNoteAccess(note).canEdit;
  const hasContent = note.content.trim().length > 0;

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
      <section role="dialog" aria-modal="true" aria-labelledby="personal-note-detail-title" className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="relative z-10 shrink-0 border-b border-slate-100 bg-white px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-violet-600">개인 일정 상세</p>
            <div className="ml-auto flex items-center gap-2">
              <PersonalNoteActions note={note} commentsOpen={commentsOpen} timelineOpen={timelineOpen} onEdit={onEdit} onShare={onShare} onTogglePin={onTogglePin} onDelete={onDelete} onToggleComments={() => setCommentsOpen((open) => !open)} onToggleTimeline={() => setTimelineOpen((open) => !open)}/>
              <button type="button" aria-label="상세 닫기" onClick={onClose} className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20}/></button>
            </div>
          </div>
          <h2 id="personal-note-detail-title" className="mt-2 max-h-[20dvh] overflow-y-auto whitespace-pre-wrap break-words text-xl font-bold leading-8 text-slate-900 [overflow-wrap:anywhere] sm:text-2xl">{note.title || "제목 없는 일정"}</h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <p className="break-words text-sm text-slate-600 [overflow-wrap:anywhere]">{note.due_date ?? "날짜 없음"} · 작성자 {authorName}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${note.is_completed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{note.is_completed && <Check size={12}/>} {note.is_completed ? "완료" : "진행 중"}</span>
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">{sharingLabel}</span>
                {note.is_pinned && <span className="text-slate-500">고정</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canEdit && <button type="button" onClick={onToggleCompleted} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${note.is_completed ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>{note.is_completed ? <Circle size={15}/> : <Check size={15}/>} {note.is_completed ? "완료 취소" : "완료 처리"}</button>}
            </div>
          </div>
        </header>
        <div className="relative z-0 min-h-0 flex-auto overflow-y-auto overscroll-contain px-5 pb-6 [scrollbar-gutter:stable] sm:px-6">
          <section className="py-5">
            <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-500">상세내용</h3>{copyButton}</div>
            {hasContent ? <p className="whitespace-pre-wrap break-words text-base leading-8 text-slate-800 [overflow-wrap:anywhere]">{note.content}</p> : <p className="py-4 text-sm text-slate-400">등록된 상세내용이 없습니다.</p>}
          </section>
          <div className="border-t border-slate-100 pt-4">
            <div className="flex flex-wrap gap-2">
              {access.canComment && <button type="button" aria-expanded={commentsOpen} aria-controls="personal-note-comments" onClick={() => setCommentsOpen((open) => !open)} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${commentsOpen ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"}`}><MessageCircle size={16}/>댓글 {getPersonalNoteCommentBadge(note) ?? "0"}</button>}
              {access.canViewTimeline && <button type="button" aria-expanded={timelineOpen} aria-controls="personal-note-timeline" onClick={() => setTimelineOpen((open) => !open)} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${timelineOpen ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"}`}><History size={16}/>변경 이력</button>}
            </div>
            {commentsOpen && access.canComment && <div id="personal-note-comments"><CommentSection itemId={note.id}/></div>}
            {timelineOpen && access.canViewTimeline && <div id="personal-note-timeline"><TimelineSection itemId={note.id}/></div>}
          </div>
          <details className="mt-5 border-t border-slate-100 pt-4">
            <summary className="cursor-pointer text-xs font-medium text-slate-400">일정 정보 더보기</summary>
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
          </details>
        </div>
      </section>
    </div>
  );
}
