import { getLmeContext } from "@/lib/lme-server";
import { saveContractEntry } from "@/lib/project-contracts-server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, employee } = await getLmeContext();
  if (!employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "입력값을 확인해주세요." }, { status: 400 });
  const { data: current, error } = await supabase.from("project_contract_entries").select("project_id").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  if (!current) return Response.json({ error: "계약 이력을 찾을 수 없습니다." }, { status: 404 });
  return saveContractEntry(supabase, Number(current.project_id), id, body as Record<string, unknown>);
}
