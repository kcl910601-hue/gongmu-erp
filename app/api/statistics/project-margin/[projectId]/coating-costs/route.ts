import { getLmeContext } from "@/lib/lme-server";
import { normalizeMonth, parseKrw } from "@/lib/coating-costs";
function payload(body: Record<string, unknown>, projectId: number) {
  const vendor = Number(body.vendor_organization_id);
  if (!Number.isSafeInteger(vendor) || vendor <= 0)
    throw new Error("도장업체를 선택해주세요.");
  return {
    p_project_id: projectId,
    p_vendor_organization_id: vendor,
    p_accounting_month: normalizeMonth(body.accounting_month),
    p_supply_amount_krw: parseKrw(body.supply_amount_krw, "공급가액"),
    p_vat_amount_krw: parseKrw(body.vat_amount_krw, "VAT"),
    p_invoice_number: body.invoice_number ?? null,
    p_memo: body.memo ?? null,
  };
}
async function context(raw: string) {
  const id = Number(raw),
    value = await getLmeContext();
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new Error("프로젝트 ID가 올바르지 않습니다.");
  if (!value.employee) throw new Error("승인된 사용자만 사용할 수 있습니다.");
  return { ...value, id };
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params,
      { supabase, id } = await context(projectId),
      body = (await request.json()) as Record<string, unknown>,
      { data, error } = await supabase.rpc(
        "create_project_coating_cost_entry",
        payload(body, id),
      );
    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "등록하지 못했습니다." },
      { status: 400 },
    );
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params,
      { supabase, id } = await context(projectId),
      body = (await request.json()) as Record<string, unknown>,
      statementId =
        typeof body.statement_id === "string" ? body.statement_id : "";
    if (!statementId) throw new Error("계산서를 확인해주세요.");
    if (body.action === "void") {
      const { data, error } = await supabase.rpc(
        "void_project_coating_cost_entry",
        { p_statement_id: statementId, p_project_id: id },
      );
      if (error) throw error;
      return Response.json(data);
    }
    const { data, error } = await supabase.rpc(
      "update_project_coating_cost_entry",
      { p_statement_id: statementId, ...payload(body, id) },
    );
    if (error) throw error;
    return Response.json(data);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "수정하지 못했습니다." },
      { status: 400 },
    );
  }
}
