import { getLmeContext } from "@/lib/lme-server";
import type { MaterialContractAllocation } from "@/lib/material-contract-allocations";
import { calculateMaterialAllocationAmountKrw, summarizeProjectMaterialAllocationCosts } from "@/lib/project-material-allocation-cost";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId: rawProjectId } = await params;
  const projectId = Number(rawProjectId);
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  if (!Number.isSafeInteger(projectId) || projectId <= 0) return Response.json({ error: "프로젝트 ID가 올바르지 않습니다." }, { status: 400 });
  const project = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (project.error) return Response.json({ error: project.error.message }, { status: 500 });
  if (!project.data) return Response.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

  const result = await supabase
    .from("material_contract_allocations")
    .select("*, contract:raw_material_contracts(contract_name, material_code, contract_price_krw_per_kg, material:lme_materials(name), supplier:suppliers(name)), usage_request:material_usage_requests(purchase_order_no, memo)")
    .eq("allocation_type", "project")
    .eq("project_id", projectId)
    .order("allocation_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  const creatorIds = [...new Set((result.data ?? []).map((row) => String(row.created_by)))];
  const creators = creatorIds.length ? await supabase.from("employees").select("auth_user_id, name").in("auth_user_id", creatorIds) : { data: [], error: null };
  if (creators.error) return Response.json({ error: creators.error.message }, { status: 500 });
  const creatorNames = new Map((creators.data ?? []).map((creator) => [creator.auth_user_id, creator.name]));

  const allocations = (result.data ?? []).map((row) => {
    const contract = Array.isArray(row.contract) ? row.contract[0] : row.contract;
    const usageRequest = Array.isArray(row.usage_request) ? row.usage_request[0] : row.usage_request;
    const supplier = Array.isArray(contract?.supplier) ? contract.supplier[0] : contract?.supplier;
    const material = Array.isArray(contract?.material) ? contract.material[0] : contract?.material;
    const quantityTons = Number(row.quantity_tons);
    const unitPrice = Number(contract?.contract_price_krw_per_kg ?? 0);
    return {
      ...row,
      contract: undefined,
      usage_request: undefined,
      project_id: Number(row.project_id),
      quantity_tons: quantityTons,
      project_code: null,
      project_name: "",
      created_by_name: creatorNames.get(row.created_by) ?? null,
      purchase_order_no: usageRequest?.purchase_order_no ?? row.purchase_order_no,
      memo: usageRequest?.memo ?? row.memo,
      contract_name: contract?.contract_name ?? "-",
      material_code: contract?.material_code ?? "-",
      material_name: material?.name ?? null,
      contract_price_krw_per_kg: unitPrice,
      amount_krw: calculateMaterialAllocationAmountKrw(quantityTons, unitPrice),
      supplier_name: supplier?.name ?? "-",
    } as MaterialContractAllocation & { contract_name: string; material_code: string; material_name: string | null; contract_price_krw_per_kg: number; amount_krw: number | null; supplier_name: string };
  });
  const summary = summarizeProjectMaterialAllocationCosts(allocations);
  const usageRequests = await supabase.rpc("get_material_usage_requests_v2", { p_project_id: projectId });
  if (usageRequests.error) return Response.json({ error: usageRequests.error.message }, { status: 500 });
  const unallocatedTons = (usageRequests.data ?? []).reduce((sum: number, row: { unallocated_tons: number | string; status: string }) => sum + (row.status === "active" ? Number(row.unallocated_tons) : 0), 0);
  const groupRows = await supabase.from("material_usage_groups").select("id,category,sequence,name,planned_date,status,is_active").eq("project_id", projectId).eq("is_active", true).order("category").order("sequence");
  if (groupRows.error) return Response.json({ error: groupRows.error.message }, { status: 500 });
  const groupSummaries = (groupRows.data ?? []).map((group) => {
    const requests = (usageRequests.data ?? []).filter((row: { material_usage_group_id: string | null; status: string }) => row.material_usage_group_id === group.id && row.status === "active");
    const requestedTons = requests.reduce((sum: number, row: { quantity_tons: number | string }) => sum + Number(row.quantity_tons), 0);
    const allocatedTons = requests.reduce((sum: number, row: { allocated_tons: number | string }) => sum + Number(row.allocated_tons), 0);
    return { ...group, requestCount: requests.length, requestedTons, allocatedTons, unallocatedTons: Math.max(requestedTons - allocatedTons, 0) };
  });
  return Response.json({ allocations, summary, unallocatedTons, groupSummaries, canManage: employee.role === "admin", calculationBasis: { unit: "KRW/kg", formula: "quantity_tons × 1000 × contract_price_krw_per_kg", pricePolicy: "current_immutable_contract_price" } });
}
