export type ReferenceTaskStatus = "pending" | "completed";

export type ReferenceTask = {
  id: string;
  commentId: number | null;
  sharedItemId: string | null;
  status: ReferenceTaskStatus;
  createdAt: string;
  completedAt: string | null;
  source: null | {
    commentId: number;
    content: string;
    authorName: string;
    itemId: string;
    itemTitle: string;
  };
};

export async function addReferenceTask(commentId: number) {
  const response = await fetch("/api/reference-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentId }) });
  const result = await response.json() as { task?: ReferenceTask; created?: boolean; error?: string };
  if (!response.ok || !result.task) throw new Error(result.error ?? "내 할 일에 추가하지 못했습니다.");
  scheduleCollaborationEvents([REFERENCE_TASKS_CHANGED_EVENT], 0);
  return { task: result.task, created: result.created !== false };
}

export function getReferencedCommentIds(tasks: Pick<ReferenceTask, "commentId">[]) {
  return new Set(tasks.flatMap((task) => task.commentId === null ? [] : [task.commentId]));
}

export function isDeletedReferenceSource(task: Pick<ReferenceTask, "source">) {
  return task.source === null;
}
import { REFERENCE_TASKS_CHANGED_EVENT, scheduleCollaborationEvents } from "./collaboration-events.ts";
