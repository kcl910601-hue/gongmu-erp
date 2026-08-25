import { getLmeContext } from "@/lib/lme-server";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const { data, error } = await supabase.from("accessory_price_history").select("*").eq("accessory_item_id", id).order("changed_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ history: data ?? [] });
}
