import { getLmeContext } from "@/lib/lme-server";
import { type CoatingPlanSource } from "@/lib/coating-plans";

function errorResponse(error: { code?: string; message: string }) {
  const missing = error.code === "PGRST202" || error.code === "42P01";
  return Response.json({ error: missing ? "도장 배정 기능의 DB 준비가 필요합니다. 기존 도장 실제원가는 계속 사용할 수 있습니다." : error.message },
    { status: missing ? 503 : error.code === "42501" ? 403 : error.code === "40001" ? 409 : 400 });
}

export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const raw = params.get("projectId");
  if (!raw) {
    const search = (params.get("query") ?? "").trim().replace(/[%_,()]/g, "");
    const selectedId = params.get("selectedProjectId");
    if (selectedId) {
      const parsed = Number(selectedId);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) return Response.json({ error: "프로젝트를 확인해주세요." }, { status: 400 });
      const result = await supabase.from("projects").select("id,project_code,project_name").eq("id", parsed);
      if (result.error) return errorResponse(result.error);
      return Response.json({ projects: result.data ?? [] });
    }
    const projects = [];
    // Filter before the display limit so completed sites cannot hide pending sites.
    for (let offset = 0; projects.length <= 50; offset += 100) {
      let query = supabase.from("projects").select(`id,project_code,project_name,
        material_usage_requests(id,material_code,allocation_type,status,material_contract_allocations(quantity_tons,status)),
        coating_plans(id,status,sources),coating_exclusions(request_id,weight_kg)`)
        .order("project_name").order("id").range(offset, offset + 99);
      if (search) query = query.or(`project_name.ilike.%${search}%,project_code.ilike.%${search}%`);
      const result = await query;
      if (result.error) return errorResponse(result.error);
      for (const project of result.data ?? []) {
        const plans = project.coating_plans;
        const usedByRequest = new Map<string, number>();
        for (const plan of plans) {
          if (plan.status !== "active") continue;
          for (const source of plan.sources as CoatingPlanSource[]) {
            usedByRequest.set(source.requestId, (usedByRequest.get(source.requestId) ?? 0) + source.weightKg);
          }
        }
        let allocatedKg = 0;
        let excludedKg = 0;
        let remainingKg = 0;
        for (const source of project.material_usage_requests) {
          if (source.material_code !== "AL" || source.allocation_type !== "project" || source.status !== "active") continue;
          const allocated = Math.round(source.material_contract_allocations
            .filter((allocation) => allocation.status === "planned" || allocation.status === "confirmed")
            .reduce((sum, allocation) => sum + Number(allocation.quantity_tons), 0) * 10000) / 10;
          allocatedKg += allocated;
          const excluded = Number(project.coating_exclusions.find((item) => item.request_id === source.id)?.weight_kg ?? 0);
          excludedKg += excluded;
          remainingKg += Math.max(0, allocated - excluded - Math.round((usedByRequest.get(source.id) ?? 0) * 10) / 10);
        }
        remainingKg = Math.round(remainingKg * 10) / 10;
        if (params.get("scope") !== "all" && (params.get("scope") === "history" ? plans.length === 0 && project.coating_exclusions.length === 0 : remainingKg <= 0)) continue;
        const coatingKg = Math.round([...usedByRequest.values()].reduce((sum, weight) => sum + weight, 0) * 10) / 10;
        projects.push({ id: project.id, project_code: project.project_code, project_name: project.project_name,
          allocatedKg: Math.round(allocatedKg * 10) / 10, excludedKg: Math.round(excludedKg * 10) / 10, coatingKg, remainingKg });
      }
      if ((result.data?.length ?? 0) < 100) break;
    }
    return Response.json({ projects: projects.slice(0, 50), hasMore: projects.length > 50 });
  }
  const projectId = Number(raw);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) return Response.json({ error: "프로젝트를 확인해주세요." }, { status: 400 });
  const result = await supabase.rpc("get_coating_plan_context", { p_project_id: projectId });
  if (result.error) return errorResponse(result.error);
  const exclusions = await supabase.from("coating_exclusions").select("request_id,project_id,weight_kg,reason,version").eq("project_id", projectId);
  if (exclusions.error) return errorResponse(exclusions.error);
  return Response.json({ ...result.data, exclusions: exclusions.data, canManage: employee.role === "admin" });
}

export async function POST(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const projectId = Number(body.projectId);
    if (body.action === "exclude") {
      if (!Number.isSafeInteger(projectId) || projectId <= 0 || typeof body.requestId !== "string" || !Number.isInteger(body.version) || typeof body.weightKg !== "number" || !Number.isFinite(body.weightKg) || typeof body.reason !== "string") {
        return Response.json({ error: "제외 중량과 사유를 확인해주세요." }, { status: 400 });
      }
      const result = await supabase.rpc("save_coating_exclusion", {
        p_project_id: projectId, p_request_id: body.requestId, p_version: body.version,
        p_weight_kg: body.weightKg, p_reason: body.reason, p_fingerprint: body.fingerprint ?? null,
      });
      if (result.error) return errorResponse(result.error);
      return Response.json({ exclusion: result.data });
    }
    if (!Number.isSafeInteger(projectId) || projectId <= 0 || typeof body.id !== "string" || !Number.isInteger(body.version)) {
      return Response.json({ error: "배정과 프로젝트를 확인해주세요." }, { status: 400 });
    }
    const result = await supabase.rpc("save_coating_plan", {
      p_id: body.id, p_version: body.version, p_project_id: projectId,
      p_vendor_id: body.vendorId ?? null, p_weight_basis: body.weightBasis ?? null,
      p_unit: body.unit ?? null, p_length_m: body.lengthM ?? null,
      p_unit_price: body.unitPrice ?? null, p_sources: body.sources ?? [],
      p_memo: body.memo ?? null, p_cancel: body.action === "cancel",
    });
    if (result.error) return errorResponse(result.error);
    return Response.json({ plan: result.data });
  } catch {
    return Response.json({ error: "입력값을 확인해주세요." }, { status: 400 });
  }
}
