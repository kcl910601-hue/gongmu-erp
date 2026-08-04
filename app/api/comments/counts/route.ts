import { getLmeContext } from "@/lib/lme-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const { supabase, user } = await getLmeContext();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const itemIds = [...new Set((new URL(request.url).searchParams.get("itemIds") ?? "").split(",").filter(Boolean))];
  if (itemIds.length === 0 || itemIds.length > 500 || itemIds.some((id) => !UUID_PATTERN.test(id))) {
    return Response.json({ error: "댓글 개수 조회 대상을 확인해주세요." }, { status: 400 });
  }

  const visibleResult = await supabase.from("personal_notes").select("id").in("id", itemIds);
  if (visibleResult.error) return Response.json({ error: visibleResult.error.message }, { status: 500 });
  const visibleIds = (visibleResult.data ?? []).map((note) => note.id);
  const counts = Object.fromEntries(visibleIds.map((id) => [id, { total: 0, unread: 0 }]));
  if (visibleIds.length === 0) return Response.json({ counts });

  const countResult = await supabase.rpc("get_shared_comment_count_stats", { p_item_ids: visibleIds });
  if (countResult.error?.code === "PGRST202" || countResult.error?.code === "42883") {
    const fallback = await supabase.rpc("get_shared_comment_counts", { p_item_ids: visibleIds });
    if (fallback.error) return Response.json({ error: fallback.error.message }, { status: 500 });
    for (const row of fallback.data ?? []) counts[String(row.item_id)] = { total: Number(row.comment_count), unread: 0 };
  } else if (countResult.error) return Response.json({ error: countResult.error.message }, { status: 500 });
  else for (const row of countResult.data ?? []) counts[String(row.item_id)] = { total: Number(row.comment_count), unread: Number(row.unread_count) };
  return Response.json({ counts });
}
