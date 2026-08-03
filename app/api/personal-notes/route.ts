import { getLmeContext } from "@/lib/lme-server";
import { PERSONAL_NOTE_COLORS, PERSONAL_NOTE_TYPES } from "@/lib/personal-notes";

function isDate(value: string | null) {
  return value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: Request) {
  const { supabase, user, employee } = await getLmeContext();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const search = new URL(request.url).searchParams.get("search")?.trim() ?? "";
  const params = new URL(request.url).searchParams;
  const dueStart = params.get("dueStart");
  const dueEnd = params.get("dueEnd");
  if ((dueStart && !/^\d{4}-\d{2}-\d{2}$/.test(dueStart)) || (dueEnd && !/^\d{4}-\d{2}-\d{2}$/.test(dueEnd)) || (dueStart && dueEnd && dueStart > dueEnd)) return Response.json({ error: "조회 날짜 범위를 확인해주세요." }, { status: 400 });
  let query = supabase.from("personal_notes").select("*");
  if (dueStart) query = query.gte("due_date", dueStart);
  if (dueEnd) query = query.lte("due_date", dueEnd);
  if (dueStart || dueEnd) query = query.in("note_type", ["memo", "todo", "sticky"]);
  if (search) {
    const safe = search.replace(/[,%()]/g, "");
    query = query.or(`title.ilike.%${safe}%,content.ilike.%${safe}%`);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const notes = data ?? [];
  if (!employee || notes.length === 0) return Response.json({ notes });
  const itemIds = notes.map((note) => note.id);
  const sharedResult = await supabase.from("shared_items").select("id,item_id,owner_id").in("item_id", itemIds);
  if (sharedResult.error) {
    if (sharedResult.error.code === "42P01" || sharedResult.error.code === "PGRST205") return Response.json({ notes });
    return Response.json({ error: sharedResult.error.message }, { status: 500 });
  }
  const sharedItems = sharedResult.data ?? [];
  const sharedIds = sharedItems.map((item) => item.id);
  const ownerIds = [...new Set(sharedItems.map((item) => Number(item.owner_id)))];
  const [memberResult, ownerResult] = await Promise.all([
    sharedIds.length ? supabase.from("shared_item_members").select("shared_item_id,employee_id,permission").in("shared_item_id", sharedIds) : Promise.resolve({ data: [], error: null }),
    ownerIds.length ? supabase.from("employees").select("id,name").in("id", ownerIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (memberResult.error || ownerResult.error) return Response.json({ error: memberResult.error?.message ?? ownerResult.error?.message }, { status: 500 });
  const members = memberResult.data ?? [];
  const ownerNames = new Map((ownerResult.data ?? []).map((owner) => [Number(owner.id), owner.name]));
  const sharedByItem = new Map(sharedItems.map((item) => [item.item_id, item]));
  return Response.json({ notes: notes.map((note) => {
    const shared = sharedByItem.get(note.id);
    if (!shared) return { ...note, sharing: null };
    const member = members.find((entry) => entry.shared_item_id === shared.id && Number(entry.employee_id) === employee.id);
    return { ...note, sharing: { sharedItemId: shared.id, ownerName: ownerNames.get(Number(shared.owner_id)) ?? "-", permission: Number(shared.owner_id) === employee.id ? "owner" : member?.permission ?? "view", memberCount: members.filter((entry) => entry.shared_item_id === shared.id).length } };
  }) });
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
