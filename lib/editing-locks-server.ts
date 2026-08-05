import { getLmeContext } from "@/lib/lme-server";
import { isEditingLockResourceType } from "@/lib/editing-locks";

export async function getEditingLockContext(request: Request, requireResource = false) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return { response: Response.json({ error: "로그인이 필요합니다." }, { status: 401 }) } as const;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return { response: Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 }) } as const; }
  const token = typeof body.token === "string" && /^[0-9a-f-]{36}$/i.test(body.token) ? body.token : null;
  if (!requireResource) {
    if (!token) return { response: Response.json({ error: "잠금 토큰을 확인해주세요." }, { status: 400 }) } as const;
    return { supabase, employee, token } as const;
  }
  const resourceType = body.resourceType;
  const resourceId = typeof body.resourceId === "string" ? body.resourceId.trim() : "";
  if (!isEditingLockResourceType(resourceType) || !resourceId || resourceId.length > 200) return { response: Response.json({ error: "잠금 대상을 확인해주세요." }, { status: 400 }) } as const;
  return { supabase, employee, resourceType, resourceId } as const;
}

export function editingLockRpcError(message: string) {
  const forbidden = message.includes("permission denied") || message.includes("not editable");
  return Response.json({ error: forbidden ? "이 리소스를 수정할 권한이 없습니다." : message }, { status: forbidden ? 403 : 409 });
}
