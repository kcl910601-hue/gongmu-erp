import { supabase } from "@/lib/supabase";

export type SaveEmployeeInput = {
  id?: string | number;
  name: string;
  email?: string | null;
  organizationId: number | null;
  position?: string | null;
  role?: string | null;
  active: boolean;
  phone?: string | null;
  memo?: string | null;
};

export async function saveEmployee(input: SaveEmployeeInput): Promise<{
  employeeId: number | null;
  error: string | null;
}> {
  const name = input.name.trim();
  if (!name) return { employeeId: null, error: "이름을 입력해주세요." };
  if (!input.organizationId) {
    return { employeeId: null, error: "조직을 선택해주세요." };
  }

  const email = input.email?.trim().toLocaleLowerCase("en-US") || null;
  const payload = {
    name,
    email,
    organization_id: input.organizationId,
    position: input.position?.trim() || null,
    role: input.role ?? "staff",
    active: input.active,
    phone: input.phone?.trim() || null,
    memo: input.memo?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const result = input.id
    ? await supabase.from("employees").update(payload).eq("id", input.id).select("id").single()
    : await supabase
        .from("employees")
        .insert({ ...payload, auth_user_id: null, approval_status: "approved" })
        .select("id")
        .single();

  return {
    employeeId: result.error || !result.data ? null : Number(result.data.id),
    error: result.error?.message ?? null,
  };
}

export async function setEmployeeActive(
  employeeId: string | number,
  active: boolean
): Promise<{ error: string | null }> {
  const result = await supabase
    .from("employees")
    .update({ active })
    .eq("id", employeeId);

  return { error: result.error?.message ?? null };
}
