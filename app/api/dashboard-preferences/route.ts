import { getLmeContext } from "@/lib/lme-server";
import { getDefaultDashboardPreferences, normalizeDashboardPreferences } from "@/lib/dashboard-preferences";

export async function GET() {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const result = await supabase.from("dashboard_preferences").select("cards,updated_at").eq("employee_id", employee.id).maybeSingle();
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  return Response.json({ cards: normalizeDashboardPreferences(result.data?.cards), updatedAt: result.data?.updated_at ?? null });
}

export async function PUT(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json() as { cards?: unknown };
  const cards = normalizeDashboardPreferences(body.cards);
  const result = await supabase.from("dashboard_preferences").upsert({ employee_id: employee.id, cards, updated_at: new Date().toISOString() }, { onConflict: "employee_id" }).select("cards,updated_at").single();
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  return Response.json({ cards: normalizeDashboardPreferences(result.data.cards), updatedAt: result.data.updated_at });
}

export async function DELETE() {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const result = await supabase.from("dashboard_preferences").delete().eq("employee_id", employee.id);
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  return Response.json({ cards: getDefaultDashboardPreferences() });
}
