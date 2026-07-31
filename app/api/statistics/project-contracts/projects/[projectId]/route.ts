import { getLmeContext } from "@/lib/lme-server";
import { summarizeProjectContracts, type ProjectContractEntry } from "@/lib/project-contracts";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId: raw } = await params; const projectId = Number(raw); const { supabase, employee } = await getLmeContext(); if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 }); if (!Number.isInteger(projectId) || projectId <= 0) return Response.json({ error: "프로젝트 ID가 올바르지 않습니다." }, { status: 400 });
  const [projectResult, entryResult] = await Promise.all([supabase.from("projects").select("id, project_code, project_name, client_name, salesperson, task_manager, status, process_type, site_address, start_date, end_date").eq("id", projectId).maybeSingle(), supabase.from("project_contract_entries").select("*").eq("project_id", projectId).order("contract_date", { ascending: false }).order("created_at", { ascending: false })]);
  if (projectResult.error || entryResult.error) return Response.json({ error: projectResult.error?.message ?? entryResult.error?.message }, { status: 500 }); if (!projectResult.data) return Response.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  const entries = (entryResult.data ?? []) as ProjectContractEntry[]; const latest = entries.find((entry) => entry.status === "confirmed") ?? null;
  return Response.json({ project: projectResult.data, summary: summarizeProjectContracts(entries), entries, latest_confirmed_entry: latest });
}
