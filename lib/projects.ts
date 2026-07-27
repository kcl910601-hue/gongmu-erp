import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { isTaskCompleted } from "@/lib/status";
import type { ProjectAssemblyVendor } from "@/types/project-section";

export type ProjectListItem = {
  id: number;
  project_code: string | null;
  project_name: string;
  client_name: string | null;
  assembly_vendor: string | null;
  process_type: string;
  salesperson: string | null;
  task_manager: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  completion_due_date: string | null;
  site_address: string | null;
  assembly_vendor_organization_id: number | null;
  assemblyVendors: ProjectAssemblyVendor[];
  memo: string | null;
  created_at: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  progress: number;
  task_count: number;
  completed_task_count: number;
};

export const PROJECT_SELECT_FIELDS = "id, project_code, project_name, client_name, assembly_vendor, assembly_vendor_organization_id, process_type, salesperson, task_manager, status, start_date, end_date, completion_due_date, site_address, memo, quantity, quantity_unit, created_at";

function getOrganizationName(value: unknown) {
  const organization = Array.isArray(value) ? value[0] : value;
  if (!organization || typeof organization !== "object" || !("name" in organization)) return null;
  return typeof organization.name === "string" ? organization.name : null;
}

type GetProjectsResult = {
  data: ProjectListItem[];
  error: PostgrestError | null;
};

export async function getProjects(): Promise<GetProjectsResult> {
  const [projectResult, taskResult, assemblyVendorResult] = await Promise.all([
    supabase
      .from("projects")
      .select(PROJECT_SELECT_FIELDS)
      .order("created_at", { ascending: false }),
    supabase.from("tasks").select("project_id, status"),
    supabase
      .from("project_assembly_vendors")
      .select("id, project_id, organization_id, sort_order, is_primary, allocated_quantity, organization:organizations(name)")
      .order("sort_order", { ascending: true }),
  ]);

  const { data, error } = projectResult;

  if (error) {
    return { data: [], error };
  }

  if (taskResult.error) {
    return { data: [], error: taskResult.error };
  }

  if (assemblyVendorResult.error) {
    return { data: [], error: assemblyVendorResult.error };
  }

  const assemblyVendors = new Map<number, ProjectAssemblyVendor[]>();
  for (const relation of assemblyVendorResult.data || []) {
    const organizationName = getOrganizationName(relation.organization);
    if (!organizationName) continue;
    const projectId = Number(relation.project_id);
    const current = assemblyVendors.get(projectId) ?? [];
    current.push({
      id: Number(relation.id),
      organizationId: Number(relation.organization_id),
      organizationName,
      isPrimary: Boolean(relation.is_primary),
      sortOrder: Number(relation.sort_order),
      allocatedQuantity: relation.allocated_quantity === null ? null : Number(relation.allocated_quantity),
    });
    assemblyVendors.set(projectId, current);
  }

  const counts = new Map<number, { total: number; completed: number }>();
  for (const task of taskResult.data || []) {
    const projectId = Number(task.project_id);
    const current = counts.get(projectId) ?? { total: 0, completed: 0 };
    current.total += 1;
    if (isTaskCompleted(task.status)) current.completed += 1;
    counts.set(projectId, current);
  }

  const projects = (data || []).map((project) => {
    const taskCount = counts.get(Number(project.id)) ?? { total: 0, completed: 0 };
    return {
      ...project,
      assemblyVendors: assemblyVendors.get(Number(project.id)) ?? [],
      progress: taskCount.total === 0 ? 0 : Math.round((taskCount.completed / taskCount.total) * 100),
      task_count: taskCount.total,
      completed_task_count: taskCount.completed,
    } as ProjectListItem;
  });

  return { data: projects, error: null };
}

export function normalizeAssemblyVendor(value: string | null | undefined) {
  const trimmedValue = (value || "").trim();

  return trimmedValue || null;
}
