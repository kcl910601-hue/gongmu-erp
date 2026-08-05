import { getLmeContext } from "@/lib/lme-server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const id = (await params).id;
  const body = await request.json() as Record<string, unknown>;
  if (typeof body.completed !== "boolean") return Response.json({ error: "완료 상태를 확인해주세요." }, { status: 400 });
  const result = await supabase.rpc("set_reference_task_status", { p_task_id: id, p_completed: body.completed });
  if (result.error) return Response.json({ error: result.error.message }, { status: 403 });
  return Response.json({ updated: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const result = await supabase.rpc("delete_reference_task", { p_task_id: (await params).id });
  if (result.error) return Response.json({ error: result.error.message }, { status: 403 });
  return Response.json({ deleted: true });
}
