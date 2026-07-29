import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getEmployeeByAuth } from "@/lib/auth";
import { isAuthorizedEmployee } from "@/lib/permissions";
import { createSupabaseAdminClient } from "@/lib/auth-admin";

export async function GET() {
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const actor = await getEmployeeByAuth(client, user);
  if (actor.employee?.role !== "admin" || !isAuthorizedEmployee(actor.employee)) {
    return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: employees, error } = await admin.from("employees").select("id,auth_user_id");
    if (error) throw error;
    const authIds = new Set<string>();
    for (let page = 1; ; page += 1) {
      const result = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (result.error) throw result.error;
      result.data.users.forEach((authUser) => authIds.add(authUser.id));
      if (result.data.users.length < 200) break;
    }
    const statuses: Record<string, "linked" | "unlinked" | "missing_auth"> = {};
    for (const employee of employees) {
      if (!employee.auth_user_id) {
        statuses[String(employee.id)] = "unlinked";
        continue;
      }
      statuses[String(employee.id)] = authIds.has(employee.auth_user_id) ? "linked" : "missing_auth";
    }
    return Response.json({ statuses });
  } catch (error) {
    console.error("employee account status error:", error);
    return Response.json({ error: "Auth 연결 상태를 확인하지 못했습니다." }, { status: 500 });
  }
}
