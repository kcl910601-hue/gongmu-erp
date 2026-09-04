import { parseFactoryMaterialRequestInput } from "@/lib/factory-material-request";
import { getLmeContext } from "@/lib/lme-server";

export async function POST(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "요청 형식을 확인해주세요." }, { status: 400 }); }
  const parsed = parseFactoryMaterialRequestInput(body);
  if (!parsed.data) return Response.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await supabase.rpc("create_unallocated_factory_material_usage_request", {
    p_material_code: "AL",
    p_quantity_tons: parsed.data.quantityTons,
    p_usage_date: parsed.data.usageDate,
    p_purchase_order_no: parsed.data.purchaseOrderNo,
    p_memo: parsed.data.memo,
  });
  if (error) return Response.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
  return Response.json({ request: data }, { status: 201 });
}
