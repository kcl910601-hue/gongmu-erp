import { getLmeContext } from "@/lib/lme-server";
import { buildProjectSummaries, getEntriesForProjects } from "@/lib/project-contracts-server";

export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext(); if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const params = new URL(request.url).searchParams; const clean = (value: string) => value.replace(/[,%()]/g, "");
  let query = supabase.from("projects").select("id, project_code, project_name, client_name, salesperson, task_manager, status, process_type, start_date, end_date");
  const text = params.get("query")?.trim(); if (text) query = query.or(`project_name.ilike.%${clean(text)}%,project_code.ilike.%${clean(text)}%`);
  const status = params.get("status"); const salesperson = params.get("salesperson"); const manager = params.get("task_manager"); const from = params.get("start_date_from"); const to = params.get("start_date_to");
  if (status) query = query.eq("status", status); if (salesperson) query = query.eq("salesperson", salesperson); if (manager) query = query.eq("task_manager", manager); if (from) query = query.gte("start_date", from); if (to) query = query.lte("start_date", to);
  const { data, error } = await query.order("start_date", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(500); if (error) return Response.json({ error: error.message }, { status: 500 });
  const projects = data ?? []; const entries = await getEntriesForProjects(supabase, projects.map((project) => project.id)); if (entries.error || !entries.data) return Response.json({ error: entries.error?.message }, { status: 500 }); const summaries = buildProjectSummaries(entries.data, projects.map((project) => project.id));
  const withSummary = projects.map((project) => ({ ...project, contract_summary: summaries.get(project.id) })); const hasContract = params.get("has_contract"); const filtered = hasContract === "true" ? withSummary.filter((project) => project.contract_summary?.has_original_contract) : hasContract === "false" ? withSummary.filter((project) => !project.contract_summary?.has_original_contract) : withSummary;
  const registered = filtered.filter((project) => project.contract_summary?.has_original_contract); const sum = (field: "original_supply_amount_krw" | "increase_supply_amount_krw" | "decrease_supply_amount_krw" | "final_supply_amount_krw") => registered.reduce((total, project) => total + Number(project.contract_summary?.[field] ?? 0), 0);
  return Response.json({ projects: filtered, kpi: { registered_project_count: registered.length, unregistered_project_count: filtered.length - registered.length, original_supply_total_krw: sum("original_supply_amount_krw"), increase_supply_total_krw: sum("increase_supply_amount_krw"), decrease_supply_total_krw: sum("decrease_supply_amount_krw"), final_supply_total_krw: sum("final_supply_amount_krw"), final_total_with_vat_krw: registered.reduce((total, project) => total + Number(project.contract_summary?.final_total_amount_krw ?? 0), 0) } });
}
