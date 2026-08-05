import { getLmeContext } from "@/lib/lme-server";
import { normalizeReferenceTaskOptions } from "@/lib/reference-tasks";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const id = (await params).id;
  const body = await request.json() as Record<string, unknown>;
  const current = await supabase.from("reference_tasks").select("title,due_date,priority,status").eq("id", id).maybeSingle();
  if (current.error) return Response.json({ error: current.error.message }, { status: 500 });
  if (!current.data) return Response.json({ error: "내 할 일을 찾을 수 없습니다." }, { status: 404 });
  const normalized = normalizeReferenceTaskOptions({ title: body.title ?? current.data.title, dueDate: body.dueDate === undefined ? current.data.due_date : body.dueDate, priority: body.priority ?? current.data.priority });
  if (normalized.error) return Response.json({ error: normalized.error }, { status: 400 });
  const completed = typeof body.completed === "boolean" ? body.completed : current.data.status === "completed";
  const result = await supabase.rpc("update_reference_task", { p_task_id: id, p_title: normalized.options.title, p_due_date: normalized.options.dueDate, p_priority: normalized.options.priority, p_completed: completed });
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
