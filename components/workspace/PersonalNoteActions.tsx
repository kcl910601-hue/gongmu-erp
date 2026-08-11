"use client";

import { History, MessageCircle, MoreHorizontal, Pencil, Pin, Share2, Trash2 } from "lucide-react";
import { useAppShellUser } from "@/contexts/AppShellUserContext";
import { getPersonalNoteAccess, getPersonalNoteCommentBadge, type PersonalNote } from "@/lib/personal-notes";
import { isCalendarOnlyStaff } from "@/lib/permissions";

export function PersonalNoteActions({ note, commentsOpen, timelineOpen, onEdit, onShare, onTogglePin, onDelete, onToggleComments, onToggleTimeline, compact = false }: {
  note: PersonalNote;
  commentsOpen: boolean;
  timelineOpen: boolean;
  onEdit: () => void;
  onShare: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onToggleComments: () => void;
  onToggleTimeline: () => void;
  compact?: boolean;
}) {
  const { employee } = useAppShellUser();
  const readOnly = isCalendarOnlyStaff(employee);
  const access = getPersonalNoteAccess(note);
  const commentBadge = getPersonalNoteCommentBadge(note);
  const buttonClass = "rounded-lg p-1.5 text-slate-400 hover:bg-white/70 hover:text-blue-600";
  const actions = <>
    {!readOnly && access.canEdit && <button type="button" aria-label="수정" onClick={onEdit} className={buttonClass}><Pencil size={14}/></button>}
    {!readOnly && access.canShare && <button type="button" aria-label="공유" onClick={onShare} className={buttonClass}><Share2 size={14}/></button>}
    {!readOnly && access.canPin && <button type="button" aria-label="고정" onClick={onTogglePin} className={`${buttonClass} ${note.is_pinned ? "text-blue-600" : ""}`}><Pin size={14}/></button>}
    {!readOnly && access.canDelete && <button type="button" aria-label="삭제" onClick={onDelete} className={`${buttonClass} hover:text-red-500`}><Trash2 size={14}/></button>}
    {access.canComment && <button type="button" aria-label="댓글" onClick={onToggleComments} className={`${buttonClass} ${commentsOpen ? "text-blue-600" : ""}`}><MessageCircle size={14}/>{commentBadge && <span className="ml-0.5 text-[10px] font-bold">{commentBadge}</span>}</button>}
    {access.canViewTimeline && <button type="button" aria-label="활동 이력" onClick={onToggleTimeline} className={`${buttonClass} ${timelineOpen ? "text-blue-600" : ""}`}><History size={14}/></button>}
  </>;
  if (compact) return <details className="relative shrink-0" onClick={(event) => event.stopPropagation()}><summary aria-label="일정 액션 더보기" className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-lg text-slate-500 hover:bg-white [&::-webkit-details-marker]:hidden"><MoreHorizontal size={16}/></summary><div className="absolute right-0 top-8 z-30 flex min-w-max items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">{actions}</div></details>;
  return <div className="flex shrink-0 items-center gap-0.5" onClick={(event) => event.stopPropagation()}>{actions}</div>;
}
