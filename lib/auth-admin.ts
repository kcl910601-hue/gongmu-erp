import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string
): Promise<{ user: User | null; error: string | null }> {
  const normalizedEmail = email.trim().toLocaleLowerCase("en-US");
  let page = 1;

  while (page <= 50) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (result.error) return { user: null, error: result.error.message };
    const user = result.data.users.find(
      (item) => item.email?.toLocaleLowerCase("en-US") === normalizedEmail
    );
    if (user) return { user, error: null };
    if (result.data.users.length < 200) break;
    page += 1;
  }

  return { user: null, error: null };
}

export function isValidEmployeeEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
