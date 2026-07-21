"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Truck,
} from "lucide-react";
import { CompletedTodayList } from "@/components/dashboard/CompletedTodayList";
import {
  TodayTaskList,
  type DashboardFocusTask,
} from "@/components/dashboard/TodayTaskList";
import { Skeleton } from "@/components/ui/Skeleton";
import { completeTask } from "@/lib/task-actions";
import {
  getLocalDateString,
  isMorningBriefTask,
  sortTasksByPriority,
} from "@/lib/task-priority";
import { isTaskCompleted } from "@/lib/status";
import { toast } from "@/lib/toast";
import { openTaskDetail } from "@/lib/task-detail";

const EXPANDED_KEY = "erp-morning-brief-expanded";

export type MorningBriefShipment = {
  id: number;
  project_id: number | null;
  site_name: string;
  item_name: string;
  shipment_date: string | null;
  status: string | null;
};

function getGreeting(hour: number | null) {
  if (hour === null) return "안녕하세요.";
  if (hour >= 5 && hour < 12) return "좋은 아침입니다.";
  if (hour >= 12 && hour < 18) return "좋은 오후입니다.";
  return "좋은 저녁입니다.";
}

export function MorningBrief({
  tasks,
  shipments,
  currentUserName,
  currentUserRole,
  isLoading,
  onTaskCompleted,
}: {
  tasks: DashboardFocusTask[];
  shipments: MorningBriefShipment[];
  currentUserName: string;
  currentUserRole: string;
  isLoading: boolean;
  onTaskCompleted: (taskId: number) => void;
}) {
  const [hour, setHour] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [adminScope, setAdminScope] = useState<"all" | "mine">("all");
  const [completingTaskId, setCompletingTaskId] = useState<number | null>(null);
  const today = getLocalDateString();
  const isAdmin = currentUserRole === "admin";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHour(new Date().getHours());
      const storedValue = window.localStorage.getItem(EXPANDED_KEY);
      if (storedValue !== null) setIsExpanded(storedValue === "true");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const scopedTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (!isAdmin || adminScope === "all" || task.assignee === currentUserName) &&
          (isAdmin || task.assignee === currentUserName)
      ),
    [adminScope, currentUserName, isAdmin, tasks]
  );
  const briefTasks = useMemo(
    () => scopedTasks.filter((task) => isMorningBriefTask(task, today)),
    [scopedTasks, today]
  );
  const openTasks = useMemo(
    () =>
      sortTasksByPriority(
        scopedTasks.filter((task) => !isTaskCompleted(task.status)),
        today
      ).slice(0, 5),
    [scopedTasks, today]
  );
  const completedToday = briefTasks.filter(
    (task) =>
      isTaskCompleted(task.status) && task.completed_date === today
  );
  const dueToday = briefTasks.filter(
    (task) => !isTaskCompleted(task.status) && task.due_date === today
  );
  const overdue = briefTasks.filter(
    (task) =>
      !isTaskCompleted(task.status) &&
      task.due_date !== null &&
      task.due_date < today
  );
  const todayShipments = shipments.filter(
    (shipment) => shipment.shipment_date === today
  );

  async function handleComplete(task: DashboardFocusTask) {
    if (completingTaskId !== null) return;
    setCompletingTaskId(task.id);
    try {
      await completeTask(task);
      onTaskCompleted(task.id);
      toast.success("업무가 완료되었습니다.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "업무 완료 처리에 실패했습니다."
      );
    } finally {
      setCompletingTaskId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Skeleton className="h-7 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-52" />
      </div>
    );
  }

  const summary = [
    {
      label: "오늘 해야 할 업무",
      value: briefTasks.length,
      href: "/tasks?filter=today",
      icon: CalendarCheck,
      color: "text-blue-600",
    },
    {
      label: "오늘 마감",
      value: dueToday.length,
      href: "/tasks?filter=today",
      icon: Clock3,
      color: "text-amber-600",
    },
    {
      label: "지연 업무",
      value: overdue.length,
      href: "/tasks?status=delayed",
      icon: Clock3,
      color: "text-red-600",
    },
    {
      label: "오늘 완료",
      value: completedToday.length,
      href: "/tasks?filter=completed_today",
      icon: CheckCircle2,
      color: "text-emerald-600",
    },
    {
      label: "오늘 출고 예정",
      value: todayShipments.length,
      href: "/shipments?filter=today",
      icon: Truck,
      color: "text-orange-600",
    },
  ];

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            Morning Brief
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">
            {getGreeting(hour)} {currentUserName || "사용자"}님
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isExpanded && (
            <p className="text-xs font-medium text-slate-500">
              오늘 {briefTasks.length} · 마감 {dueToday.length} · 지연{" "}
              {overdue.length}
            </p>
          )}
          {isAdmin && (
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs">
            {(["all", "mine"] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setAdminScope(scope)}
                className={`rounded-lg px-3 py-1.5 font-medium ${
                  adminScope === scope
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                {scope === "all" ? "전체 업무" : "내 업무"}
              </button>
            ))}
          </div>
          )}
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-controls="morning-brief-content"
            aria-label={isExpanded ? "업무 브리핑 접기" : "업무 브리핑 펼치기"}
            onClick={() => {
              const nextValue = !isExpanded;
              setIsExpanded(nextValue);
              window.localStorage.setItem(EXPANDED_KEY, String(nextValue));
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus:ring-2 focus:ring-blue-100"
          >
            {isExpanded ? (
              <>
                접기 <ChevronUp size={14} />
              </>
            ) : (
              <>
                펼치기 <ChevronDown size={14} />
              </>
            )}
          </button>
        </div>
      </div>

      <div
        id="morning-brief-content"
        aria-hidden={!isExpanded}
        inert={!isExpanded}
        className={`grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none ${
          isExpanded
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        }`}
      >
      <div className="overflow-hidden">
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summary.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className="rounded-xl border border-slate-100 bg-slate-50 p-3 hover:border-blue-200 hover:bg-white"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">{item.label}</p>
                <Icon size={15} className={item.color} />
              </div>
              <p className={`mt-2 text-2xl font-bold ${item.color}`}>
                {item.value}
              </p>
            </Link>
          );
        })}
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            우선 처리 업무
          </h3>
          <span className="text-xs text-slate-400">최대 5건</span>
        </div>
        <TodayTaskList
          tasks={openTasks}
          today={today}
          showAssignee={isAdmin && adminScope === "all"}
          completingTaskId={completingTaskId}
          onComplete={(task) => void handleComplete(task)}
          onOpenTask={(task) => openTaskDetail(task.id)}
        />
        <CompletedTodayList
          tasks={completedToday}
          showAssignee={isAdmin && adminScope === "all"}
          onOpenTask={(task) => openTaskDetail(task.id)}
        />
      </div>
      </div>
      </div>
    </section>
  );
}
