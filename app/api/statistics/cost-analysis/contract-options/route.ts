import { getLmeContext } from "@/lib/lme-server";

export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const params = new URL(request.url).searchParams; const materialCode = params.get("material_code")?.toUpperCase() ?? ""; const date = params.get("cost_reference_date") ?? ""; const expectedKg = Number(params.get("expected_quantity_kg") ?? 0);
  if (!materialCode || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Material과 원가 기준일이 필요합니다." }, { status: 400 });
  const { data, error } = await supabase.from("raw_material_contracts").select("id, contract_name, effective_start_date, effective_end_date, contract_price_krw_per_kg, processing_cost_krw_per_kg, remaining_quantity_ton, supplier:suppliers(id,name)").eq("material_code", materialCode).eq("status", "active").lte("effective_start_date", date).gte("effective_end_date", date).gt("remaining_quantity_ton", 0).order("contract_price_krw_per_kg", { ascending: true }).order("effective_end_date", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const contracts = (data ?? []).map((row) => { const supplier = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier; const sufficient = expectedKg > 0 ? Number(row.remaining_quantity_ton) * 1000 >= expectedKg : null; return { ...row, supplier: undefined, supplier_id: supplier?.id ?? null, supplier_name: supplier?.name ?? null, quantity_sufficient: sufficient }; }).sort((a, b) => Number(b.quantity_sufficient === true) - Number(a.quantity_sufficient === true) || Number(a.contract_price_krw_per_kg) - Number(b.contract_price_krw_per_kg) || a.effective_end_date.localeCompare(b.effective_end_date));
  return Response.json({ contracts });
}
