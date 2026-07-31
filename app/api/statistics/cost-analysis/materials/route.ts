import { getLmeContext } from "@/lib/lme-server";

export async function GET() {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const { data, error } = await supabase.from("lme_materials").select("code, name").eq("is_active", true).order("code");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ materials: data ?? [] });
}
