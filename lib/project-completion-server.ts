import type { SupabaseClient } from "@supabase/supabase-js";
import { getLocalDateString } from "./task-priority.ts";
import { evaluateProjectCompletionCheck, type CompletionMaterialRequest, type CompletionTask } from "./project-completion.ts";

export async function getProjectCompletionCheck(client: SupabaseClient, projectId: number) {
  const [project, tasks, materials, shipments, sections] = await Promise.all([
    client.from("projects").select("id, project_name").eq("id", projectId).maybeSingle(),
    client.from("tasks").select("id, project_id, project_section_id, task_name, task_type, assignee, status, start_date, due_date, completed_date, created_at").eq("project_id", projectId),
    client.rpc("get_material_usage_requests_v2", { p_project_id: projectId }),
    client.from("shipments").select("id, status").eq("project_id", projectId),
    client.from("project_sections").select("process_type").eq("project_id", projectId),
  ]);
  const error = project.error ?? tasks.error ?? materials.error ?? shipments.error ?? sections.error;
  if (error) return { data: null, error: error.message, notFound: false } as const;
  if (!project.data) return { data: null, error: null, notFound: true } as const;
  const taskRows = (tasks.data ?? []) as CompletionTask[];
  const notes = taskRows.length === 0 ? { data: [], error: null } : await client.from("task_notes").select("id, task_id, check_date").in("task_id", taskRows.map((task) => task.id));
  if (notes.error) return { data: null, error: notes.error.message, notFound: false } as const;
  const now = new Date();
  return { data: evaluateProjectCompletionCheck({ projectId, projectName: String(project.data.project_name), today: getLocalDateString(now), checkedAt: now.toISOString(), tasks: taskRows, taskNotes: notes.data ?? [], materialRequests: (materials.data ?? []).map((row: { status: "active" | "cancelled"; unallocated_tons: number | string }) => ({ status: row.status, unallocated_tons: Number(row.unallocated_tons) })) as CompletionMaterialRequest[], shipments: shipments.data ?? [], projectSections: sections.data ?? [] }), error: null, notFound: false } as const;
}
