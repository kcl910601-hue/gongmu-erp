import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type {
  CreateProjectSectionInput,
  ProjectSection,
  SectionProgress,
} from "@/types/project-section";
import { isTaskCompleted, isTaskInProgress, isTaskPending } from "@/lib/status";

const PROJECT_SECTION_COLUMNS =
  "id, project_id, process_type, assembly_vendor, task_manager, quantity, start_date, end_date, status, memo, sort_order, created_at, updated_at";

type ProjectSectionsResult = {
  data: ProjectSection[];
  error: PostgrestError | null;
};

type ProjectSectionResult = {
  data: ProjectSection | null;
  error: PostgrestError | null;
};

export async function getProjectSections(
  projectId: number
): Promise<ProjectSectionsResult> {
  const { data, error } = await supabase
    .from("project_sections")
    .select(PROJECT_SECTION_COLUMNS)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  return {
    data: error ? [] : ((data ?? []) as ProjectSection[]),
    error,
  };
}

export async function getProjectSection(
  sectionId: number
): Promise<ProjectSectionResult> {
  const { data, error } = await supabase
    .from("project_sections")
    .select(PROJECT_SECTION_COLUMNS)
    .eq("id", sectionId)
    .maybeSingle();

  return {
    data: error ? null : (data as ProjectSection | null),
    error,
  };
}

export async function getSectionsByProjectIds(
  projectIds: number[]
): Promise<ProjectSectionsResult> {
  const uniqueProjectIds = [...new Set(projectIds)];

  if (uniqueProjectIds.length === 0) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from("project_sections")
    .select(PROJECT_SECTION_COLUMNS)
    .in("project_id", uniqueProjectIds)
    .order("project_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  return {
    data: error ? [] : ((data ?? []) as ProjectSection[]),
    error,
  };
}

type SectionProgressTask = { status: string | null; due_date: string | null };

export function calculateSectionProgress(tasks: SectionProgressTask[]): SectionProgress {
  const today = new Date().toISOString().slice(0, 10);
  const completed = tasks.filter((task) => isTaskCompleted(task.status)).length;

  return {
    total: tasks.length,
    completed,
    inProgress: tasks.filter((task) => isTaskInProgress(task.status)).length,
    pending: tasks.filter((task) => isTaskPending(task.status)).length,
    delayed: tasks.filter(
      (task) => !isTaskCompleted(task.status) && Boolean(task.due_date) && task.due_date! < today
    ).length,
    percentage: tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100),
  };
}

export function getComputedSectionStatus(tasks: SectionProgressTask[]) {
  if (tasks.length === 0) return "pending" as const;
  if (tasks.every((task) => isTaskCompleted(task.status))) return "completed" as const;
  if (tasks.some((task) => isTaskInProgress(task.status) || isTaskCompleted(task.status))) {
    return "in_progress" as const;
  }
  return "pending" as const;
}

export async function createProjectSectionWithTasks(input: CreateProjectSectionInput) {
  const { data, error } = await supabase.rpc("create_project_section_with_tasks", {
    p_project_id: input.projectId,
    p_process_type: input.processType,
    p_assembly_vendor: input.assemblyVendor,
    p_task_manager: input.taskManager,
    p_quantity: input.quantity,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_memo: input.memo,
    p_source_section_id: input.sourceSectionId ?? null,
  });

  return { data: data as { section_id: number; task_count: number } | null, error };
}

export type DeleteProjectSectionResult = {
  section_id: number;
  project_id: number;
  deleted_task_count: number;
  project_status: string;
};

export async function deleteProjectSectionWithTasks(sectionId: number) {
  const { data, error } = await supabase.rpc("delete_project_section_with_tasks", {
    p_section_id: sectionId,
  });

  return { data: data as DeleteProjectSectionResult | null, error };
}
