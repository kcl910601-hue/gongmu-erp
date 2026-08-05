"use client";

import { Pencil, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditingLockNotice } from "@/components/editing/EditingLockNotice";
import { useEditingLock } from "@/hooks/useEditingLock";
import { COMMENT_MAX_LENGTH, type MentionableEmployee, type SharedComment } from "@/lib/comments";
import { clearLocalCommentMutation, COMMENTS_CHANGED_EVENT, dispatchCommentCountDelta, dispatchCommentUnreadCleared, markLocalCommentMutation, REFERENCE_TASKS_CHANGED_EVENT, scheduleCollaborationEvents } from "@/lib/collaboration-events";
import { toast } from "@/lib/toast";
import { AddReferenceTaskButton } from "@/components/workspace/AddReferenceTaskButton";
import type { ReferenceTask } from "@/lib/reference-tasks";

function formatCommentTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function CommentSection({ itemId }: { itemId: string }) {
  const [comments, setComments] = useState<SharedComment[]>([]);
  const [content, setContent] = useState("");
  const [employees, setEmployees] = useState<MentionableEmployee[]>([]);
  const [selectedMentions, setSelectedMentions] = useState<MentionableEmployee[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [referenceCommentIds, setReferenceCommentIds] = useState<Set<number>>(() => new Set());
  const savingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editingLock = useEditingLock("comment", editingId, editingId !== null);

  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLocaleLowerCase("ko-KR");
    const selectedIds = new Set(selectedMentions.map((employee) => employee.id));
    return employees.filter((employee) => !selectedIds.has(employee.id) && `${employee.name} ${employee.position ?? ""}`.toLocaleLowerCase("ko-KR").includes(query)).slice(0, 10);
  }, [employees, mentionQuery, selectedMentions]);

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError("");
    const response = await fetch(`/api/comments?itemId=${encodeURIComponent(itemId)}`, { cache: "no-store" });
    const result = await response.json() as { comments?: SharedComment[]; error?: string };
    if (!response.ok) setError(result.error ?? "댓글을 불러오지 못했습니다.");
    else {
      const loadedComments = result.comments ?? [];
      setComments(loadedComments);
      const lastCommentId = loadedComments.at(-1)?.id;
      if (lastCommentId !== undefined) void fetch("/api/comments/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, lastCommentId }) }).then((readResponse) => {
        if (readResponse.ok) dispatchCommentUnreadCleared(itemId);
      });
      const hashId = Number(window.location.hash.match(/^#comment-(\d+)$/)?.[1]);
      if (Number.isSafeInteger(hashId)) window.setTimeout(() => document.getElementById(`comment-${hashId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    }
    setLoading(false);
  }, [itemId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(true), 0);
    const handleRealtimeChange = () => void load(false);
    window.addEventListener(COMMENTS_CHANGED_EVENT, handleRealtimeChange);
    return () => { window.clearTimeout(timer); window.removeEventListener(COMMENTS_CHANGED_EVENT, handleRealtimeChange); };
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetch("/api/reference-tasks", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { tasks?: ReferenceTask[] };
      setReferenceCommentIds(new Set((result.tasks ?? []).flatMap((task) => task.commentId === null ? [] : [task.commentId])));
    }), 0);
    return () => window.clearTimeout(timer);
  }, [itemId]);

  async function ensureEmployeesLoaded() {
    if (employees.length > 0) return;
    const response = await fetch(`/api/comments?itemId=${encodeURIComponent(itemId)}&mentionable=1`, { cache: "no-store" });
    const result = await response.json() as { employees?: MentionableEmployee[] };
    if (response.ok) setEmployees(result.employees ?? []);
  }

  function handleContentChange(value: string, cursor: number) {
    setContent(value);
    setSelectedMentions((current) => current.filter((employee) => value.includes(`@${employee.name}`)));
    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) { setMentionQuery(null); setMentionStart(null); return; }
    const start = beforeCursor.lastIndexOf("@");
    setMentionQuery(match[1]); setMentionStart(start); setActiveMentionIndex(0);
    void ensureEmployeesLoaded();
  }

  function selectMention(employee: MentionableEmployee) {
    if (mentionStart === null) return;
    const cursor = textareaRef.current?.selectionStart ?? content.length;
    const nextContent = `${content.slice(0, mentionStart)}@${employee.name} ${content.slice(cursor)}`;
    setContent(nextContent);
    setSelectedMentions((current) => current.some((item) => item.id === employee.id) ? current : [...current, employee]);
    setMentionQuery(null); setMentionStart(null);
    window.setTimeout(() => { const nextCursor = mentionStart + employee.name.length + 2; textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(nextCursor, nextCursor); }, 0);
  }

  async function createComment() {
    const normalized = content.trim();
    if (!normalized || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError("");
    const response = await fetch("/api/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, content: normalized, mentions: selectedMentions.map((employee) => employee.id) }) });
    const result = await response.json() as { comment?: SharedComment; error?: string };
    if (!response.ok || !result.comment) setError(result.error ?? "댓글을 등록하지 못했습니다.");
    else {
      const saved = result.comment;
      markLocalCommentMutation(saved.id);
      setComments((current) => current.some((comment) => comment.id === saved.id) ? current : [...current, saved]);
      setContent(""); setSelectedMentions([]); setMentionQuery(null); dispatchCommentCountDelta(itemId, 1); toast.success("댓글을 등록했습니다.");
    }
    savingRef.current = false; setSaving(false);
  }

  async function updateComment(comment: SharedComment) {
    if (!editingLock.canEdit) return;
    const normalized = editingContent.trim();
    if (!normalized || savingRef.current) return;
    markLocalCommentMutation(comment.id); savingRef.current = true; setSaving(true); setError("");
    const response = await fetch(`/api/comments/${comment.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: normalized }) });
    const result = await response.json() as { comment?: SharedComment; error?: string };
    if (!response.ok || !result.comment) { clearLocalCommentMutation(comment.id); setError(result.error ?? "댓글을 수정하지 못했습니다."); }
    else { setComments((current) => current.map((item) => item.id === comment.id ? result.comment as SharedComment : item)); setEditingId(null); setEditingContent(""); scheduleCollaborationEvents([REFERENCE_TASKS_CHANGED_EVENT], 0); toast.success("댓글을 수정했습니다."); }
    savingRef.current = false; setSaving(false);
  }

  async function deleteComment(comment: SharedComment) {
    if (!window.confirm("이 댓글을 삭제하시겠습니까?\n삭제한 댓글은 복구할 수 없습니다.")) return;
    markLocalCommentMutation(comment.id);
    const response = await fetch(`/api/comments/${comment.id}`, { method: "DELETE" });
    const result = await response.json() as { error?: string };
    if (!response.ok) { clearLocalCommentMutation(comment.id); setError(result.error ?? "댓글을 삭제하지 못했습니다."); return; }
    setComments((current) => current.filter((item) => item.id !== comment.id)); dispatchCommentCountDelta(itemId, -1); toast.success("댓글을 삭제했습니다.");
  }

  return <section className="mt-3 border-t border-slate-200/70 pt-3" onClick={(event) => event.stopPropagation()}>
    {editingId !== null && <EditingLockNotice state={editingLock.state} lock={editingLock.lock} error={editingLock.error}/>}<h4 className="text-xs font-bold text-slate-700">댓글 {comments.length}</h4>
    {loading ? <p className="py-3 text-xs text-slate-400">댓글을 불러오는 중...</p> : comments.length === 0 ? <p className="py-3 text-xs text-slate-400">아직 댓글이 없습니다. 첫 댓글을 남겨보세요.</p> : <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">{comments.map((comment) => <article id={`comment-${comment.id}`} key={comment.id} className="scroll-m-4 rounded-xl bg-white/80 p-3 text-xs shadow-sm target:ring-2 target:ring-blue-300">
      <div className="flex items-center gap-2"><span className="font-bold text-slate-700">{comment.author?.name ?? "알 수 없음"}</span>{comment.author?.position && <span className="text-slate-400">{comment.author.position}</span>}<span className="ml-auto text-[10px] text-slate-400">{formatCommentTime(comment.created_at)}{comment.updated_at !== comment.created_at ? " · 수정됨" : ""}</span></div>
      {editingId === comment.id ? <div className="mt-2"><textarea rows={3} maxLength={COMMENT_MAX_LENGTH} value={editingContent} onChange={(event) => setEditingContent(event.target.value)} className="w-full resize-y rounded-lg border border-slate-200 px-2 py-1.5 outline-none focus:border-blue-400"/><div className="mt-1 flex justify-end gap-1"><button type="button" disabled={saving} onClick={() => setEditingId(null)} className="rounded-lg px-2 py-1 text-slate-500">취소</button><button type="button" disabled={saving || !editingContent.trim()} onClick={() => void updateComment(comment)} className="rounded-lg bg-blue-600 px-2 py-1 font-semibold text-white disabled:opacity-40">저장</button></div></div> : <><p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{comment.content}</p>{comment.mentions.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{comment.mentions.map((mention) => <span key={mention.employeeId} title={mention.position ?? undefined} className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">@{mention.name}</span>)}</div>}<div className="mt-2 flex items-center justify-end gap-1"><AddReferenceTaskButton key={`${comment.id}-${referenceCommentIds.has(comment.id)}`} commentId={comment.id} added={referenceCommentIds.has(comment.id)} onAdded={(commentId) => setReferenceCommentIds((current) => new Set(current).add(commentId))}/>{comment.canEdit && <button type="button" aria-label="댓글 수정" onClick={() => { setEditingId(comment.id); setEditingContent(comment.content); }} className="rounded-lg p-1 text-slate-400 hover:text-blue-600"><Pencil size={12}/></button>}{comment.canDelete && <button type="button" aria-label="댓글 삭제" onClick={() => void deleteComment(comment)} className="rounded-lg p-1 text-slate-400 hover:text-red-600"><Trash2 size={12}/></button>}</div></>}
    </article>)}</div>}
    <div className="relative mt-3"><textarea ref={textareaRef} rows={3} maxLength={COMMENT_MAX_LENGTH} value={content} onChange={(event) => handleContentChange(event.target.value, event.target.selectionStart)} onKeyDown={(event) => { if (mentionQuery !== null && suggestions.length > 0) { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActiveMentionIndex((current) => (current + (event.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length); return; } if (event.key === "Enter") { event.preventDefault(); selectMention(suggestions[activeMentionIndex]); return; } if (event.key === "Escape") { setMentionQuery(null); return; } } if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void createComment(); } }} placeholder="댓글을 입력하세요. @로 참여자를 멘션할 수 있습니다." className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400"/>
      {mentionQuery !== null && <div className="absolute bottom-full z-20 mb-1 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">{suggestions.length === 0 ? <p className="px-2 py-2 text-xs text-slate-400">멘션할 참여자가 없습니다.</p> : suggestions.map((employee, index) => <button key={employee.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectMention(employee)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs ${index === activeMentionIndex ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}><span className="font-semibold">{employee.name}</span><span className="text-slate-400">{employee.position ?? "직책 없음"}</span></button>)}</div>}
      {selectedMentions.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{selectedMentions.map((employee) => <span key={employee.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">@{employee.name}<button type="button" aria-label={`${employee.name} 멘션 제거`} onClick={() => setSelectedMentions((current) => current.filter((item) => item.id !== employee.id))}><X size={10}/></button></span>)}</div>}
      <div className="mt-1 flex items-center justify-between"><span className="text-[10px] text-slate-400">{content.length.toLocaleString("ko-KR")} / {COMMENT_MAX_LENGTH.toLocaleString("ko-KR")}</span><button type="button" disabled={saving || !content.trim()} onClick={() => void createComment()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{saving ? "등록 중..." : "등록"}</button></div>
    </div>
    {error && <div className="mt-2 flex items-center justify-between rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600"><span>{error}</span><button type="button" onClick={() => void load()} className="font-semibold">재시도</button></div>}
  </section>;
}
