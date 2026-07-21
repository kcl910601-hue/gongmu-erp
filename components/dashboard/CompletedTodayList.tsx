import type { DashboardFocusTask } from "@/components/dashboard/TodayTaskList";

export function CompletedTodayList({
  tasks,
  showAssignee,
  onOpenTask,
}: {
  tasks: DashboardFocusTask[];
  showAssignee: boolean;
  onOpenTask: (task: DashboardFocusTask) => void;
}) {
  if (tasks.length === 0) return null;

  return (
    <details className="mt-4 rounded-xl border border-slate-100 bg-slate-50">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
        오늘 완료한 업무 {tasks.length}건
      </summary>
      <div className="divide-y divide-slate-100 border-t border-slate-100 px-4">
        {tasks.slice(0, 10).map((task) => (
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
            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg py-2.5 hover:bg-white"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-700">
                {task.task_name || "업무명 없음"}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                {task.projectName} · {task.completed_date || "-"}
                {showAssignee ? ` · ${task.assignee || "미배정"}` : ""}
              </p>
            </div>
            <span className="shrink-0 text-xs text-blue-600">상세 보기</span>
          </div>
        ))}
      </div>
    </details>
  );
}
