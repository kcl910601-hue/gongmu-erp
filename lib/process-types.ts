import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { ProcessType } from "@/types/process-type";

const PROCESS_TYPE_COLUMNS =
  "id, code, name, sort_order, color, is_active, created_at, updated_at";

type ProcessTypesResult = {
  data: ProcessType[];
  error: PostgrestError | null;
};

type ProcessTypeResult = {
  data: ProcessType | null;
  error: PostgrestError | null;
};

function mapProcessTypes(data: unknown[] | null, error: PostgrestError | null) {
  return {
    data: error ? [] : ((data ?? []) as ProcessType[]),
    error,
  };
}

export async function getActiveProcessTypes(): Promise<ProcessTypesResult> {
  const { data, error } = await supabase
    .from("process_types")
    .select(PROCESS_TYPE_COLUMNS)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return mapProcessTypes(data, error);
}

export async function getAllProcessTypes(): Promise<ProcessTypesResult> {
  const { data, error } = await supabase
    .from("process_types")
    .select(PROCESS_TYPE_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return mapProcessTypes(data, error);
}

export async function getProcessTypeByCode(
  code: string
): Promise<ProcessTypeResult> {
  const { data, error } = await supabase
    .from("process_types")
    .select(PROCESS_TYPE_COLUMNS)
    .eq("code", code)
    .maybeSingle();

  return {
    data: error ? null : (data as ProcessType | null),
    error,
  };
}
