import { canAccessComments, getCommentPermissions, normalizeCommentContent, normalizeCommentMentionIds } from "@/lib/comments";
import { getLmeContext } from "@/lib/lme-server";

const COMMENT_SELECT = "id,shared_item_id,author_id,content,created_at,updated_at,author:employees!shared_comments_author_id_fkey(id,name,position),mentions:shared_comment_mentions(employee_id,employee:employees!shared_comment_mentions_employee_id_fkey(id,name,position))";

type RawComment = {
  id: number; shared_item_id: string; author_id: number; content: string; created_at: string; updated_at: string;
  author: { id: number; name: string; position: string | null } | { id: number; name: string; position: string | null }[] | null;
  mentions?: Array<{ employee_id: number; employee: { id: number; name: string; position: string | null } | { id: number; name: string; position: string | null }[] | null }>;
};

function serializeComment(comment: RawComment, currentEmployeeId: number, ownerId: number) {
  const author = Array.isArray(comment.author) ? comment.author[0] ?? null : comment.author;
  return {
    ...comment,
    author,
    mentions: (comment.mentions ?? []).flatMap((mention) => {
      const employee = Array.isArray(mention.employee) ? mention.employee[0] : mention.employee;
      return employee ? [{ employeeId: Number(mention.employee_id), name: employee.name, position: employee.position }] : [];
    }),
    ...getCommentPermissions(currentEmployeeId, ownerId, Number(comment.author_id)),
  };
}

async function resolveCommentAccess(itemId: string, createForOwner = false) {
  const { supabase, user, employee } = await getLmeContext();
  if (!user || !employee) return { error: Response.json({ error: "인증된 로그인이 필요합니다." }, { status: 401 }) } as const;
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
  const searchParams = new URL(request.url).searchParams;
  const itemId = searchParams.get("itemId") ?? "";
  if (!itemId) return Response.json({ error: "원본 일정을 확인해주세요." }, { status: 400 });
  const access = await resolveCommentAccess(itemId);
  if ("error" in access) return access.error;
  if (!access.sharedItemId) return Response.json(searchParams.get("mentionable") === "1" ? { employees: [] } : { comments: [] });

  if (searchParams.get("mentionable") === "1") {
    const members = await access.supabase.from("shared_item_members").select("employee_id").eq("shared_item_id", access.sharedItemId);
    if (members.error) return Response.json({ error: members.error.message }, { status: 500 });
    const ids = [...new Set([access.ownerId, ...(members.data ?? []).map((member) => Number(member.employee_id))])].filter((id) => id !== access.employee.id);
    if (ids.length === 0) return Response.json({ employees: [] });
    const employees = await access.supabase.from("employees").select("id,name,position").in("id", ids).eq("active", true).eq("approval_status", "approved").order("name").limit(100);
    if (employees.error) return Response.json({ error: employees.error.message }, { status: 500 });
    return Response.json({ employees: employees.data ?? [] });
  }

  const result = await access.supabase.from("shared_comments").select(COMMENT_SELECT).eq("shared_item_id", access.sharedItemId).order("created_at", { ascending: true }).limit(500);
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  return Response.json({ comments: ((result.data ?? []) as unknown as RawComment[]).map((comment) => serializeComment(comment, access.employee.id, access.ownerId)) });
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!itemId) return Response.json({ error: "원본 일정을 확인해주세요." }, { status: 400 });
  const normalized = normalizeCommentContent(body.content);
  if (normalized.error) return Response.json({ error: normalized.error }, { status: 400 });
  const normalizedMentions = normalizeCommentMentionIds(body.mentions);
  if (normalizedMentions.error) return Response.json({ error: normalizedMentions.error }, { status: 400 });
  const access = await resolveCommentAccess(itemId, true);
  if ("error" in access) return access.error;
  if (!access.sharedItemId) return Response.json({ error: "댓글 연결 정보를 만들지 못했습니다." }, { status: 500 });
  const created = await access.supabase.rpc("create_shared_comment_with_mentions", { p_shared_item_id: access.sharedItemId, p_content: normalized.content, p_mention_employee_ids: normalizedMentions.mentionIds });
  if (created.error) return Response.json({ error: created.error.message }, { status: 500 });
  const result = await access.supabase.from("shared_comments").select(COMMENT_SELECT).eq("id", created.data).single();
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  return Response.json({ comment: serializeComment(result.data as unknown as RawComment, access.employee.id, access.ownerId) }, { status: 201 });
}
