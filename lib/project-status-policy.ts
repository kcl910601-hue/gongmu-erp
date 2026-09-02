import { normalizeProjectStatus } from "./status.ts";

export const PROJECT_STATUS_OPTIONS = [
  { value: "pending", label: "대기" },
  { value: "in_progress", label: "진행중" },
  { value: "hold", label: "보류" },
  { value: "completed", label: "완료" },
] as const;

export type CanonicalProjectStatus = (typeof PROJECT_STATUS_OPTIONS)[number]["value"];

export function isCanonicalProjectStatus(value: string | null): value is CanonicalProjectStatus {
  return PROJECT_STATUS_OPTIONS.some((option) => option.value === value);
}

export function getProjectStatusSelectValue(status: string | null): CanonicalProjectStatus | "" {
  const normalized = normalizeProjectStatus(status);
  return isCanonicalProjectStatus(normalized) ? normalized : "";
}
