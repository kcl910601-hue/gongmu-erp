import type { SupabaseClient, User } from "@supabase/supabase-js";

export type CurrentEmployee = {
  id: number;
  name: string;
  email: string | null;
  position: string | null;
  role: string | null;
  active: boolean | null;
  approval_status: string | null;
  auth_user_id: string | null;
  organization?: { name: string | null } | Array<{ name: string | null }> | null;
};

type EmployeeAuthClient = Pick<SupabaseClient, "from">;

export async function getEmployeeByAuth(
  client: EmployeeAuthClient,
  user: User
): Promise<{ employee: CurrentEmployee | null; error: string | null }> {
  const byAuthUser = await client
    .from("employees")
    .select("id, name, email, position, role, active, approval_status, auth_user_id, organization:organizations(name)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (byAuthUser.error) {
    return { employee: null, error: byAuthUser.error.message };
  }
  if (byAuthUser.data) {
    return { employee: byAuthUser.data as CurrentEmployee, error: null };
  }

  if (!user.email) return { employee: null, error: null };

  const byEmail = await client
    .from("employees")
    .select("id, name, email, position, role, active, approval_status, auth_user_id, organization:organizations(name)")
    .eq("email", user.email)
    .maybeSingle();

  return {
    employee: byEmail.error ? null : (byEmail.data as CurrentEmployee | null),
    error: byEmail.error?.message ?? null,
  };
}

export async function getCurrentEmployee(): Promise<CurrentEmployee | null> {
  const { supabase } = await import("@/lib/supabase");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const result = await getEmployeeByAuth(supabase, user);
  return result.employee;
}

export function isAdmin(employee: CurrentEmployee | null) {
  return employee?.role === "admin";
}

export function isManager(employee: CurrentEmployee | null) {
  return employee?.role === "manager";
}

export function isViewer(employee: CurrentEmployee | null) {
  return employee?.role === "viewer";
}

export function isMember(employee: CurrentEmployee | null) {
  return employee?.role === "staff" || employee?.role === "member";
}
