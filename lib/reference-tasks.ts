import { REFERENCE_TASKS_CHANGED_EVENT, scheduleCollaborationEvents } from "./collaboration-events.ts";

export const REFERENCE_TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type ReferenceTaskPriority = (typeof REFERENCE_TASK_PRIORITIES)[number];
export type ReferenceTaskStatus = "pending" | "completed";

export type ReferenceTask = {
  id: string; commentId: number | null; sharedItemId: string | null;
  title: string; dueDate: string | null; priority: ReferenceTaskPriority;
  status: ReferenceTaskStatus; createdAt: string; completedAt: string | null;
  source: null | { commentId: number; content: string; authorName: string; itemId: string; itemTitle: string };
};

export type ReferenceTaskOptions = { title: string; dueDate: string | null; priority: ReferenceTaskPriority };

export function isReferenceTaskCompleted(task: Pick<ReferenceTask, "status">) { return task.status === "completed"; }

export function normalizeReferenceTaskOptions(value: { title?: unknown; dueDate?: unknown; priority?: unknown }) {
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const dueDate = value.dueDate === null || value.dueDate === "" ? null : typeof value.dueDate === "string" ? value.dueDate : "invalid";
  const priority = typeof value.priority === "string" ? value.priority : "normal";
  if (!title || title.length > 200) return { options: null, error: "제목은 1~200자로 입력해주세요." } as const;
  if (dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { options: null, error: "마감일 형식을 확인해주세요." } as const;
  if (!REFERENCE_TASK_PRIORITIES.includes(priority as ReferenceTaskPriority)) return { options: null, error: "우선순위를 확인해주세요." } as const;
  return { options: { title, dueDate, priority: priority as ReferenceTaskPriority }, error: null } as const;
}

export function getReferenceTaskDueState(dueDate: string | null, today: string) {
  if (!dueDate) return "unspecified" as const;
  if (dueDate < today) return "overdue" as const;
  if (dueDate === today) return "today" as const;
  const diff = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return diff <= 3 ? "soon" as const : "scheduled" as const;
}

export async function addReferenceTask(commentId: number, options: ReferenceTaskOptions) {
  const response = await fetch("/api/reference-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentId, ...options }) });
  const result = await response.json() as { task?: ReferenceTask; created?: boolean; error?: string };
  if (!response.ok || !result.task) throw new Error(result.error ?? "내 할 일에 추가하지 못했습니다.");
  scheduleCollaborationEvents([REFERENCE_TASKS_CHANGED_EVENT], 0);
  return { task: result.task, created: result.created !== false };
}

export function getReferencedCommentIds(tasks: Pick<ReferenceTask, "commentId">[]) { return new Set(tasks.flatMap((task) => task.commentId === null ? [] : [task.commentId])); }
export function isDeletedReferenceSource(task: Pick<ReferenceTask, "source">) { return task.source === null; }
