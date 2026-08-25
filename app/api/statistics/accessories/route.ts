import { getLmeContext } from "@/lib/lme-server";

function rpcPayload(body: Record<string, unknown>) {
  return {
    p_id: typeof body.id === "string" ? body.id : null,
    p_code: body.code ?? null,
    p_name: body.name,
    p_specification: body.specification ?? null,
    p_unit: body.unit,
    p_origin: body.origin_type,
    p_price_basis: body.price_basis,
    p_currency: body.currency,
    p_unit_price: body.current_unit_price,
    p_vendor: body.vendor_organization_id || null,
    p_active: body.is_active ?? true,
    p_memo: body.memo ?? null,
    p_sort: body.sort_order ?? 0,
  };
}

export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee)
    return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  let query = supabase
    .from("accessory_items")
    .select("*,vendor:organizations!vendor_organization_id(name,is_active)");
  const vendor = params.get("vendor"), origin = params.get("origin"), unit = params.get("unit"), active = params.get("active"), search = params.get("query")?.trim();
  if (vendor) query = query.eq("vendor_organization_id", vendor);
  if (origin) query = query.eq("origin_type", origin);
  if (unit) query = query.eq("unit", unit);
  if (active) query = query.eq("is_active", active === "true");
  if (search) query = query.or(`code.ilike.%${search.replaceAll(",", "")}%,name.ilike.%${search.replaceAll(",", "")}%,specification.ilike.%${search.replaceAll(",", "")}%`);
  const { data, error } = await query.order("sort_order").order("code");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const items = (data ?? []).map((row) => {
    const vendorRow = Array.isArray(row.vendor) ? row.vendor[0] : row.vendor;
    return { ...row, vendor_name: vendorRow?.name ?? null, vendor_active: vendorRow?.is_active ?? null };
  });
  return Response.json({ items, canManage: employee.role === "admin" });
}

export async function POST(request: Request) {
  try {
    const { supabase, employee } = await getLmeContext();
    if (!employee) return Response.json({ error: "승인된 사용자만 사용할 수 있습니다." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const { data, error } = await supabase.rpc("save_accessory_item", rpcPayload(body));
    if (error) throw error;
    return Response.json({ item: data }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "부자재를 저장하지 못했습니다." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, employee } = await getLmeContext();
    if (!employee) return Response.json({ error: "승인된 사용자만 사용할 수 있습니다." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.id !== "string") throw new Error("부자재 ID를 확인해주세요.");
    const { data, error } = await supabase.rpc("save_accessory_item", rpcPayload(body));
    if (error) throw error;
    return Response.json({ item: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "부자재를 수정하지 못했습니다." }, { status: 400 });
  }
}
