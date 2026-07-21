import { isTaskCompleted } from "@/lib/status";

export type PrioritizableTask = {
  id: number;
  project_id: number;
  project_section_id?: number | null;
  task_name: string | null;
  task_type: string | null;
  assignee: string | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
  created_at: string | null;
};

export type TaskPriorityLevel =
  | "overdue"
  | "due_today"
  | "start_today"
  | "due_tomorrow"
  | "normal";

export type TaskPriority = {
  level: TaskPriorityLevel;
  rank: number;
  label: string;
};

export function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addLocalDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const nextDate = new Date(year, month - 1, day);
  nextDate.setDate(nextDate.getDate() + days);
  return getLocalDateString(nextDate);
}

export function getTaskPriority(
  task: PrioritizableTask,
  today: string
): TaskPriority {
  if (
    !isTaskCompleted(task.status) &&
    task.due_date !== null &&
    task.due_date < today
  ) {
    return { level: "overdue", rank: 1, label: "지연" };
  }
  if (!isTaskCompleted(task.status) && task.due_date === today) {
    return { level: "due_today", rank: 2, label: "오늘 마감" };
  }
  if (!isTaskCompleted(task.status) && task.start_date === today) {
    return { level: "start_today", rank: 3, label: "오늘 시작" };
  }
  if (
    !isTaskCompleted(task.status) &&
    task.due_date === addLocalDays(today, 1)
  ) {
    return { level: "due_tomorrow", rank: 4, label: "내일 마감" };
  }
  return { level: "normal", rank: 5, label: "일반" };
}

export function sortTasksByPriority<T extends PrioritizableTask>(
  tasks: T[],
  today: string
) {
  return [...tasks].sort((left, right) => {
    const rankDifference =
      getTaskPriority(left, today).rank - getTaskPriority(right, today).rank;
    if (rankDifference !== 0) return rankDifference;

    const dueDateDifference = (left.due_date || "9999-12-31").localeCompare(
      right.due_date || "9999-12-31"
    );
    if (dueDateDifference !== 0) return dueDateDifference;

    return (left.created_at || "").localeCompare(right.created_at || "");
  });
}

export function isMorningBriefTask(task: PrioritizableTask, today: string) {
  return (
    (!isTaskCompleted(task.status) &&
      (task.due_date === today ||
        (task.due_date !== null && task.due_date < today) ||
        task.start_date === today)) ||
    (isTaskCompleted(task.status) && task.completed_date === today)
  );
}
