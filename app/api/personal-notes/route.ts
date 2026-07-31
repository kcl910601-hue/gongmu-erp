import { getLmeContext } from "@/lib/lme-server";
import { PERSONAL_NOTE_COLORS, PERSONAL_NOTE_TYPES } from "@/lib/personal-notes";

function isDate(value: string | null) {
  return value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: Request) {
  const { supabase, user } = await getLmeContext();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const search = new URL(request.url).searchParams.get("search")?.trim() ?? "";
  const params = new URL(request.url).searchParams;
  const dueStart = params.get("dueStart");
  const dueEnd = params.get("dueEnd");
  if ((dueStart && !/^\d{4}-\d{2}-\d{2}$/.test(dueStart)) || (dueEnd && !/^\d{4}-\d{2}-\d{2}$/.test(dueEnd)) || (dueStart && dueEnd && dueStart > dueEnd)) return Response.json({ error: "조회 날짜 범위를 확인해주세요." }, { status: 400 });
  let query = supabase.from("personal_notes").select("*").eq("user_id", user.id);
  if (dueStart) query = query.gte("due_date", dueStart);
  if (dueEnd) query = query.lte("due_date", dueEnd);
  if (dueStart || dueEnd) query = query.in("note_type", ["memo", "todo", "sticky"]);
  if (search) {
    const safe = search.replace(/[,%()]/g, "");
    query = query.or(`title.ilike.%${safe}%,content.ilike.%${safe}%`);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ notes: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await getLmeContext();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const noteType = typeof body.noteType === "string" ? body.noteType : "memo";
  const color = typeof body.color === "string" ? body.color : "default";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const dueDate = typeof body.dueDate === "string" && body.dueDate ? body.dueDate : null;
  if (!PERSONAL_NOTE_TYPES.includes(noteType as (typeof PERSONAL_NOTE_TYPES)[number]) ||
      !PERSONAL_NOTE_COLORS.includes(color as (typeof PERSONAL_NOTE_COLORS)[number]) ||
      (!title && !content) || title.length > 200 || content.length > 5000 || !isDate(dueDate)) {
    return Response.json({ error: "메모 입력값을 확인해주세요." }, { status: 400 });
  }
  const { data, error } = await supabase.from("personal_notes").insert({
    user_id: user.id, note_type: noteType, title, content,
    is_completed: false, is_pinned: body.isPinned === true, color, due_date: dueDate,
  }).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ note: data }, { status: 201 });
}
