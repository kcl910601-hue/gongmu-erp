import type { PersonalNote } from "./personal-notes.ts";

export type CommentCountStat = { total: number; unread: number };
export type CommentCountMap = Record<string, CommentCountStat>;

export function applyCommentCounts(notes: PersonalNote[], counts: CommentCountMap) {
  return notes.map((note) => {
    const count = counts[note.id];
    if (!count || ((note.comment_count ?? 0) === count.total && (note.unread_comment_count ?? 0) === count.unread)) return note;
    return { ...note, comment_count: count.total, unread_comment_count: count.unread };
  });
}

export async function loadCommentCounts(itemIds: string[]) {
  const uniqueIds = [...new Set(itemIds)];
  if (uniqueIds.length === 0) return {};
  const response = await fetch(`/api/comments/counts?itemIds=${encodeURIComponent(uniqueIds.join(","))}`, { cache: "no-store" });
  const result = await response.json() as { counts?: CommentCountMap; error?: string };
  if (!response.ok) throw new Error(result.error ?? "댓글 개수를 불러오지 못했습니다.");
  return result.counts ?? {};
}
