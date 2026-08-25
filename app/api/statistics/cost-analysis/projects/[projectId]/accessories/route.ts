import { getLmeContext } from "@/lib/lme-server";

async function context(raw: string) {
  const projectId = Number(raw), value = await getLmeContext();
  if (!value.employee) throw new Error("승인된 사용자만 사용할 수 있습니다.");
  if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new Error("프로젝트 ID가 올바르지 않습니다.");
  return { supabase: value.supabase, employee: value.employee, projectId };
}
function payload(body: Record<string, unknown>, projectId: number) {
  return { p_id: typeof body.id === "string" ? body.id : null, p_project: projectId, p_item: body.accessory_item_id, p_usage_date: body.usage_date, p_quantity: body.quantity, p_unit_price: body.unit_price, p_exchange_rate: body.exchange_rate || null, p_memo: body.memo ?? null };
}
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId: raw } = await params, { supabase, projectId, employee } = await context(raw);
    const [{ data: usages, error }, { data: items, error: itemError }] = await Promise.all([
      supabase.from("project_accessory_usages").select("*,item:accessory_items(code,name,specification)").eq("project_id", projectId).order("usage_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("accessory_items").select("*,vendor:organizations!vendor_organization_id(name,is_active)").eq("is_active", true).order("sort_order").order("code"),
    ]);
    if (error || itemError) throw error ?? itemError;
    const rows = (usages ?? []).map((row) => { const item = Array.isArray(row.item) ? row.item[0] : row.item; return { ...row, item_code: item?.code ?? "-", item_name: item?.name ?? "부자재 없음", item_specification: item?.specification ?? null }; });
    const active = rows.filter((row) => row.status === "active");
    const itemRows = (items ?? []).map((row) => { const vendor = Array.isArray(row.vendor) ? row.vendor[0] : row.vendor; return { ...row, vendor_name: vendor?.name ?? null, vendor_active: vendor?.is_active ?? null }; });
    return Response.json({ usages: rows, items: itemRows, total: active.reduce((sum, row) => sum + Number(row.total_cost_krw), 0), canManage: employee.role === "admin" });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "부자재 사용내역을 조회하지 못했습니다." }, { status: 400 }); }
}
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try { const { projectId: raw } = await params, { supabase, projectId } = await context(raw), body = await request.json() as Record<string, unknown>; const { data, error } = await supabase.rpc("save_project_accessory_usage", payload(body, projectId)); if (error) throw error; return Response.json({ usage: data }, { status: 201 }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "소진내역을 등록하지 못했습니다." }, { status: 400 }); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try { const { projectId: raw } = await params, { supabase, projectId } = await context(raw), body = await request.json() as Record<string, unknown>; if (typeof body.id !== "string") throw new Error("사용내역을 확인해주세요."); if (body.action === "void") { const { data, error } = await supabase.rpc("void_project_accessory_usage", { p_id: body.id }); if (error) throw error; return Response.json({ usage: data }); } const { data, error } = await supabase.rpc("save_project_accessory_usage", payload(body, projectId)); if (error) throw error; return Response.json({ usage: data }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "소진내역을 수정하지 못했습니다." }, { status: 400 }); }
}
