import { getLmeContext } from "@/lib/lme-server";

export async function GET(request: Request) {
  const itemId = new URL(request.url).searchParams.get("itemId") ?? "";
  if (!itemId) return Response.json({ error: "원본 일정을 확인해주세요." }, { status: 400 });
  const { supabase, user, employee } = await getLmeContext();
  if (!user || !employee) return Response.json({ error: "승인된 로그인이 필요합니다." }, { status: 401 });
  const noteResult = await supabase.from("personal_notes").select("id,user_id").eq("id", itemId).maybeSingle();
  if (noteResult.error) return Response.json({ error: noteResult.error.message }, { status: 500 });
  if (!noteResult.data) return Response.json({ error: "Timeline 조회 권한이 없거나 원본이 없습니다." }, { status: 404 });
  if (noteResult.data.user_id !== user.id) {
    const sharedResult = await supabase.from("shared_items").select("id").eq("item_id", itemId).maybeSingle();
    if (sharedResult.error) return Response.json({ error: sharedResult.error.message }, { status: 500 });
    if (!sharedResult.data) return Response.json({ error: "Timeline 조회 권한이 없습니다." }, { status: 403 });
    const memberResult = await supabase.from("shared_item_members").select("id").eq("shared_item_id", sharedResult.data.id).eq("employee_id", employee.id).maybeSingle();
    if (memberResult.error) return Response.json({ error: memberResult.error.message }, { status: 500 });
    if (!memberResult.data) return Response.json({ error: "Timeline 조회 권한이 없습니다." }, { status: 403 });
  }
  const result = await supabase.from("activity_logs").select("id,activity_type,title,description,employee_name,created_at,metadata").eq("source_item_id", itemId).order("created_at", { ascending: true }).limit(500);
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  return Response.json({ activities: result.data ?? [] });
}
