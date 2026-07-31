import { getLmeContext } from "@/lib/lme-server";

export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const search = new URL(request.url).searchParams.get("search")?.trim() ?? "";
  let query = supabase.from("projects").select("id, project_code, project_name, client_name, site_address, process_type, start_date, end_date, quantity, quantity_unit");
  if (search) query = query.or(`project_name.ilike.%${search.replace(/[,%()]/g, "")}%,project_code.ilike.%${search.replace(/[,%()]/g, "")}%`);
  const { data, error } = await query.order("start_date", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(200);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ projects: data ?? [] });
}
