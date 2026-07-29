import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getEmployeeByAuth } from "@/lib/auth";
import { isAuthorizedEmployee } from "@/lib/permissions";
import { createSupabaseAdminClient } from "@/lib/auth-admin";

async function requireAdmin() {
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { actorId: null, authorized: false };
  const actor = await getEmployeeByAuth(client, user);
  return {
    actorId: user.id,
    authorized: actor.employee?.role === "admin" && isAuthorizedEmployee(actor.employee),
  };
}

async function countReference(table: string, column: string, value: string | number) {
  const admin = createSupabaseAdminClient();
  const result = await admin.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (result.error) throw result.error;
  return result.count ?? 0;
}

async function inspectEmployee(employeeId: number) {
  const admin = createSupabaseAdminClient();
  const employeeResult = await admin.from("employees").select("*").eq("id", employeeId).maybeSingle();
  if (employeeResult.error) throw employeeResult.error;
  if (!employeeResult.data) return null;
  const employee = employeeResult.data;
  const references = await Promise.all([
    countReference("projects", "salesperson", employee.name),
    countReference("projects", "task_manager", employee.name),
    countReference("project_sections", "task_manager", employee.name),
    countReference("tasks", "assignee", employee.name),
    countReference("shipments", "driver_name", employee.name),
    countReference("activity_logs", "employee_id", employee.id),
    countReference("project_files", "uploaded_by", employee.name),
    ...(employee.email
      ? [
          countReference("activity_logs", "employee_email", employee.email),
          countReference("project_files", "uploaded_by_email", employee.email),
        ]
      : []),
  ]);
  return { employee, referenceCount: references.reduce((sum, count) => sum + count, 0) };
}

function parseEmployeeId(request: Request) {
  return Number(new URL(request.url).searchParams.get("employeeId"));
}

export async function GET(request: Request) {
  const actor = await requireAdmin();
  if (!actor.authorized) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const employeeId = parseEmployeeId(request);
  if (!Number.isInteger(employeeId)) return Response.json({ error: "직원 정보가 올바르지 않습니다." }, { status: 400 });
  try {
    const inspection = await inspectEmployee(employeeId);
    if (!inspection) return Response.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
    if (inspection.employee.auth_user_id === actor.actorId) {
      return Response.json({ error: "현재 로그인한 관리자 계정은 삭제할 수 없습니다." }, { status: 409 });
    }
    return Response.json({
      action: inspection.referenceCount > 0 ? "deactivate" : "delete",
      referenceCount: inspection.referenceCount,
      hasAuth: Boolean(inspection.employee.auth_user_id),
    });
  } catch (error) {
    console.error("employee deletion inspection error:", error);
    return Response.json({ error: "직원 삭제 영향을 확인하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const actor = await requireAdmin();
  if (!actor.authorized) return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const employeeId = parseEmployeeId(request);
  if (!Number.isInteger(employeeId)) return Response.json({ error: "직원 정보가 올바르지 않습니다." }, { status: 400 });
  try {
    const inspection = await inspectEmployee(employeeId);
    if (!inspection) return Response.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
    if (inspection.employee.auth_user_id === actor.actorId) return Response.json({ error: "현재 로그인한 관리자 계정은 삭제할 수 없습니다." }, { status: 409 });
    if (inspection.referenceCount > 0) {
      return Response.json({ error: "관련 업무 기록이 있어 완전 삭제할 수 없습니다. 직원을 비활성화해주세요." }, { status: 409 });
    }

    const admin = createSupabaseAdminClient();
    const employee = inspection.employee;
    const deleteEmployee = await admin.from("employees").delete().eq("id", employee.id).select("id").maybeSingle();
    if (deleteEmployee.error || !deleteEmployee.data) throw deleteEmployee.error ?? new Error("employees 삭제를 확인하지 못했습니다.");

    if (employee.auth_user_id) {
      const authDelete = await admin.auth.admin.deleteUser(employee.auth_user_id);
      if (authDelete.error) {
        const restore = await admin.from("employees").insert(employee);
        if (restore.error) console.error("employee restore after Auth deletion failure:", restore.error);
        throw authDelete.error;
      }
    }

    const [remainingEmployee, remainingAuth] = await Promise.all([
      admin.from("employees").select("id").eq("id", employee.id).maybeSingle(),
      employee.auth_user_id ? admin.auth.admin.getUserById(employee.auth_user_id) : Promise.resolve({ data: { user: null }, error: null }),
    ]);
    if (remainingEmployee.data || remainingAuth.data.user) throw new Error("삭제 후 계정이 남아 있습니다.");
    return Response.json({ success: true });
  } catch (error) {
    console.error("employee complete deletion error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "직원 계정을 삭제하지 못했습니다." }, { status: 500 });
  }
}
