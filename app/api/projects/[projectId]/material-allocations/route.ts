import { getLmeContext } from "@/lib/lme-server";
import type { MaterialContractAllocation } from "@/lib/material-contract-allocations";

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
    .select("*, contract:raw_material_contracts(contract_name, material_code, contract_price_krw_per_kg, supplier:suppliers(name))")
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
    const supplier = Array.isArray(contract?.supplier) ? contract.supplier[0] : contract?.supplier;
    return {
      ...row,
      contract: undefined,
      project_id: Number(row.project_id),
      quantity_tons: Number(row.quantity_tons),
      project_code: null,
      project_name: "",
      created_by_name: creatorNames.get(row.created_by) ?? null,
      contract_name: contract?.contract_name ?? "-",
      material_code: contract?.material_code ?? "-",
      contract_price_krw_per_kg: Number(contract?.contract_price_krw_per_kg ?? 0),
      supplier_name: supplier?.name ?? "-",
    } as MaterialContractAllocation & { contract_name: string; material_code: string; contract_price_krw_per_kg: number; supplier_name: string };
  });
  return Response.json({ allocations, canManage: employee.role === "admin" });
}
