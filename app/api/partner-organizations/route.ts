import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getEmployeeByAuth } from "@/lib/auth";
import { hasPermission, isAuthorizedEmployee } from "@/lib/permissions";
import { isPartnerType } from "@/lib/partners";

type PartnerPayload = {
  id?: unknown;
  name?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
  partner_type?: unknown;
  memo?: unknown;
};

async function getSettingsContext() {
  const supabase = await createSupabaseServerClient();
  const authResult = await supabase.auth.getUser();
  console.log("partner organizations auth result:", authResult);
  const { data: { user } } = authResult;
  if (!user) return { supabase, employee: null, partnerCategoryId: null };

  const employeeResult = await getEmployeeByAuth(supabase, user);
  console.log("partner organizations employee query result:", employeeResult);
  const employee = isAuthorizedEmployee(employeeResult.employee)
    ? employeeResult.employee
    : null;

  const categoryResult = await supabase
    .from("organization_categories")
    .select("id")
    .eq("code", "partner")
    .maybeSingle();
  console.log("partner organizations category query result:", categoryResult);

  return { supabase, employee, partnerCategoryId: categoryResult.data?.id ?? null };
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

export async function GET(request: Request) {
  try {
    const { supabase, employee, partnerCategoryId } = await getSettingsContext();
    const requestedType = new URL(request.url).searchParams.get("partner_type");
    if (!employee || (!["glass", "coating", "accessory"].includes(requestedType ?? "") && !hasPermission(employee.role, "manage_settings"))) return Response.json({ error: "조회 권한이 필요합니다." }, { status: 403 });
    if (!partnerCategoryId) return Response.json({ error: "업체 카테고리를 찾을 수 없습니다." }, { status: 500 });

    let query = supabase
      .from("organizations")
      .select("id, name, partner_type, sort_order, is_active, memo, created_at, updated_at")
      .eq("category_id", partnerCategoryId);
    if (requestedType && isPartnerType(requestedType)) query = query.eq("partner_type", requestedType);
    const { data, error } = await query
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
    const { supabase, employee, partnerCategoryId } = await getSettingsContext();
    if (!employee || !hasPermission(employee.role, "manage_settings")) return Response.json({ error: "설정 관리 권한이 필요합니다." }, { status: 403 });
    if (!partnerCategoryId) return Response.json({ error: "업체 카테고리를 찾을 수 없습니다." }, { status: 500 });

    const body = (await request.json()) as PartnerPayload;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || !isPartnerType(body.partner_type)) return Response.json({ error: "업체명과 유형을 확인해주세요." }, { status: 400 });

    const { data, error } = await supabase
      .from("organizations")
      .insert({ category_id: partnerCategoryId, name, function_code: "partner", partner_type: body.partner_type, sort_order: parseSortOrder(body.sort_order), is_active: true, memo: typeof body.memo === "string" ? body.memo.trim() || null : null })
      .select("id, name, partner_type, sort_order, is_active, memo, created_at, updated_at")
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
    const { supabase, employee, partnerCategoryId } = await getSettingsContext();
    if (!employee || !hasPermission(employee.role, "manage_settings")) return Response.json({ error: "설정 관리 권한이 필요합니다." }, { status: 403 });
    if (!partnerCategoryId) return Response.json({ error: "업체 카테고리를 찾을 수 없습니다." }, { status: 500 });

    const body = (await request.json()) as PartnerPayload;
    const id = typeof body.id === "number" ? body.id : Number(body.id);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!Number.isInteger(id) || !name || typeof body.is_active !== "boolean" || !isPartnerType(body.partner_type)) {
      return Response.json({ error: "업체 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("organizations")
      .update({ name, partner_type: body.partner_type, sort_order: parseSortOrder(body.sort_order), is_active: body.is_active, memo: typeof body.memo === "string" ? body.memo.trim() || null : null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("category_id", partnerCategoryId)
      .select("id, name, partner_type, sort_order, is_active, memo, created_at, updated_at")
      .maybeSingle();
    console.log("partner organization update result:", { data, error });

    if (error) return errorResponse(error, error.code === "23505" ? 409 : 500);
    if (!data) return errorResponse(new Error("수정할 업체를 찾을 수 없습니다."), 404);
    return Response.json({ partner: data });
  } catch (error) {
    console.error("partner organization PATCH exception:", error);
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, employee } = await getSettingsContext();
    if (!employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

    const body = (await request.json()) as { id?: unknown; execute?: unknown };
    const id = typeof body.id === "number" ? body.id : Number(body.id);
    if (!Number.isInteger(id) || typeof body.execute !== "boolean") {
      return Response.json({ error: "업체 삭제 요청이 올바르지 않습니다." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("manage_settings_item", {
      p_entity: "partner",
      p_target_id: id,
      p_execute: body.execute,
    });

    if (error) return errorResponse(error, error.code === "42501" ? 403 : 500);
    return Response.json(data);
  } catch (error) {
    console.error("partner organization DELETE exception:", error);
    return errorResponse(error);
  }
}
