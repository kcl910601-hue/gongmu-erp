import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getEmployeeByAuth } from "@/lib/auth";
import { isAuthorizedEmployee } from "@/lib/permissions";
import {
  createSupabaseAdminClient,
  findAuthUserByEmail,
  isValidEmployeeEmail,
} from "@/lib/auth-admin";

async function requireAdmin() {
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { client, authorized: false };
  const result = await getEmployeeByAuth(client, user);
  return {
    client,
    authorized: result.employee?.role === "admin" && isAuthorizedEmployee(result.employee),
  };
}

export async function GET(request: Request) {
  const { authorized } = await requireAdmin();
  if (!authorized) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const employeeId = Number(new URL(request.url).searchParams.get("employeeId"));
  if (!Number.isInteger(employeeId)) {
    return Response.json({ error: "직원 정보가 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const employeeResult = await admin
      .from("employees")
      .select("auth_user_id, email")
      .eq("id", employeeId)
      .maybeSingle();
    if (employeeResult.error) throw employeeResult.error;
    if (!employeeResult.data?.auth_user_id) {
      return Response.json({ account: null });
    }
    const authResult = await admin.auth.admin.getUserById(employeeResult.data.auth_user_id);
    if (authResult.error) throw authResult.error;
    return Response.json({
      account: {
        email: authResult.data.user.email ?? employeeResult.data.email,
        createdAt: authResult.data.user.created_at,
        lastSignInAt: authResult.data.user.last_sign_in_at ?? null,
      },
    });
  } catch (error) {
    console.error("employee auth account query error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "계정정보를 조회하지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { authorized } = await requireAdmin();
  if (!authorized) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const body: unknown = await request.json();
  if (!body || typeof body !== "object") {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const values = body as Record<string, unknown>;
  const employeeId = Number(values.employeeId);
  const email = typeof values.email === "string"
    ? values.email.trim().toLocaleLowerCase("en-US")
    : "";
  if (!Number.isInteger(employeeId) || !isValidEmployeeEmail(email)) {
    return Response.json({ error: "올바른 이메일을 입력해주세요." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const employeeResult = await admin
      .from("employees")
      .select("id, name, auth_user_id")
      .eq("id", employeeId)
      .maybeSingle();
    if (employeeResult.error) throw employeeResult.error;
    if (!employeeResult.data) return Response.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
    if (employeeResult.data.auth_user_id) {
      return Response.json({ error: "이미 Auth 계정과 연결된 직원입니다." }, { status: 409 });
    }

    const duplicateEmployee = await admin
      .from("employees")
      .select("id")
      .ilike("email", email)
      .neq("id", employeeId)
      .maybeSingle();
    if (duplicateEmployee.error) throw duplicateEmployee.error;
    if (duplicateEmployee.data) {
      return Response.json({ error: "이미 다른 직원이 사용하는 이메일입니다." }, { status: 409 });
    }

    const authLookup = await findAuthUserByEmail(admin, email);
    if (authLookup.error) throw new Error(authLookup.error);
    let authUser = authLookup.user;
    let invited = false;

    if (!authUser) {
      const inviteResult = await admin.auth.admin.inviteUserByEmail(email, {
        data: { name: employeeResult.data.name, employee_id: employeeId },
      });
      if (inviteResult.error) throw inviteResult.error;
      authUser = inviteResult.data.user;
      invited = true;
    }

    const linkResult = await admin
      .from("employees")
      .update({
        auth_user_id: authUser.id,
        email,
        approval_status: "approved",
        active: true,
      })
      .eq("id", employeeId)
      .or(`auth_user_id.is.null,auth_user_id.eq.${authUser.id}`)
      .select("id")
      .maybeSingle();
    if (linkResult.error) throw linkResult.error;
    if (!linkResult.data) {
      return Response.json({ error: "계정 연결 상태가 변경되었습니다. 목록을 새로고침해주세요." }, { status: 409 });
    }

    return Response.json({ success: true, invited });
  } catch (error) {
    console.error("employee auth link error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Auth 연결을 처리하지 못했습니다." },
      { status: 500 }
    );
  }
}
