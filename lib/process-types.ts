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

export function normalizeProcessTypeCode(value: string) {
  const trimmed = value.trim();
  const comparisonKey = trimmed
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLocaleLowerCase("ko-KR");

  if (comparisonKey === "본납문틀") return "본납-문틀";
  if (comparisonKey === "본납도어") return "본납-도어";
  return trimmed;
}

function normalizeProcessTypes(processTypes: ProcessType[]) {
  const byCode = new Map<string, ProcessType>();

  for (const processType of processTypes) {
    const normalizedCode = normalizeProcessTypeCode(processType.code);
    const normalizedName = normalizeProcessTypeCode(processType.name);
    const code =
      normalizedCode === "본납-문틀" || normalizedCode === "본납-도어"
        ? normalizedCode
        : normalizedName === "본납-문틀" || normalizedName === "본납-도어"
          ? normalizedName
          : normalizedCode;
    const current = byCode.get(code);
    const normalized = {
      ...processType,
      code,
      name: code === "본납-문틀" || code === "본납-도어" ? code : processType.name,
    };

    const isCanonicalRow =
      processType.code === code || processType.name === code;
    const currentIsCanonical =
      current?.code === code && current?.name === code;

    if (!current || (isCanonicalRow && !currentIsCanonical)) {
      byCode.set(code, normalized);
    }
  }

  return [...byCode.values()].sort(
    (left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name, "ko-KR")
  );
}

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

  const result = mapProcessTypes(data, error);
  return {
    ...result,
    data: normalizeProcessTypes(result.data),
  };
}

export async function getAllProcessTypes(): Promise<ProcessTypesResult> {
  const { data, error } = await supabase
    .from("process_types")
    .select(PROCESS_TYPE_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const result = mapProcessTypes(data, error);
  return {
    ...result,
    data: normalizeProcessTypes(result.data),
  };
}

export async function getProcessTypeByCode(
  code: string
): Promise<ProcessTypeResult> {
  const normalizedCode = normalizeProcessTypeCode(code);
  const { data, error } = await supabase
    .from("process_types")
    .select(PROCESS_TYPE_COLUMNS)
    .eq("code", normalizedCode)
    .maybeSingle();

  return {
    data: error ? null : (data as ProcessType | null),
    error,
  };
}
