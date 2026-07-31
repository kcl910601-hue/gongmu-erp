import { supabase } from "@/lib/supabase";
import type { PartnerType } from "@/lib/partners";

export type EmployeeMasterOption = {
  id: number;
  value: string;
  label: string;
};

export type EmployeeOrganizationFunction = "sales" | "operations";

export type EmployeeOrganizationOption = {
  id: number;
  name: string;
};

async function getActiveOrganizationsByCategory(
  categoryCode: "headquarters" | "partner",
  partnerType?: PartnerType
): Promise<{
  data: EmployeeOrganizationOption[];
  error: string | null;
}> {
  const categoryResult = await supabase
    .from("organization_categories")
    .select("id")
    .eq("code", categoryCode)
    .maybeSingle();

  if (categoryResult.error || !categoryResult.data) {
    return { data: [], error: categoryResult.error?.message ?? "조직 카테고리를 찾을 수 없습니다." };
  }

  let organizationQuery = supabase
    .from("organizations")
    .select("id, name")
    .eq("category_id", categoryResult.data.id)
    .eq("is_active", true);
  if (partnerType) organizationQuery = organizationQuery.eq("partner_type", partnerType);
  const organizationResult = await organizationQuery
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return {
    data: (organizationResult.data ?? []).map((organization) => ({
      id: Number(organization.id),
      name: String(organization.name),
    })),
    error: organizationResult.error?.message ?? null,
  };
}

export async function getEmployeeOrganizations() {
  const result = await getActiveOrganizationsByCategory("headquarters");
  return {
    ...result,
    data: [...result.data].sort((left, right) =>
      left.name.localeCompare(right.name, "ko-KR", {
        numeric: true,
        sensitivity: "base",
      })
    ),
  };
}

export function getPartnerOrganizations(partnerType: PartnerType = "assembly") {
  return getActiveOrganizationsByCategory("partner", partnerType);
}

export async function getActiveEmployeeOptionsByFunction(
  functionCode: EmployeeOrganizationFunction
): Promise<{ data: EmployeeMasterOption[]; error: string | null }> {
  const headquartersResult = await getEmployeeOrganizations();
  if (headquartersResult.error) return { data: [], error: headquartersResult.error };
  if (headquartersResult.data.length === 0) return { data: [], error: null };

  const organizationResult = await supabase
    .from("organizations")
    .select("id")
    .in("id", headquartersResult.data.map((organization) => organization.id))
    .eq("function_code", functionCode)
    .eq("is_active", true);

  if (organizationResult.error) {
    return { data: [], error: organizationResult.error.message };
  }

  const organizationIds = (organizationResult.data ?? []).map((row) => Number(row.id));
  if (organizationIds.length === 0) return { data: [], error: null };

  const employeeResult = await supabase
    .from("employees")
    .select("id, name, position")
    .eq("active", true)
    .eq("approval_status", "approved")
    .in("organization_id", organizationIds)
    .order("name", { ascending: true });

  if (employeeResult.error) {
    return { data: [], error: employeeResult.error.message };
  }

  return {
    data: (employeeResult.data ?? []).map((employee) => ({
      id: Number(employee.id),
      value: String(employee.name),
      label: [employee.position ? String(employee.position).trim() : "", String(employee.name)]
        .filter(Boolean)
        .join(" "),
    })),
    error: null,
  };
}
