import { getLmeContext } from "@/lib/lme-server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, employee } = await getLmeContext();
  if (!employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  if (body.action !== "cancel") return Response.json({ error: "지원하지 않는 작업입니다." }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason : null;
  const { data, error } = await supabase.rpc("cancel_material_usage_request", { p_usage_request_id: id, p_reason: reason });
  if (error) return Response.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
  return Response.json(data);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const { data, error } = await supabase.from("activity_logs")
    .select("created_at,activity_type,title,description,employee_name,metadata")
    .eq("target_type", "material_usage_request")
    .contains("metadata", { usage_request_id: id })
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const history = (data ?? []).map((row) => {
    if (row.activity_type !== "material_usage_request_created") return row;
    const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
    const quantityTons = Number(metadata.quantity_tons);
    const quantityLabel = Number.isFinite(quantityTons) ? `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(quantityTons * 1_000)}kg` : row.description;
    return { ...row, title: "알루미늄 발주 등록", description: quantityLabel };
  });
  return Response.json({ history });
}
