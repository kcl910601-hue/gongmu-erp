import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ status: "unauthenticated" }, { status: 401 });
  }

  const query = supabase
    .from("employees")
    .select("approval_status, active, role")
    .eq("auth_user_id", user.id);

  const byAuthUser = await query.maybeSingle();
  let employee = byAuthUser.data;

  if (!employee && user.email) {
    const byEmail = await supabase
      .from("employees")
      .select("approval_status, active, role")
      .eq("email", user.email)
      .maybeSingle();
    employee = byEmail.data;
  }

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
