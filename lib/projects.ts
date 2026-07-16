import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

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
  created_at: string | null;
};

type GetProjectsResult = {
  data: ProjectListItem[];
  error: PostgrestError | null;
};

export async function getProjects(): Promise<GetProjectsResult> {
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, project_code, project_name, client_name, assembly_vendor, process_type, salesperson, task_manager, status, start_date, end_date, completion_due_date, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error };
  }

  return { data: (data || []) as ProjectListItem[], error: null };
}

export function normalizeAssemblyVendor(value: string | null | undefined) {
  const trimmedValue = (value || "").trim();

  return trimmedValue || null;
}
