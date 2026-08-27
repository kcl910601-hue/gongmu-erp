import { isTaskCompleted } from "./status.ts";

export const CALENDAR_TASK_REOPEN_STATUS = "in_progress";

export type CalendarTaskQuickStatus = {
  status: string | null;
  completed_date: string | null;
};

export function getCalendarTaskQuickAction(status: string | null, canEdit: boolean) {
  if (!canEdit) return null;
  return isTaskCompleted(status)
    ? { label: "완료취소", nextStatus: CALENDAR_TASK_REOPEN_STATUS }
    : { label: "완료", nextStatus: "completed" };
}

export function applyCalendarTaskQuickStatus<T extends CalendarTaskQuickStatus>(task: T, nextStatus: string, today: string): T {
  return {
    ...task,
    status: nextStatus,
    completed_date: isTaskCompleted(nextStatus) ? today : null,
  };
}

export function restoreCalendarTaskQuickStatus<T extends CalendarTaskQuickStatus>(task: T, previous: CalendarTaskQuickStatus): T {
  return { ...task, ...previous };
}
