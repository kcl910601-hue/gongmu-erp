import { getEditingLockContext } from "@/lib/editing-locks-server";

export async function POST(request: Request) {
  const context = await getEditingLockContext(request);
  if ("response" in context) return context.response;
  const result = await context.supabase.rpc("release_editing_lock", { p_lock_token: context.token });
  if (result.error) return Response.json({ error: result.error.message }, { status: 409 });
  return Response.json({ released: Boolean(result.data) });
}
