import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getEmployeeByAuth } from "@/lib/auth";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ status: "unauthenticated" }, { status: 401 });
  }

  const employeeResult = await getEmployeeByAuth(supabase, user);
  if (employeeResult.error) {
    console.error("authorization employee lookup error:", employeeResult.error);
    return Response.json({ status: "authorization_error" }, { status: 500 });
  }
  const employee = employeeResult.employee;

  if (!employee) {
    return Response.json({ status: "missing_employee" }, { status: 403 });
  }

  if (employee.approval_status === "rejected") {
    return Response.json({ status: "rejected" }, { status: 403 });
  }

  if (employee.approval_status !== "approved") {
    return Response.json({ status: "pending" }, { status: 403 });
  }

  if (employee.active === false) {
    return Response.json({ status: "inactive" }, { status: 403 });
  }

  return Response.json({ status: "approved", role: employee.role });
}
