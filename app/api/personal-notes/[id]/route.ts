import { getLmeContext } from "@/lib/lme-server";
import { PERSONAL_NOTE_COLORS, PERSONAL_NOTE_TYPES } from "@/lib/personal-notes";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, employee } = await getLmeContext();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const noteResult = await supabase.from("personal_notes").select("id,user_id,title,content").eq("id", id).maybeSingle();
  if (noteResult.error) return Response.json({ error: noteResult.error.message }, { status: 500 });
  if (!noteResult.data) return Response.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });
  if (noteResult.data.user_id !== user.id) {
    if (!employee) return Response.json({ error: "수정 권한이 없습니다." }, { status: 403 });
    const sharedResult = await supabase.from("shared_items").select("id").eq("item_id", id).maybeSingle();
    if (sharedResult.error) return Response.json({ error: sharedResult.error.message }, { status: 500 });
    if (!sharedResult.data) return Response.json({ error: "수정 권한이 없습니다." }, { status: 403 });
    const memberResult = await supabase.from("shared_item_members").select("id").eq("shared_item_id", sharedResult.data.id).eq("employee_id", employee.id).eq("permission", "edit").maybeSingle();
    if (memberResult.error) return Response.json({ error: memberResult.error.message }, { status: 500 });
    if (!memberResult.data) return Response.json({ error: "수정 권한이 없습니다." }, { status: 403 });
  }
  const body = await request.json() as Record<string, unknown>;
  const changes: Record<string, string | boolean | number | null> = {};
  if (typeof body.isCompleted === "boolean") changes.is_completed = body.isCompleted;
  if (typeof body.isPinned === "boolean") changes.is_pinned = body.isPinned;
  if (typeof body.noteType === "string" && PERSONAL_NOTE_TYPES.includes(body.noteType as (typeof PERSONAL_NOTE_TYPES)[number])) changes.note_type = body.noteType;
  if (typeof body.color === "string" && PERSONAL_NOTE_COLORS.includes(body.color as (typeof PERSONAL_NOTE_COLORS)[number])) changes.color = body.color;
  if (typeof body.title === "string") changes.title = body.title.trim();
  if (typeof body.content === "string") changes.content = body.content.trim();
  if (body.dueDate === null || (typeof body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate))) changes.due_date = body.dueDate;
  if (typeof body.sortOrder === "number" && Number.isInteger(body.sortOrder)) changes.sort_order = body.sortOrder;
  if (Object.keys(changes).length === 0) return Response.json({ error: "변경할 값이 없습니다." }, { status: 400 });
  if ((typeof changes.title === "string" && changes.title.length > 200) || (typeof changes.content === "string" && changes.content.length > 5000)) return Response.json({ error: "메모 길이를 확인해주세요." }, { status: 400 });
  const nextTitle = typeof changes.title === "string" ? changes.title : noteResult.data.title;
  const nextContent = typeof changes.content === "string" ? changes.content : noteResult.data.content;
  if (!nextTitle && !nextContent) return Response.json({ error: "제목 또는 내용을 입력해주세요." }, { status: 400 });
  const { data, error } = await supabase.from("personal_notes").update(changes).eq("id", id).select("*").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ note: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getLmeContext();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { data, error } = await supabase.from("personal_notes").delete().eq("id", id).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ deleted: true });
}
