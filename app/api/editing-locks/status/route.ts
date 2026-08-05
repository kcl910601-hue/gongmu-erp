import { editingLockRpcError, getEditingLockContext } from "@/lib/editing-locks-server";

export async function POST(request: Request) {
  const context = await getEditingLockContext(request, true);
  if ("response" in context) return context.response;
  const result = await context.supabase.rpc("get_editing_lock_status", { p_resource_type: context.resourceType, p_resource_id: context.resourceId });
  if (result.error) return editingLockRpcError(result.error.message);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return Response.json({ lock: row ? { resourceType: context.resourceType, resourceId: context.resourceId, employeeId: Number(row.employee_id), employeeName: row.employee_name, expiresAt: row.expires_at, isMine: Boolean(row.is_mine) } : null });
}
