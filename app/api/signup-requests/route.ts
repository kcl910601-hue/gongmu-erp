import { isEmployeeRole } from "@/lib/approval";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { logActivityWithClient } from "@/lib/activity";

async function getAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, admin: null };

  let { data: admin } = await supabase
    .from("employees")
    .select("id, name, email")
    .eq("auth_user_id", user.id)
    .eq("role", "admin")
    .eq("active", true)
    .eq("approval_status", "approved")
    .maybeSingle();

  if (!admin && user.email) {
    const fallback = await supabase
      .from("employees")
      .select("id, name, email")
      .eq("email", user.email)
      .eq("role", "admin")
      .eq("active", true)
      .eq("approval_status", "approved")
      .maybeSingle();
    admin = fallback.data;
  }

  return { supabase, admin };
}

export async function GET() {
  const { supabase, admin } = await getAdmin();
  if (!admin) {
    return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("employees")
    .select("id, name, email, position, approval_status, created_at")
    .in("approval_status", ["pending", "rejected"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("signup requests query error:", error);
    return Response.json({ error: "가입 요청을 불러오지 못했습니다." }, { status: 500 });
  }

  return Response.json({ requests: data ?? [] });
}

export async function PATCH(request: Request) {
  const { supabase, admin } = await getAdmin();
  if (!admin) {
    return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body: unknown = await request.json();
  if (!body || typeof body !== "object") {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const values = body as Record<string, unknown>;
  const id = typeof values.id === "number" ? values.id : Number(values.id);
  const action = values.action;

  if (!Number.isInteger(id) || (action !== "approve" && action !== "reject")) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (action === "approve") {
    if (
      !isEmployeeRole(values.role) ||
      typeof values.position !== "string" ||
      !values.position.trim()
    ) {
      return Response.json({ error: "권한과 직급을 입력해주세요." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("employees")
      .update({
        approval_status: "approved",
        role: values.role,
        position: values.position.trim(),
        active: true,
        approved_at: new Date().toISOString(),
        approved_by: admin.email ?? String(admin.id),
        rejected_at: null,
      })
      .eq("id", id)
      .eq("approval_status", "pending")
      .select("id, name")
      .maybeSingle();

    if (error || !data) {
      console.error("signup approval error:", error);
      return Response.json(
        { error: "승인 처리에 실패했거나 이미 처리된 요청입니다." },
        { status: 409 }
      );
    }

    await logActivityWithClient(supabase, {
      type: "employee_approve",
      title: "직원 가입 승인",
      description: `${admin.name}님이 ${data.name}님의 가입을 승인했습니다.`,
      employeeId: admin.id,
      employeeName: admin.name,
      employeeEmail: admin.email,
      targetType: "employee",
      targetId: data.id,
      metadata: {
        role: values.role,
        changes: [
          { field: "approval_status", label: "승인 상태", before: "pending", after: "approved" },
          { field: "role", label: "권한", before: null, after: values.role },
          { field: "position", label: "직급", before: null, after: values.position.trim() },
          { field: "active", label: "활성 상태", before: false, after: true },
        ],
      },
    });
  } else {
    const { data, error } = await supabase
      .from("employees")
      .update({
        approval_status: "rejected",
        active: false,
        rejected_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("approval_status", "pending")
      .select("id, name")
      .maybeSingle();

    if (error || !data) {
      console.error("signup rejection error:", error);
      return Response.json(
        { error: "거절 처리에 실패했거나 이미 처리된 요청입니다." },
        { status: 409 }
      );
    }

    await logActivityWithClient(supabase, {
      type: "employee_reject",
      title: "직원 가입 거절",
      description: `${admin.name}님이 ${data.name}님의 가입을 거절했습니다.`,
      employeeId: admin.id,
      employeeName: admin.name,
      employeeEmail: admin.email,
      targetType: "employee",
      targetId: data.id,
      metadata: {
        changes: [
          { field: "approval_status", label: "승인 상태", before: "pending", after: "rejected" },
          { field: "active", label: "활성 상태", before: false, after: false },
        ],
      },
    });
  }

  return Response.json({ success: true });
}

