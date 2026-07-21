"use client";

import Link from "next/link";
import { CircleCheck, ListTodo } from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getTaskPriority,
  type PrioritizableTask,
} from "@/lib/task-priority";
import { getTaskStatusLabel } from "@/lib/status";

export type DashboardFocusTask = PrioritizableTask & {
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

export function TodayTaskList({
  tasks,
  today,
  showAssignee,
  completingTaskId,
  onComplete,
  onOpenTask,
}: {
  tasks: DashboardFocusTask[];
  today: string;
  showAssignee: boolean;
  completingTaskId: number | null;
  onComplete: (task: DashboardFocusTask) => void;
  onOpenTask: (task: DashboardFocusTask) => void;
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        title="오늘 처리할 업무가 없습니다."
        message="모든 업무를 확인할 수 있습니다."
        icon={<ListTodo size={26} />}
        action={
          <Link href="/tasks">
            <Button size="sm" variant="outline">
              전체 업무 보기
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {tasks.map((task) => {
        const priority = getTaskPriority(task, today);
        return (
          <div
            key={task.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenTask(task)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenTask(task);
              }
            }}
            className="grid cursor-pointer gap-3 rounded-xl py-3 transition-colors hover:bg-slate-50 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
          >
            <button
              type="button"
              disabled={completingTaskId !== null}
              onClick={(event) => {
                event.stopPropagation();
                onComplete(task);
              }}
              aria-label={`${task.task_name || "업무"} 완료 처리`}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40"
            >
              <CircleCheck size={17} />
            </button>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-xs font-medium text-blue-600">
                  {task.projectName}
                </span>
                <Badge variant={priorityVariant[priority.level]}>
                  {priority.label}
                </Badge>
                <Badge variant="default">
                  {getTaskStatusLabel(task.status)}
                </Badge>
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                {task.task_name || "업무명 없음"}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                시작 {task.start_date || "-"} · 마감 {task.due_date || "-"}
                {showAssignee ? ` · ${task.assignee || "미배정"}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenTask(task);
              }}
              className="text-xs font-medium text-slate-500 hover:text-blue-600"
            >
              업무 보기
            </button>
          </div>
        );
      })}
    </div>
  );
}
