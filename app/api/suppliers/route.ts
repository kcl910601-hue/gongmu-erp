import { getLmeContext } from "@/lib/lme-server";

export async function GET() {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });
  const { data, error } = await supabase.from("suppliers").select("id, name, is_active").order("name");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ suppliers: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return Response.json({ error: "공급업체명을 입력해주세요." }, { status: 400 });
  const { data: category, error: categoryError } = await supabase.from("organization_categories").select("id").eq("code", "partner").maybeSingle();
  if (categoryError || !category) return Response.json({ error: categoryError?.message ?? "협력업체 카테고리를 찾을 수 없습니다." }, { status: 500 });
  const { data: organization, error } = await supabase.from("organizations").insert({ category_id: category.id, name, function_code: "partner", partner_type: "supplier", is_active: true }).select("id").single();
  if (error) return Response.json({ error: error.code === "23505" ? "이미 등록된 공급업체입니다." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  const { data, error: supplierError } = await supabase.from("suppliers").select("id, name, is_active").eq("organization_id", organization.id).single();
  if (supplierError) return Response.json({ error: supplierError.message }, { status: 500 });
  return Response.json({ supplier: data }, { status: 201 });
}
