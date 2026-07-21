export const TASKS_BULK_CHANGED_EVENT = "tasks:bulk-changed";

export type BulkFailure = {
  taskId: number;
  taskName: string;
  reason: string;
};

export function getErrorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

export function notifyTasksBulkChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TASKS_BULK_CHANGED_EVENT));
}
