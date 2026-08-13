import { getLmeContext } from "@/lib/lme-server";
import { parseMaterialContractAllocationInput } from "@/lib/material-contract-allocation-input";
import { queryContractAllocationSummaries } from "@/lib/material-contract-allocations-server";
import { queryMaterialContractAllocations } from "@/lib/material-contract-allocations-query";
import { MATERIAL_USAGE_ALLOCATION_STRATEGIES, type MaterialUsageAllocationStrategy } from "@/lib/material-usage-requests";

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
  const strategy = typeof body.strategy === "string" && MATERIAL_USAGE_ALLOCATION_STRATEGIES.includes(body.strategy as MaterialUsageAllocationStrategy) ? body.strategy as MaterialUsageAllocationStrategy : null;
  const contract = await supabase.from("raw_material_contracts").select("id,material_code,contract_quantity_ton,contract_price_krw_per_kg,effective_start_date").eq("id", id).single();
  if (contract.error) return Response.json({ error: contract.error.message }, { status: 404 });
  const summaryResult = await queryContractAllocationSummaries(supabase, [contract.data]);
  const available = summaryResult.data?.get(id)?.availableTons ?? 0;
  if (parsed.data.quantityTons > available && !strategy) {
    const candidates = await supabase.from("raw_material_contracts").select("id,contract_name,contract_price_krw_per_kg,contract_quantity_ton,effective_start_date").eq("material_code", contract.data.material_code).eq("status", "active").order("effective_start_date");
    const candidateSummaries = candidates.data ? await queryContractAllocationSummaries(supabase, candidates.data) : { data: new Map(), error: candidates.error };
    const nextContracts = (candidates.data ?? []).map((item) => ({ id: item.id, contractName: item.contract_name, priceKrwPerKg: Number(item.contract_price_krw_per_kg), effectiveStartDate: item.effective_start_date, availableTons: candidateSummaries.data?.get(item.id)?.availableTons ?? 0 })).filter((item) => item.availableTons > 0);
    return Response.json({ error: "계약 가용량을 초과합니다.", requiresStrategy: true, requestedTons: parsed.data.quantityTons, availableTons: available, excessTons: parsed.data.quantityTons - available, contracts: nextContracts }, { status: 409 });
  }
  const { data, error } = await supabase.rpc("create_material_usage_request", {
    p_starting_contract_id: id, p_allocation_type: parsed.data.allocationType, p_project_id: parsed.data.projectId,
    p_destination_name: parsed.data.destinationName, p_quantity_tons: parsed.data.quantityTons,
    p_usage_date: parsed.data.allocationDate, p_status: parsed.data.status, p_purchase_order_no: parsed.data.purchaseOrderNo,
    p_memo: parsed.data.memo, p_strategy: strategy ?? "leave_unallocated", p_expected_starting_available: available,
    p_increase_reason: typeof body.increaseReason === "string" ? body.increaseReason : null,
  });
  if (error) return Response.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
  return Response.json({ usageRequest: data }, { status: 201 });
}
