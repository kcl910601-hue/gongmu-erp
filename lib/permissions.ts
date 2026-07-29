export const ERP_ROLES = ["admin", "manager", "staff", "viewer"] as const;
export type ErpRole = (typeof ERP_ROLES)[number];
export type PermissionAction =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "project_create"
  | "project_update"
  | "project_delete"
  | "task_update"
  | "manage_employees"
  | "manage_settings";

export function normalizeRole(role: string | null | undefined): ErpRole {
  if (role === "admin" || role === "manager" || role === "viewer") return role;
  if (role === "staff") return role;
  return "viewer";
}

const actionPermissions: Record<ErpRole, ReadonlySet<PermissionAction>> = {
  admin: new Set(["read", "create", "update", "delete", "project_create", "project_update", "project_delete", "task_update", "manage_employees", "manage_settings"]),
  manager: new Set(["read", "create", "update", "project_create", "project_update", "task_update", "manage_settings"]),
  staff: new Set(["read", "create", "update", "task_update"]),
  viewer: new Set(["read"]),
};

export function hasPermission(role: string | null | undefined, action: PermissionAction) {
  return actionPermissions[normalizeRole(role)].has(action);
}

export type EmployeeAuthorizationState = {
  active: boolean | null;
  approval_status: string | null;
};

export type EmployeeAuthorizationStatus =
  | "approved"
  | "inactive"
  | "pending"
  | "rejected"
  | "missing_employee";

export function getEmployeeAuthorizationStatus(
  employee: EmployeeAuthorizationState | null | undefined
): EmployeeAuthorizationStatus {
  if (!employee) return "missing_employee";
  if (employee.approval_status === "rejected") return "rejected";
  if (employee.approval_status !== "approved") return "pending";
  if (employee.active !== true) return "inactive";
  return "approved";
}

export function isAuthorizedEmployee(
  employee: EmployeeAuthorizationState | null | undefined
) {
  return getEmployeeAuthorizationStatus(employee) === "approved";
}

export function canAccessRoute(role: string | null | undefined, pathname: string) {
  if (pathname === "/forbidden") return true;
  if (pathname === "/employees" || pathname.startsWith("/settings/employees")) {
    return hasPermission(role, "manage_employees");
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return hasPermission(role, "manage_settings");
  }
  return hasPermission(role, "read");
}

export const ROLE_PRESENTATION: Record<ErpRole, {
  label: string;
  badge: "danger" | "info" | "success" | "default";
}> = {
  admin: { label: "Admin", badge: "danger" },
  manager: { label: "Manager", badge: "info" },
  staff: { label: "Staff", badge: "success" },
  viewer: { label: "Viewer", badge: "default" },
};
