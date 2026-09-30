import { getLmeContext } from "@/lib/lme-server";
import { saveContractEntry } from "@/lib/project-contracts-server";

export async function POST(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "입력값을 확인해주세요." }, { status: 400 });
  const input = body as Record<string, unknown>;
  return saveContractEntry(supabase, Number(input.project_id), null, input);
}
