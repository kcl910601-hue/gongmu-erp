import { getLmeContext } from "@/lib/lme-server";
import { parseMaterialContractAllocationInput } from "@/lib/material-contract-allocation-input";
import { queryContractAllocationSummaries } from "@/lib/material-contract-allocations-server";
import { queryMaterialContractAllocations } from "@/lib/material-contract-allocations-query";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const contractResult = await supabase.from("raw_material_contracts").select("id, contract_quantity_ton").eq("id", id).maybeSingle();
  if (contractResult.error) return Response.json({ error: contractResult.error.message }, { status: 500 });
  if (!contractResult.data) return Response.json({ error: "계약을 찾을 수 없습니다." }, { status: 404 });
  const [allocations, summaries] = await Promise.all([
    queryMaterialContractAllocations(supabase, id),
    queryContractAllocationSummaries(supabase, [contractResult.data]),
  ]);
  if (allocations.error || summaries.error || !allocations.data || !summaries.data) return Response.json({ error: allocations.error?.message ?? summaries.error?.message ?? "배정 이력을 조회하지 못했습니다." }, { status: 500 });
  return Response.json({ allocations: allocations.data, summary: summaries.data.get(id), canManage: employee.role === "admin" });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, employee } = await getLmeContext();
  if (!user || !employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const parsed = parseMaterialContractAllocationInput(body);
  if (!parsed.data) return Response.json({ error: parsed.error }, { status: 400 });
  const contextProjectId = body.contextProjectId === undefined ? null : Number(body.contextProjectId);
  if (contextProjectId !== null && (!Number.isSafeInteger(contextProjectId) || parsed.data.allocationType !== "project" || parsed.data.projectId !== contextProjectId)) return Response.json({ error: "현재 프로젝트의 사용등록만 저장할 수 있습니다." }, { status: 403 });
  const { data, error } = await supabase.rpc("save_material_contract_allocation", {
    p_contract_id: id, p_allocation_id: null, p_allocation_type: parsed.data.allocationType,
    p_project_id: parsed.data.projectId, p_destination_name: parsed.data.destinationName,
    p_quantity_tons: parsed.data.quantityTons, p_allocation_date: parsed.data.allocationDate,
    p_status: parsed.data.status, p_purchase_order_no: parsed.data.purchaseOrderNo,
    p_memo: parsed.data.memo, p_cancel: false,
  });
  if (error) return Response.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
  return Response.json({ allocation: data }, { status: 201 });
}
