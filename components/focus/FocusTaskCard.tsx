"use client";

import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  getTaskPriority,
  type PrioritizableTask,
} from "@/lib/task-priority";
import { getTaskStatusLabel } from "@/lib/status";

export type FocusTask = PrioritizableTask & {
  projectName: string;
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

export function FocusTaskCard({
  task,
  today,
  position,
  total,
  isCompleting,
  onComplete,
  onOpen,
}: {
  task: FocusTask;
  today: string;
  position: number;
  total: number;
  isCompleting: boolean;
  onComplete: () => void;
  onOpen: () => void;
}) {
  const priority = getTaskPriority(task, today);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-blue-200"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-400">
          {position} / {total}
        </span>
        <div className="flex gap-1.5">
          <Badge variant={priorityVariant[priority.level]}>
            {priority.label}
          </Badge>
          <Badge variant="default">{getTaskStatusLabel(task.status)}</Badge>
        </div>
      </div>
      <p className="mt-4 truncate text-xs font-medium text-blue-600">
        {task.projectName}
      </p>
      <h3 className="mt-1 text-lg font-bold leading-7 text-slate-950">
        {task.task_name || "업무명 없음"}
      </h3>
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
        <div>
          <dt className="text-slate-400">담당자</dt>
          <dd className="mt-1 font-medium text-slate-700">
            {task.assignee || "미배정"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">마감일</dt>
          <dd className="mt-1 font-medium text-slate-700">
            {task.due_date || "-"}
          </dd>
        </div>
      </dl>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          onClick={(event) => {
            event.stopPropagation();
            onComplete();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          disabled={isCompleting}
          aria-label={`${task.task_name || "업무"} 완료 처리`}
        >
          {isCompleting ? "처리 중..." : "업무 완료"}
        </Button>
        <Link
          href={`/projects/${task.project_id}`}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={(event) => event.stopPropagation()}
        >
          프로젝트 보기
        </Link>
      </div>
    </article>
  );
}
