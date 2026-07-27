import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getEmployeeByAuth } from "@/lib/auth";

type PartnerPayload = {
  id?: unknown;
  name?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
};

async function getAdminContext() {
  const supabase = await createSupabaseServerClient();
  const authResult = await supabase.auth.getUser();
  console.log("partner organizations auth result:", authResult);
  const { data: { user } } = authResult;
  if (!user) return { supabase, admin: null, partnerCategoryId: null };

  const employeeResult = await getEmployeeByAuth(supabase, user);
  console.log("partner organizations employee query result:", employeeResult);
  const admin = employeeResult.employee?.role === "admin" &&
    employeeResult.employee.active !== false &&
    employeeResult.employee.approval_status === "approved"
    ? employeeResult.employee
    : null;

  const categoryResult = await supabase
    .from("organization_categories")
    .select("id")
    .eq("code", "partner")
    .maybeSingle();
  console.log("partner organizations category query result:", categoryResult);

  return { supabase, admin, partnerCategoryId: categoryResult.data?.id ?? null };
}

function parseSortOrder(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function errorResponse(error: unknown, status = 500) {
  console.error(error);
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : String(error);

  return Response.json({ error: message, details: error }, { status });
}

export async function GET() {
  try {
    const { supabase, admin, partnerCategoryId } = await getAdminContext();
    if (!admin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
    if (!partnerCategoryId) return Response.json({ error: "협력업체 카테고리를 찾을 수 없습니다." }, { status: 500 });

    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, sort_order, is_active, created_at, updated_at")
      .eq("category_id", partnerCategoryId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    console.log("partner organizations select result:", { data, error });

    if (error) return errorResponse(error);
    return Response.json({ partners: data ?? [] });
  } catch (error) {
    console.error("partner organizations GET exception:", error);
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, admin, partnerCategoryId } = await getAdminContext();
    if (!admin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
    if (!partnerCategoryId) return Response.json({ error: "협력업체 카테고리를 찾을 수 없습니다." }, { status: 500 });

    const body = (await request.json()) as PartnerPayload;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return Response.json({ error: "협력업체명을 입력해주세요." }, { status: 400 });

    const { data, error } = await supabase
      .from("organizations")
      .insert({ category_id: partnerCategoryId, name, function_code: "partner", sort_order: parseSortOrder(body.sort_order), is_active: true })
      .select("id, name, sort_order, is_active, created_at, updated_at")
      .single();
    console.log("partner organization insert result:", { data, error });

    if (error) return errorResponse(error, error.code === "23505" ? 409 : 500);
    return Response.json({ partner: data }, { status: 201 });
  } catch (error) {
    console.error("partner organization POST exception:", error);
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, admin, partnerCategoryId } = await getAdminContext();
    if (!admin) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
    if (!partnerCategoryId) return Response.json({ error: "협력업체 카테고리를 찾을 수 없습니다." }, { status: 500 });

    const body = (await request.json()) as PartnerPayload;
    const id = typeof body.id === "number" ? body.id : Number(body.id);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!Number.isInteger(id) || !name || typeof body.is_active !== "boolean") {
      return Response.json({ error: "협력업체 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("organizations")
      .update({ name, sort_order: parseSortOrder(body.sort_order), is_active: body.is_active, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("category_id", partnerCategoryId)
      .select("id, name, sort_order, is_active, created_at, updated_at")
      .maybeSingle();
    console.log("partner organization update result:", { data, error });

    if (error) return errorResponse(error, error.code === "23505" ? 409 : 500);
    if (!data) return errorResponse(new Error("수정할 협력업체를 찾을 수 없습니다."), 404);
    return Response.json({ partner: data });
  } catch (error) {
    console.error("partner organization PATCH exception:", error);
    return errorResponse(error);
  }
}
