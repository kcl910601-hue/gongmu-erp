import { editingLockRpcError, getEditingLockContext } from "@/lib/editing-locks-server";

export async function POST(request: Request) {
  const context = await getEditingLockContext(request);
  if ("response" in context) return context.response;
  const result = await context.supabase.rpc("heartbeat_editing_lock", { p_lock_token: context.token });
  if (result.error) return editingLockRpcError(result.error.message);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row) return Response.json({ error: "편집 잠금이 만료되었습니다." }, { status: 409 });
  return Response.json({ lock: { resourceType: row.resource_type, resourceId: row.resource_id, employeeId: Number(row.employee_id), employeeName: row.employee_name, expiresAt: row.expires_at, isMine: true } });
}
