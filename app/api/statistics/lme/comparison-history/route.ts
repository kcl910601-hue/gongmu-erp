import { getLmeContext } from "@/lib/lme-server";
import { parseMarketComparison } from "@/lib/lme-market-comparison";

function databaseError(code: string) {
  return code === "42P01" || code === "PGRST205"
    ? "비교표 이력 저장용 DB 마이그레이션 적용이 필요합니다."
    : "비교표 이력을 처리하지 못했습니다. 다시 시도해주세요.";
}

export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const page = Number(new URL(request.url).searchParams.get("page") ?? "0");
  if (!Number.isSafeInteger(page) || page < 0 || page > 100000) return Response.json({ error: "페이지 번호를 확인해주세요." }, { status: 400 });
  const { data, error } = await supabase.from("lme_comparison_reports")
    .select("id,draft,created_at,created_by_name")
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range(page * 20, page * 20 + 20);
  if (error) return Response.json({ error: databaseError(error.code) }, { status: 500 });
  return Response.json({ records: (data ?? []).slice(0, 20), hasMore: (data ?? []).length > 20 });
}

export async function POST(request: Request) {
  const { supabase, user, employee } = await getLmeContext();
  if (!user || !employee || employee.role !== "admin") return Response.json({ error: "관리자만 비교표 이력을 저장할 수 있습니다." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "입력 형식이 올바르지 않습니다." }, { status: 400 }); }
  const draft = parseMarketComparison(body);
  if (!draft) return Response.json({ error: "비교표의 작성일, 계약 정보와 정수 단가를 확인해주세요." }, { status: 400 });
  const { data, error } = await supabase.from("lme_comparison_reports")
    .insert({ draft, created_by: user.id }).select("id,draft,created_at,created_by_name").single();
  if (error) return Response.json({ error: databaseError(error.code) }, { status: 500 });
  return Response.json({ record: data }, { status: 201 });
}
