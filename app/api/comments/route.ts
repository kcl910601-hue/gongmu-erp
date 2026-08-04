import { canAccessComments, getCommentPermissions, normalizeCommentContent } from "@/lib/comments";
import { getLmeContext } from "@/lib/lme-server";

async function resolveCommentAccess(itemId: string, createForOwner = false) {
  const { supabase, user, employee } = await getLmeContext();
  if (!user || !employee) return { error: Response.json({ error: "승인된 로그인이 필요합니다." }, { status: 401 }) } as const;
  const noteResult = await supabase.from("personal_notes").select("id,user_id").eq("id", itemId).maybeSingle();
  if (noteResult.error) return { error: Response.json({ error: noteResult.error.message }, { status: 500 }) } as const;
  if (!noteResult.data) return { error: Response.json({ error: "원본 일정을 찾을 수 없습니다." }, { status: 404 }) } as const;
  let sharedResult = await supabase.from("shared_items").select("id,owner_id").eq("item_id", itemId).maybeSingle();
  if (sharedResult.error) return { error: Response.json({ error: sharedResult.error.message }, { status: 500 }) } as const;
  if (!sharedResult.data && noteResult.data.user_id === user.id && createForOwner) {
    const ensured = await supabase.rpc("ensure_shared_item_for_comment", { p_item_id: itemId });
    if (ensured.error) return { error: Response.json({ error: ensured.error.message }, { status: 409 }) } as const;
    sharedResult = await supabase.from("shared_items").select("id,owner_id").eq("id", ensured.data).maybeSingle();
  }
  if (!sharedResult.data) {
    if (noteResult.data.user_id === user.id) return { supabase, employee, sharedItemId: null, ownerId: employee.id } as const;
    return { error: Response.json({ error: "댓글 접근 권한이 없습니다." }, { status: 403 }) } as const;
  }
  const ownerId = Number(sharedResult.data.owner_id);
  if (ownerId !== employee.id) {
    const memberResult = await supabase.from("shared_item_members").select("employee_id,permission").eq("shared_item_id", sharedResult.data.id).eq("employee_id", employee.id).maybeSingle();
    if (memberResult.error) return { error: Response.json({ error: memberResult.error.message }, { status: 500 }) } as const;
    const member = memberResult.data ? { employeeId: Number(memberResult.data.employee_id), permission: memberResult.data.permission as "view" | "edit" } : null;
    if (!canAccessComments(employee.id, ownerId, member)) return { error: Response.json({ error: "댓글 접근 권한이 없습니다." }, { status: 403 }) } as const;
  }
  return { supabase, employee, sharedItemId: sharedResult.data.id, ownerId } as const;
}

export async function GET(request: Request) {
  const itemId = new URL(request.url).searchParams.get("itemId") ?? "";
  if (!itemId) return Response.json({ error: "원본 일정을 확인해주세요." }, { status: 400 });
  const access = await resolveCommentAccess(itemId);
  if ("error" in access) return access.error;
  if (!access.sharedItemId) return Response.json({ comments: [] });
  const result = await access.supabase.from("shared_comments").select("id,shared_item_id,author_id,content,created_at,updated_at,author:employees!shared_comments_author_id_fkey(id,name,position)").eq("shared_item_id", access.sharedItemId).order("created_at", { ascending: true }).limit(500);
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  return Response.json({ comments: (result.data ?? []).map((comment) => ({ ...comment, ...getCommentPermissions(access.employee.id, access.ownerId, Number(comment.author_id)) })) });
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!itemId) return Response.json({ error: "원본 일정을 확인해주세요." }, { status: 400 });
  const normalized = normalizeCommentContent(body.content);
  if (normalized.error) return Response.json({ error: normalized.error }, { status: 400 });
  const access = await resolveCommentAccess(itemId, true);
  if ("error" in access) return access.error;
  if (!access.sharedItemId) return Response.json({ error: "댓글 연결 정보를 만들지 못했습니다." }, { status: 500 });
  const result = await access.supabase.from("shared_comments").insert({ shared_item_id: access.sharedItemId, author_id: access.employee.id, content: normalized.content }).select("id,shared_item_id,author_id,content,created_at,updated_at,author:employees!shared_comments_author_id_fkey(id,name,position)").single();
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  return Response.json({ comment: { ...result.data, ...getCommentPermissions(access.employee.id, access.ownerId, access.employee.id) } }, { status: 201 });
}
