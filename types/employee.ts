import type { EmployeeApprovalStatus } from "@/lib/employee-status";

export type Employee = {
  id: string;
  name: string;
  email: string | null;
  auth_user_id: string | null;
  organization_id: number | null;
  position: string | null;
  role: string | null;
  phone: string | null;
  memo: string | null;
  updated_at: string | null;
  active: boolean;
  approval_status: EmployeeApprovalStatus;
};

export type EmployeeOrganizationOption = { id: number; name: string };

export type EmployeeAccountInfo = {
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
};
