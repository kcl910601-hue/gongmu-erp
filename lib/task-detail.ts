export const TASK_DETAIL_OPEN_EVENT = "task-detail:open";
export const TASK_DETAIL_UPDATED_EVENT = "task-detail:updated";

export function openTaskDetail(taskId: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TASK_DETAIL_OPEN_EVENT, {
      detail: { taskId },
    })
  );
}
