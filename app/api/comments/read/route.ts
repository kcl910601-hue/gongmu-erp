import { getLmeContext } from "@/lib/lme-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const { supabase, user } = await getLmeContext();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const lastCommentId = typeof body.lastCommentId === "number" && Number.isSafeInteger(body.lastCommentId) && body.lastCommentId >= 0 ? body.lastCommentId : null;
  if (!UUID_PATTERN.test(itemId) || lastCommentId === null) return Response.json({ error: "댓글 읽음 대상을 확인해주세요." }, { status: 400 });
  const result = await supabase.rpc("mark_shared_comments_read", { p_item_id: itemId, p_last_comment_id: lastCommentId });
  if (result.error) return Response.json({ error: result.error.message }, { status: result.error.message.includes("comment_access_denied") ? 403 : 500 });
  return Response.json({ ok: true });
}
