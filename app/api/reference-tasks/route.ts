import type { SupabaseClient } from "@supabase/supabase-js";
import { getLmeContext } from "@/lib/lme-server";
import { normalizeReferenceTaskOptions } from "@/lib/reference-tasks";

type RawReferenceTask = { id: string; comment_id: number | null; shared_item_id: string | null; title: string; due_date: string | null; priority: "low" | "normal" | "high"; status: "pending" | "completed"; created_at: string; completed_at: string | null };
type RawSourceComment = {
  id: number; content: string;
  author: { name: string } | { name: string }[] | null;
  shared_item: { item_id: string; item: { title: string | null; content: string } | { title: string | null; content: string }[] | null } | Array<{ item_id: string; item: { title: string | null; content: string } | { title: string | null; content: string }[] | null }> | null;
};

async function loadTasks(supabase: SupabaseClient) {
  const taskResult = await supabase.from("reference_tasks").select("id,comment_id,shared_item_id,title,due_date,priority,status,created_at,completed_at").order("created_at", { ascending: false }).limit(200);
  if (taskResult.error) return { data: null, error: taskResult.error } as const;
  const tasks = (taskResult.data ?? []) as RawReferenceTask[];
  const commentIds = tasks.flatMap((task) => task.comment_id === null ? [] : [task.comment_id]);
  const commentResult = commentIds.length === 0 ? { data: [], error: null } : await supabase.from("shared_comments").select("id,content,author:employees!shared_comments_author_id_fkey(name),shared_item:shared_items!inner(item_id,item:personal_notes!shared_items_item_id_fkey(title,content))").in("id", commentIds);
  if (commentResult.error) return { data: null, error: commentResult.error } as const;
  const comments = new Map(((commentResult.data ?? []) as unknown as RawSourceComment[]).map((comment) => [Number(comment.id), comment]));
  return { data: tasks.map((task) => {
    const comment = task.comment_id === null ? null : comments.get(task.comment_id) ?? null;
    const author = comment ? (Array.isArray(comment.author) ? comment.author[0] : comment.author) : null;
    const sharedItem = comment ? (Array.isArray(comment.shared_item) ? comment.shared_item[0] : comment.shared_item) : null;
    const item = sharedItem ? (Array.isArray(sharedItem.item) ? sharedItem.item[0] : sharedItem.item) : null;
    return {
      id: task.id, commentId: task.comment_id, sharedItemId: task.shared_item_id, title: task.title, dueDate: task.due_date, priority: task.priority, status: task.status,
      createdAt: task.created_at, completedAt: task.completed_at,
      source: comment && sharedItem && item ? { commentId: comment.id, content: comment.content, authorName: author?.name ?? "알 수 없음", itemId: sharedItem.item_id, itemTitle: item.title || item.content || "공유 일정" } : null,
    };
  }), error: null } as const;
}

export async function GET() {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const result = await loadTasks(supabase);
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  return Response.json({ tasks: result.data });
}

export async function POST(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const commentId = Number(body.commentId);
  if (!Number.isSafeInteger(commentId) || commentId <= 0) return Response.json({ error: "원본 댓글을 확인해주세요." }, { status: 400 });
  const normalized = normalizeReferenceTaskOptions(body);
  if (normalized.error) return Response.json({ error: normalized.error }, { status: 400 });
  const existing = await supabase.from("reference_tasks").select("id").eq("assigned_to", employee.id).eq("comment_id", commentId).maybeSingle();
  if (existing.error) return Response.json({ error: existing.error.message }, { status: 500 });
  const created = await supabase.rpc("create_reference_task", { p_comment_id: commentId, p_title: normalized.options.title, p_due_date: normalized.options.dueDate, p_priority: normalized.options.priority });
  if (created.error) return Response.json({ error: created.error.message }, { status: created.error.message.includes("not_authorized") ? 403 : 409 });
  const tasks = await loadTasks(supabase);
  if (tasks.error) return Response.json({ error: tasks.error.message }, { status: 500 });
  const task = tasks.data.find((entry) => entry.id === created.data);
  if (!task) return Response.json({ error: "생성된 내 할 일을 찾지 못했습니다." }, { status: 500 });
  return Response.json({ task, created: !existing.data }, { status: existing.data ? 200 : 201 });
}
