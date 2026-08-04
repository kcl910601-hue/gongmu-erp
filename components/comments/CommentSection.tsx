"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { COMMENT_MAX_LENGTH, type SharedComment } from "@/lib/comments";
import { toast } from "@/lib/toast";
import { dispatchPersonalNotesChanged } from "@/lib/personal-notes";
import { COMMENTS_CHANGED_EVENT } from "@/lib/collaboration-events";

function formatCommentTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function CommentSection({ itemId }: { itemId: string }) {
  const [comments, setComments] = useState<SharedComment[]>([]);
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const response = await fetch(`/api/comments?itemId=${encodeURIComponent(itemId)}`, { cache: "no-store" });
    const result = await response.json() as { comments?: SharedComment[]; error?: string };
    if (!response.ok) setError(result.error ?? "댓글을 불러오지 못했습니다."); else setComments(result.comments ?? []);
    setLoading(false);
  }, [itemId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    window.addEventListener(COMMENTS_CHANGED_EVENT, load);
    return () => { window.clearTimeout(timer); window.removeEventListener(COMMENTS_CHANGED_EVENT, load); };
  }, [load]);

  async function createComment() {
    const normalized = content.trim();
    if (!normalized || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError("");
    const response = await fetch("/api/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, content: normalized }) });
    const result = await response.json() as { comment?: SharedComment; error?: string };
    if (!response.ok || !result.comment) setError(result.error ?? "댓글을 등록하지 못했습니다.");
    else { setComments((current) => [...current, result.comment as SharedComment]); setContent(""); dispatchPersonalNotesChanged(); toast.success("댓글을 등록했습니다."); }
    savingRef.current = false; setSaving(false);
  }

  async function updateComment(comment: SharedComment) {
    const normalized = editingContent.trim();
    if (!normalized || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError("");
    const response = await fetch(`/api/comments/${comment.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: normalized }) });
    const result = await response.json() as { comment?: SharedComment; error?: string };
    if (!response.ok || !result.comment) setError(result.error ?? "댓글을 수정하지 못했습니다.");
    else { setComments((current) => current.map((item) => item.id === comment.id ? result.comment as SharedComment : item)); setEditingId(null); setEditingContent(""); dispatchPersonalNotesChanged(); toast.success("댓글을 수정했습니다."); }
    savingRef.current = false; setSaving(false);
  }

  async function deleteComment(comment: SharedComment) {
    if (!window.confirm("이 댓글을 삭제하시겠습니까?\n삭제한 댓글은 복구할 수 없습니다.")) return;
    const response = await fetch(`/api/comments/${comment.id}`, { method: "DELETE" });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setError(result.error ?? "댓글을 삭제하지 못했습니다."); return; }
    setComments((current) => current.filter((item) => item.id !== comment.id));
    dispatchPersonalNotesChanged();
    toast.success("댓글을 삭제했습니다.");
  }

  return <section className="mt-3 border-t border-slate-200/70 pt-3" onClick={(event) => event.stopPropagation()}>
    <h4 className="text-xs font-bold text-slate-700">댓글 {comments.length}</h4>
    {loading ? <p className="py-3 text-xs text-slate-400">댓글을 불러오는 중...</p> : comments.length === 0 ? <p className="py-3 text-xs text-slate-400">아직 댓글이 없습니다. 첫 댓글을 남겨보세요.</p> : <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">{comments.map((comment) => <article key={comment.id} className="rounded-xl bg-white/80 p-3 text-xs shadow-sm">
      <div className="flex items-center gap-2"><span className="font-bold text-slate-700">{comment.author?.name ?? "알 수 없음"}</span>{comment.author?.position && <span className="text-slate-400">{comment.author.position}</span>}<span className="ml-auto text-[10px] text-slate-400">{formatCommentTime(comment.created_at)}{comment.updated_at !== comment.created_at ? " · 수정됨" : ""}</span></div>
      {editingId === comment.id ? <div className="mt-2"><textarea rows={3} maxLength={COMMENT_MAX_LENGTH} value={editingContent} onChange={(event) => setEditingContent(event.target.value)} className="w-full resize-y rounded-lg border border-slate-200 px-2 py-1.5 outline-none focus:border-blue-400"/><div className="mt-1 flex justify-end gap-1"><button type="button" disabled={saving} onClick={() => setEditingId(null)} className="rounded-lg px-2 py-1 text-slate-500">취소</button><button type="button" disabled={saving || !editingContent.trim()} onClick={() => void updateComment(comment)} className="rounded-lg bg-blue-600 px-2 py-1 font-semibold text-white disabled:opacity-40">저장</button></div></div> : <><p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{comment.content}</p><div className="mt-1 flex justify-end gap-1">{comment.canEdit && <button type="button" aria-label="댓글 수정" onClick={() => { setEditingId(comment.id); setEditingContent(comment.content); }} className="rounded-lg p-1 text-slate-400 hover:text-blue-600"><Pencil size={12}/></button>}{comment.canDelete && <button type="button" aria-label="댓글 삭제" onClick={() => void deleteComment(comment)} className="rounded-lg p-1 text-slate-400 hover:text-red-600"><Trash2 size={12}/></button>}</div></>}
    </article>)}</div>}
    <div className="mt-3"><textarea rows={3} maxLength={COMMENT_MAX_LENGTH} value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void createComment(); } }} placeholder="댓글을 입력하세요..." className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400"/><div className="mt-1 flex items-center justify-between"><span className="text-[10px] text-slate-400">{content.length.toLocaleString("ko-KR")} / {COMMENT_MAX_LENGTH.toLocaleString("ko-KR")}</span><button type="button" disabled={saving || !content.trim()} onClick={() => void createComment()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{saving ? "등록 중..." : "등록"}</button></div></div>
    {error && <div className="mt-2 flex items-center justify-between rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600"><span>{error}</span><button type="button" onClick={() => void load()} className="font-semibold">재시도</button></div>}
  </section>;
}
