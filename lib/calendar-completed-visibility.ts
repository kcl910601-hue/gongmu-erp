import { isTaskCompleted } from "./status.ts";

export type CalendarCompanyItemKind = "project" | "task";

export function getCalendarProjectScheduleDate(completionDueDate: string | null | undefined) {
  return completionDueDate?.trim() || null;
}

export function isCalendarCompanyItemCompleted(kind: CalendarCompanyItemKind, status: string | null) {
  return kind === "task" && isTaskCompleted(status);
}

export function matchesCalendarCompletedVisibility(kind: CalendarCompanyItemKind, status: string | null, showCompleted: boolean) {
  return kind === "project" || showCompleted || !isCalendarCompanyItemCompleted(kind, status);
}

export function matchesCalendarPersonalCompletedVisibility(isCompleted: boolean, showCompleted: boolean) {
  return showCompleted || !isCompleted;
}
