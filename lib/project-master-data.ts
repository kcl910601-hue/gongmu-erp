import {
  getActiveEmployeeOptionsByFunction,
  getPartnerOrganizations,
} from "@/lib/employee-master-data";

export type ProjectEntryOptions = {
  salespeople: Array<{ value: string; label: string }>;
  taskManagers: Array<{ id: number; value: string; label: string }>;
  assemblyVendors: Array<{ id: number; name: string }>;
};

export async function getProjectEntryOptions(): Promise<{
  data: ProjectEntryOptions;
  error: string | null;
}> {
  const [salesResult, operationsResult, partnerOrganizationResult] = await Promise.all([
    getActiveEmployeeOptionsByFunction("sales"),
    getActiveEmployeeOptionsByFunction("operations"),
    getPartnerOrganizations(),
  ]);

  return {
    data: {
      salespeople: salesResult.data.map(({ value, label }) => ({ value, label })),
      taskManagers: operationsResult.data,
      assemblyVendors: partnerOrganizationResult.data.map((organization) => ({
        id: Number(organization.id),
        name: String(organization.name),
      })),
    },
    error: [salesResult.error, operationsResult.error, partnerOrganizationResult.error]
      .filter(Boolean)
      .join("; ") || null,
  };
}
