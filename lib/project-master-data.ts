import { supabase } from "@/lib/supabase";

type EmployeeMasterRow = {
  id: number;
  name: string;
  position: string | null;
  active: boolean | null;
  approval_status: string | null;
};

export type ProjectEntryOptions = {
  salespeople: Array<{ value: string; label: string }>;
  assemblyVendors: string[];
};

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

export function uniqueNormalizedValues(values: Array<string | null | undefined>) {
  const valuesByKey = new Map<string, string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = normalizeKey(trimmed);
    if (!valuesByKey.has(key)) valuesByKey.set(key, trimmed);
  }
  return [...valuesByKey.values()].sort((a, b) =>
    a.localeCompare(b, "ko-KR", { numeric: true, sensitivity: "base" })
  );
}

export async function getProjectEntryOptions(): Promise<{
  data: ProjectEntryOptions;
  error: string | null;
}> {
  const [employeeResult, projectResult] = await Promise.all([
    supabase
      .from("employees")
      .select("id, name, position, active, approval_status")
      .eq("active", true)
      .eq("approval_status", "approved"),
    supabase.from("projects").select("assembly_vendor"),
  ]);

  const employees = (employeeResult.data ?? []) as EmployeeMasterRow[];
  const salespersonByKey = new Map<string, { value: string; label: string }>();
  for (const employee of employees) {
    const name = employee.name.trim();
    if (!name) continue;
    const key = normalizeKey(name);
    if (!salespersonByKey.has(key)) {
      salespersonByKey.set(key, {
        value: name,
        label: [employee.position?.trim(), name].filter(Boolean).join(" "),
      });
    }
  }
  return {
    data: {
      salespeople: [...salespersonByKey.values()].sort((a, b) => a.label.localeCompare(b.label, "ko-KR")),
      assemblyVendors: uniqueNormalizedValues(
        (projectResult.data ?? []).map((project) => project.assembly_vendor as string | null)
      ),
    },
    error: [employeeResult.error?.message, projectResult.error?.message].filter(Boolean).join("; ") || null,
  };
}
