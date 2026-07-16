import { supabase } from "@/lib/supabase";

export type CurrentEmployee = {
  id: number;
  name: string;
  email: string | null;
  position: string | null;
  role: string | null;
  active: boolean | null;
};

export async function getCurrentEmployee(): Promise<CurrentEmployee | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.email) {
    return null;
  }

  const { data, error } = await supabase
    .from("employees")
    .select("id, name, email, position, role, active")
    .eq("email", session.user.email)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
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
  return employee?.role === "member";
}