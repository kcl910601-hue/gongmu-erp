import { TASK_NOTES_CHANGED_EVENT } from "./collaboration-events.ts";

export { TASK_NOTES_CHANGED_EVENT };

export type TaskNotePreview = {
  id: string;
  taskId: number;
  note: string;
  isImportant: boolean;
  createdAt: string;
  createdByName: string | null;
  checkDate: string | null;
};

export type TaskNoteCheckDateStatus = "none" | "upcoming" | "today" | "overdue";

export function isValidTaskNoteCheckDate(value: string | null) {
  if (value === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function getTaskNoteCheckDateStatus(checkDate: string | null, today: string): TaskNoteCheckDateStatus {
  if (!checkDate) return "none";
  if (checkDate === today) return "today";
  return checkDate < today ? "overdue" : "upcoming";
}

export type TaskScheduleForNoteReminder = { startDate: string | null; endDate: string | null; completed: boolean };

export function isTaskActiveOnDate(task: TaskScheduleForNoteReminder, date: string) {
  const start = task.startDate || task.endDate;
  const end = task.endDate || task.startDate;
  return !task.completed && Boolean(start && end && start <= date && date <= end);
}

export function shouldShowActiveImportantNoteReminder(task: TaskScheduleForNoteReminder, note: Pick<TaskNotePreview, "isImportant" | "checkDate"> | null | undefined, date: string) {
  return Boolean(note?.isImportant && note.checkDate !== date && isTaskActiveOnDate(task, date));
}

export function normalizeTaskNoteImportance(note: string, isImportant: boolean) {
  return note.trim() ? isImportant : false;
}

export function getLatestTaskNotes(notes: TaskNotePreview[]) {
  const latest = new Map<number, TaskNotePreview>();
  for (const note of notes) {
    const current = latest.get(note.taskId);
    if (!current || note.createdAt > current.createdAt) latest.set(note.taskId, note);
  }
  return latest;
}

export function formatTaskNoteForExport(note: Pick<TaskNotePreview, "note" | "isImportant" | "checkDate"> | null | undefined) {
  if (!note?.note.trim()) return "";
  const check = note.checkDate ? `[확인 ${note.checkDate.slice(5).replace("-", "/")}] ` : "";
  return `${note.isImportant ? "[중요]" : ""}${check}${note.note.trim()}`;
}

export function dispatchTaskNotesChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(TASK_NOTES_CHANGED_EVENT));
}
