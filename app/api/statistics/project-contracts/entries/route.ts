import { getLmeContext } from "@/lib/lme-server";
import { parseContractEntry } from "@/lib/project-contracts-server";

export async function POST(request: Request) {
  const { supabase, user, employee } = await getLmeContext(); if (!user || !employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }); const body = await request.json() as Record<string, unknown>; const parsed = parseContractEntry(body); if (!parsed.data) return Response.json({ error: parsed.error }, { status: 400 });
  const { data: project } = await supabase.from("projects").select("id").eq("id", parsed.data.project_id).maybeSingle(); if (!project) return Response.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 400 });
  const { data, error } = await supabase.from("project_contract_entries").insert({ ...parsed.data, created_by: user.id }).select("*").single(); if (error) return Response.json({ error: error.code === "23505" ? "유효한 최초 계약이 이미 존재합니다." : error.message }, { status: error.code === "23505" || error.code === "23514" ? 409 : 500 }); return Response.json({ entry: data }, { status: 201 });
}
