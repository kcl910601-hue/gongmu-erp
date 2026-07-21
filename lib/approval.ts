export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const EMPLOYEE_ROLES = [
  "admin",
  "manager",
  "member",
  "sales",
  "viewer",
] as const;
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

export const EMPLOYEE_ROLE_LABELS: Record<EmployeeRole, string> = {
  admin: "관리자",
  manager: "매니저",
  member: "업무담당자",
  sales: "영업",
  viewer: "조회전용",
};

export function isEmployeeRole(value: unknown): value is EmployeeRole {
  return (
    typeof value === "string" &&
    EMPLOYEE_ROLES.some((role) => role === value)
  );
}
