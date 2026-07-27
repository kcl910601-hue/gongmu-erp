import { supabase } from "@/lib/supabase";
import type { ProjectAssemblyVendor } from "@/types/project-section";

type RelationRow = {
  id: number;
  organization_id: number;
  sort_order: number;
  is_primary: boolean;
  allocated_quantity: number | null;
  organization: unknown;
};

function getOrganizationName(value: unknown) {
  const organization = Array.isArray(value) ? value[0] : value;
  if (!organization || typeof organization !== "object" || !("name" in organization)) return null;
  return typeof organization.name === "string" ? organization.name : null;
}

export async function getProjectAssemblyVendors(projectId: number) {
  const { data, error } = await supabase
    .from("project_assembly_vendors")
    .select("id, organization_id, sort_order, is_primary, allocated_quantity, organization:organizations(name)")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) return { data: [] as ProjectAssemblyVendor[], error };

  return {
    data: ((data ?? []) as RelationRow[]).flatMap((row) => {
      const organizationName = getOrganizationName(row.organization);
      return organizationName ? [{
        id: Number(row.id),
        organizationId: Number(row.organization_id),
        organizationName,
        isPrimary: Boolean(row.is_primary),
        sortOrder: Number(row.sort_order),
        allocatedQuantity: row.allocated_quantity === null ? null : Number(row.allocated_quantity),
      }] : [];
    }),
    error: null,
  };
}

export async function updateProjectAssemblyVendorQuantity(
  relationId: number,
  allocatedQuantity: number | null
) {
  return supabase.rpc("set_project_assembly_vendor_quantity", {
    p_relation_id: relationId,
    p_allocated_quantity: allocatedQuantity,
  });
}

export async function updateProjectWithVendors(
  projectId: number,
  project: Record<string, unknown>,
  assemblyVendorIds: number[]
) {
  return supabase.rpc("update_project_with_vendors", {
    p_project_id: projectId,
    p_project: project,
    p_assembly_vendor_ids: assemblyVendorIds,
  });
}
