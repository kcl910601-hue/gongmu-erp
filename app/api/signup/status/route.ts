import { createSupabaseAdminClient, findAuthUserByEmail, isValidEmployeeEmail } from "@/lib/auth-admin";

export async function POST(request: Request) {
  const body: unknown = await request.json();
  const email = body && typeof body === "object" && "email" in body && typeof body.email === "string"
    ? body.email.trim().toLocaleLowerCase("en-US")
    : "";
  if (!isValidEmployeeEmail(email)) {
    return Response.json({ error: "올바른 이메일을 입력해주세요." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const [authResult, employeeResult] = await Promise.all([
      findAuthUserByEmail(admin, email),
      admin
        .from("employees")
        .select("id,auth_user_id,active,approval_status")
        .ilike("email", email)
        .maybeSingle(),
    ]);
    if (authResult.error) throw new Error(authResult.error);
    if (employeeResult.error) throw employeeResult.error;

    const authUser = authResult.user;
    const employee = employeeResult.data;
    if (!authUser && !employee) return Response.json({ status: "not_found" });
    if (!employee) return Response.json({ status: "auth_only_incomplete" });
    if (!authUser) return Response.json({ status: "employee_only_missing_auth" });
    if (employee.auth_user_id !== authUser.id) return Response.json({ status: "auth_only_incomplete" });
    return Response.json({
      status: "linked",
      approvalStatus: employee.approval_status,
      active: employee.active,
    });
  } catch (error) {
    console.error("signup status lookup error:", error);
    return Response.json({ error: "가입 상태를 확인하지 못했습니다." }, { status: 500 });
  }
}
