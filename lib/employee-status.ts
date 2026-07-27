import type { BadgeVariant } from "@/components/ui/Badge";

export type EmployeeApprovalStatus = "pending" | "approved" | "rejected" | null;

export function getEmployeeActiveBadge(active: boolean): {
  label: "활성" | "비활성";
  variant: BadgeVariant;
} {
  return active
    ? { label: "활성", variant: "success" }
    : { label: "비활성", variant: "default" };
}

export function getEmployeeAccountBadge(authUserId: string | null): {
  label: "연결" | "미연결";
  variant: BadgeVariant;
} {
  return authUserId
    ? { label: "연결", variant: "success" }
    : { label: "미연결", variant: "default" };
}

export function getEmployeeApprovalBadge(status: EmployeeApprovalStatus): {
  label: "승인대기" | "승인" | "반려";
  variant: BadgeVariant;
} {
  if (status === "approved") return { label: "승인", variant: "success" };
  if (status === "rejected") return { label: "반려", variant: "danger" };
  return { label: "승인대기", variant: "warning" };
}
