"use client";

import { History, MessageCircle, Pencil, Pin, Share2, Trash2 } from "lucide-react";
import { getPersonalNoteAccess, getPersonalNoteCommentBadge, type PersonalNote } from "@/lib/personal-notes";

export function PersonalNoteActions({ note, commentsOpen, timelineOpen, onEdit, onShare, onTogglePin, onDelete, onToggleComments, onToggleTimeline }: {
  note: PersonalNote;
  commentsOpen: boolean;
  timelineOpen: boolean;
  onEdit: () => void;
  onShare: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onToggleComments: () => void;
  onToggleTimeline: () => void;
}) {
  const access = getPersonalNoteAccess(note);
  const commentBadge = getPersonalNoteCommentBadge(note);
  const buttonClass = "rounded-lg p-1.5 text-slate-400 hover:bg-white/70 hover:text-blue-600";
  return <div className="flex shrink-0 items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
    {access.canEdit && <button type="button" aria-label="수정" onClick={onEdit} className={buttonClass}><Pencil size={14}/></button>}
    {access.canShare && <button type="button" aria-label="공유" onClick={onShare} className={buttonClass}><Share2 size={14}/></button>}
    {access.canPin && <button type="button" aria-label="고정" onClick={onTogglePin} className={`${buttonClass} ${note.is_pinned ? "text-blue-600" : ""}`}><Pin size={14}/></button>}
    {access.canDelete && <button type="button" aria-label="삭제" onClick={onDelete} className={`${buttonClass} hover:text-red-500`}><Trash2 size={14}/></button>}
    {access.canComment && <button type="button" aria-label="댓글" onClick={onToggleComments} className={`${buttonClass} ${commentsOpen ? "text-blue-600" : ""}`}><MessageCircle size={14}/>{commentBadge && <span className="ml-0.5 text-[10px] font-bold">{commentBadge}</span>}</button>}
    {access.canViewTimeline && <button type="button" aria-label="활동 이력" onClick={onToggleTimeline} className={`${buttonClass} ${timelineOpen ? "text-blue-600" : ""}`}><History size={14}/></button>}
  </div>;
}
