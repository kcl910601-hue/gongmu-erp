import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getEmployeeByAuth } from "@/lib/auth";
import { getEmployeeAuthorizationStatus } from "@/lib/permissions";

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

  const status = getEmployeeAuthorizationStatus(employee);
  if (status !== "approved" || !employee) {
    return Response.json({ status }, { status: 403 });
  }

  return Response.json({ status: "approved", role: employee.role });
}
