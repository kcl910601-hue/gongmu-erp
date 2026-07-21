import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import {
  getTaskPriority,
  type PrioritizableTask,
} from "@/lib/task-priority";
import { getTaskStatusLabel, isTaskCompleted } from "@/lib/status";

export type TaskDetailData = PrioritizableTask & {
  task_order: number | null;
  project: {
    id: number;
    project_name: string;
    project_code: string | null;
  } | null;
};

const priorityVariant: Record<
  ReturnType<typeof getTaskPriority>["level"],
  BadgeVariant
> = {
  overdue: "danger",
  due_today: "warning",
  start_today: "info",
  due_tomorrow: "info",
  normal: "default",
};

export function TaskDetailView({
  task,
  today,
}: {
  task: TaskDetailData;
  today: string;
}) {
  const priority = getTaskPriority(task, today);
  const details = [
    ["프로젝트", task.project?.project_name || `프로젝트 #${task.project_id}`],
    ["프로젝트 코드", task.project?.project_code || "-"],
    ["업무 유형", task.task_type || "-"],
    ["담당자", task.assignee || "미배정"],
    ["시작일", task.start_date || "-"],
    ["마감일", task.due_date || "-"],
    ["완료일", task.completed_date || "-"],
    ["업무 순서", task.task_order?.toString() || "-"],
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={priorityVariant[priority.level]}>{priority.label}</Badge>
        <Badge variant={isTaskCompleted(task.status) ? "success" : "default"}>
          {getTaskStatusLabel(task.status)}
        </Badge>
      </div>
      <h2 className="mt-3 text-xl font-bold text-slate-950">
        {task.task_name || "업무명 없음"}
      </h2>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs text-slate-400">{label}</dt>
            <dd className="mt-1 text-sm font-medium text-slate-700">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
