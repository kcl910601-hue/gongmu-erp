import { isEmployeeRole } from "@/lib/approval";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { logActivityWithClient } from "@/lib/activity";
import { getEmployeeByAuth } from "@/lib/auth";
import { isAuthorizedEmployee } from "@/lib/permissions";
import { createSupabaseAdminClient } from "@/lib/auth-admin";

async function getAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, admin: null };

  const { employee, error } = await getEmployeeByAuth(supabase, user);
  if (error) console.error("signup requests employee lookup error:", error);
  const admin = employee?.role === "admin" && isAuthorizedEmployee(employee)
    ? employee
    : null;

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

  try {
    const serviceClient = createSupabaseAdminClient();
    const authUsers = [];
    for (let page = 1; ; page += 1) {
      const result = await serviceClient.auth.admin.listUsers({ page, perPage: 200 });
      if (result.error) throw result.error;
      authUsers.push(...result.data.users);
      if (result.data.users.length < 200) break;
    }
    const authIds = authUsers.map((user) => user.id);
    const linkedResult = authIds.length > 0
      ? await serviceClient.from("employees").select("auth_user_id").in("auth_user_id", authIds)
      : { data: [], error: null };
    if (linkedResult.error) throw linkedResult.error;
    const linkedIds = new Set((linkedResult.data ?? []).map((employee) => employee.auth_user_id));
    const incomplete = authUsers
      .filter((user) => !linkedIds.has(user.id))
      .map((user) => ({
        id: user.id,
        name: typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "이름 미등록",
        email: user.email ?? "이메일 미등록",
        position: null,
        approval_status: "incomplete" as const,
        created_at: user.created_at,
      }));
    return Response.json({ requests: [...(data ?? []), ...incomplete] });
  } catch (authError) {
    console.error("incomplete signup account lookup error:", authError);
    return Response.json({ error: "불완전 가입 계정을 확인하지 못했습니다." }, { status: 500 });
  }
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

    const pendingEmployee = await supabase
      .from("employees")
      .select("id,email,auth_user_id,approval_status")
      .eq("id", id)
      .maybeSingle();
    if (
      pendingEmployee.error ||
      !pendingEmployee.data ||
      !["pending", "rejected"].includes(pendingEmployee.data.approval_status)
    ) {
      return Response.json({ error: "승인 가능한 가입 요청을 찾을 수 없습니다." }, { status: 409 });
    }
    if (!pendingEmployee.data.auth_user_id) {
      return Response.json({ error: "Auth 연결이 없어 승인할 수 없습니다. 계정 연결을 먼저 복구해주세요." }, { status: 409 });
    }
    try {
      const serviceClient = createSupabaseAdminClient();
      const authResult = await serviceClient.auth.admin.getUserById(pendingEmployee.data.auth_user_id);
      if (authResult.error || !authResult.data.user) {
        return Response.json({ error: "연결된 Auth 사용자를 찾을 수 없습니다." }, { status: 409 });
      }
      if (authResult.data.user.email?.toLocaleLowerCase("en-US") !== pendingEmployee.data.email?.toLocaleLowerCase("en-US")) {
        return Response.json({ error: "Auth와 직원 이메일이 일치하지 않습니다." }, { status: 409 });
      }
    } catch (authError) {
      console.error("signup approval auth verification error:", authError);
      return Response.json({ error: "Auth 연결 상태를 확인하지 못했습니다." }, { status: 500 });
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
      .in("approval_status", ["pending", "rejected"])
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
