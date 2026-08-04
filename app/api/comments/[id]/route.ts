import { normalizeCommentContent } from "@/lib/comments";
import { getLmeContext } from "@/lib/lme-server";

async function getCommentContext(id: number) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return { error: Response.json({ error: "승인된 로그인이 필요합니다." }, { status: 401 }) } as const;
  const result = await supabase.from("shared_comments").select("id,author_id,shared_item_id,shared_item:shared_items!inner(owner_id)").eq("id", id).maybeSingle();
  if (result.error) return { error: Response.json({ error: result.error.message }, { status: 500 }) } as const;
  if (!result.data) return { error: Response.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 }) } as const;
  const sharedItem = Array.isArray(result.data.shared_item) ? result.data.shared_item[0] : result.data.shared_item;
  return { supabase, employee, comment: result.data, ownerId: Number(sharedItem?.owner_id) } as const;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) return Response.json({ error: "댓글을 확인해주세요." }, { status: 400 });
  const body = await request.json() as Record<string, unknown>;
  const normalized = normalizeCommentContent(body.content);
  if (normalized.error) return Response.json({ error: normalized.error }, { status: 400 });
  const context = await getCommentContext(id);
  if ("error" in context) return context.error;
  if (Number(context.comment.author_id) !== context.employee.id) return Response.json({ error: "본인 댓글만 수정할 수 있습니다." }, { status: 403 });
  const result = await context.supabase.from("shared_comments").update({ content: normalized.content }).eq("id", id).eq("author_id", context.employee.id).select("id,shared_item_id,author_id,content,created_at,updated_at,author:employees!shared_comments_author_id_fkey(id,name,position)").maybeSingle();
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  if (!result.data) return Response.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ comment: { ...result.data, canEdit: true, canDelete: true } });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) return Response.json({ error: "댓글을 확인해주세요." }, { status: 400 });
  const context = await getCommentContext(id);
  if ("error" in context) return context.error;
  const canDelete = Number(context.comment.author_id) === context.employee.id || context.ownerId === context.employee.id;
  if (!canDelete) return Response.json({ error: "댓글 삭제 권한이 없습니다." }, { status: 403 });
  const result = await context.supabase.from("shared_comments").delete().eq("id", id).select("id").maybeSingle();
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  if (!result.data) return Response.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ deleted: true });
}
