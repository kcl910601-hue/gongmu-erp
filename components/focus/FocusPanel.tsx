"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Target, X } from "lucide-react";
import { FocusTaskCard, type FocusTask } from "@/components/focus/FocusTaskCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { isAdmin } from "@/lib/auth";
import { useAppShellUser } from "@/contexts/AppShellUserContext";
import { getActiveEmployeeOptionsByFunction } from "@/lib/employee-master-data";
import { completeTask } from "@/lib/task-actions";
import {
  getLocalDateString,
  sortTasksByPriority,
  type PrioritizableTask,
} from "@/lib/task-priority";
import { isTaskCompleted } from "@/lib/status";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { openTaskDetail, TASK_DETAIL_UPDATED_EVENT } from "@/lib/task-detail";
import { TASKS_BULK_CHANGED_EVENT } from "@/lib/bulk-utils";

const OPEN_KEY = "erp-focus-panel-open";
const TASK_KEY = "erp-focus-task-id";
const FILTER_KEY = "erp-focus-assignee-filter";

type EmployeeOption = {
  id: number;
  name: string;
  active: boolean | null;
};

export function FocusPanel() {
  const { employee } = useAppShellUser();
  const [isOpen, setIsOpen] = useState(false);
  const [tasks, setTasks] = useState<FocusTask[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState("mine");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const today = getLocalDateString();
  const requestInFlightRef = useRef(false);
  const hasLoadedRef = useRef(false);

  const loadData = useCallback(async () => {
    if (!employee || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setIsLoading(true);
    setErrorMessage("");
    try {
      if (!window.localStorage.getItem(FILTER_KEY)) {
        setAssigneeFilter(isAdmin(employee) ? "all" : "mine");
      }

      let taskQuery = supabase
        .from("tasks")
        .select(
          "id, project_id, task_name, task_type, assignee, status, start_date, due_date, completed_date, created_at"
        )
        .or("status.is.null,status.in.(pending,대기,in_progress,진행중)")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(200);
      if (!isAdmin(employee)) {
        taskQuery = taskQuery.eq("assignee", employee.name);
      }
      const { data: taskData, error: taskError } = await taskQuery;
      if (taskError) throw taskError;

      const projectIds = Array.from(
        new Set((taskData ?? []).map((task) => task.project_id))
      );
      const [projectResult, employeeResult] = await Promise.all([
        projectIds.length
          ? supabase
              .from("projects")
              .select("id, project_name")
              .in("id", projectIds)
          : Promise.resolve({ data: [], error: null }),
        isAdmin(employee)
          ? getActiveEmployeeOptionsByFunction("operations")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (projectResult.error) throw projectResult.error;
      if (employeeResult.error) throw employeeResult.error;

      const projectsById = new Map(
        (projectResult.data ?? []).map((project) => [project.id, project.project_name])
      );
      setTasks(
        ((taskData ?? []) as PrioritizableTask[]).map((task) => ({
          ...task,
          projectName:
            projectsById.get(task.project_id) || `프로젝트 #${task.project_id}`,
        }))
      );

      if (isAdmin(employee)) {
        setEmployees(employeeResult.data.map((option) => ({ id: option.id, name: option.value, active: true })));
      }
      hasLoadedRef.current = true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "집중 업무를 불러오지 못했습니다."
      );
    } finally {
      setIsLoading(false);
      requestInFlightRef.current = false;
    }
  }, [employee]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsOpen(window.localStorage.getItem(OPEN_KEY) === "true");
      const storedTaskId = Number(window.localStorage.getItem(TASK_KEY));
      setSelectedTaskId(Number.isFinite(storedTaskId) && storedTaskId > 0 ? storedTaskId : null);
      setAssigneeFilter(window.localStorage.getItem(FILTER_KEY) || "mine");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    if (isOpen && !hasLoadedRef.current) void loadData();
  }, [isOpen, loadData]);

  useEffect(() => {
    function refreshAfterBulkChange() {
      hasLoadedRef.current = false;
      if (isOpen) void loadData();
    }
    window.addEventListener(TASKS_BULK_CHANGED_EVENT, refreshAfterBulkChange);
    return () =>
      window.removeEventListener(
        TASKS_BULK_CHANGED_EVENT,
        refreshAfterBulkChange
      );
  }, [isOpen, loadData]);

  useEffect(() => {
    function togglePanel() {
      setIsOpen((current) => !current);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("focus-panel:toggle", togglePanel);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("focus-panel:toggle", togglePanel);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    function handleTaskUpdated(event: Event) {
      const updatedTask = (
        event as CustomEvent<{ task: FocusTask }>
      ).detail.task;
      setTasks((current) =>
        current.map((task) =>
          task.id === updatedTask.id ? { ...task, ...updatedTask } : task
        )
      );
    }
    window.addEventListener(TASK_DETAIL_UPDATED_EVENT, handleTaskUpdated);
    return () =>
      window.removeEventListener(
        TASK_DETAIL_UPDATED_EVENT,
        handleTaskUpdated
      );
  }, []);

  const focusTasks = useMemo(() => {
    const openTasks = tasks.filter((task) => !isTaskCompleted(task.status));
    const scopedTasks = isAdmin(employee)
      ? assigneeFilter === "all"
        ? openTasks
        : assigneeFilter === "mine"
          ? openTasks.filter((task) => task.assignee === employee?.name)
          : openTasks.filter((task) => task.assignee === assigneeFilter)
      : openTasks.filter((task) => task.assignee === employee?.name);
    return sortTasksByPriority(scopedTasks, today).slice(0, 20);
  }, [assigneeFilter, employee, tasks, today]);

  const selectedIndex = Math.max(
    0,
    focusTasks.findIndex((task) => task.id === selectedTaskId)
  );
  const selectedTask = focusTasks[selectedIndex] ?? null;

  useEffect(() => {
    window.localStorage.setItem(OPEN_KEY, String(isOpen));
    window.dispatchEvent(
      new CustomEvent("focus-panel:state", {
        detail: { open: isOpen, count: focusTasks.length },
      })
    );
  }, [focusTasks.length, isOpen]);

  useEffect(() => {
    if (!selectedTask) {
      window.localStorage.removeItem(TASK_KEY);
      return;
    }
    window.localStorage.setItem(TASK_KEY, String(selectedTask.id));
  }, [selectedTask]);

  function selectTaskAt(index: number) {
    const nextTask = focusTasks[index];
    if (nextTask) setSelectedTaskId(nextTask.id);
  }

  async function handleComplete() {
    if (!selectedTask || isCompleting) return;
    setIsCompleting(true);
    try {
      await completeTask(selectedTask);
      setTasks((current) =>
        current.map((task) =>
          task.id === selectedTask.id
            ? { ...task, status: "completed", completed_date: today }
            : task
        )
      );
      toast.success("업무가 완료되었습니다.");
      window.dispatchEvent(
        new CustomEvent("dashboard:task-completed", {
          detail: { taskId: selectedTask.id },
        })
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "업무 완료 처리에 실패했습니다."
      );
    } finally {
      setIsCompleting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <button
        type="button"
        aria-label="집중 업무 패널 닫기"
        className="fixed inset-0 z-[80] bg-slate-950/20 lg:hidden"
        onClick={() => setIsOpen(false)}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="집중 업무"
        className="fixed inset-x-0 bottom-0 z-[90] max-h-[85vh] overflow-y-auto rounded-t-3xl border border-slate-200 bg-slate-50 p-4 shadow-2xl lg:inset-y-[73px] lg:left-auto lg:right-0 lg:w-[390px] lg:max-h-none lg:rounded-none lg:border-y-0 lg:border-r-0"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-blue-600" />
            <h2 className="font-bold text-slate-950">집중 업무</h2>
            <span className="text-xs text-slate-400">{focusTasks.length}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="집중 업무 패널 닫기"
            className="rounded-xl p-2 text-slate-500 hover:bg-white"
          >
            <X size={18} />
          </button>
        </div>

        {isAdmin(employee) && (
          <select
            value={assigneeFilter}
            onChange={(event) => {
              const value = event.target.value;
              setAssigneeFilter(value);
              setSelectedTaskId(null);
              window.localStorage.setItem(FILTER_KEY, value);
            }}
            aria-label="집중 업무 담당자 필터"
            className="mt-4 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="mine">내 업무</option>
            <option value="all">전체</option>
            {employees.map((option) => (
              <option key={option.id} value={option.name}>
                {option.name}
              </option>
            ))}
          </select>
        )}

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-72" />
              <Skeleton className="h-10" />
            </div>
          ) : errorMessage ? (
            <ErrorState message={errorMessage} onRetry={() => void loadData()} />
          ) : selectedTask ? (
            <>
              <FocusTaskCard
                task={selectedTask}
                today={today}
                position={selectedIndex + 1}
                total={focusTasks.length}
                isCompleting={isCompleting}
                onComplete={() => void handleComplete()}
                onOpen={() => openTaskDetail(selectedTask.id)}
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => selectTaskAt(selectedIndex - 1)}
                  disabled={selectedIndex <= 0}
                >
                  <ChevronLeft size={16} />
                  이전 업무
                </Button>
                <Button
                  variant="outline"
                  onClick={() => selectTaskAt(selectedIndex + 1)}
                  disabled={selectedIndex >= focusTasks.length - 1}
                >
                  다음 업무
                  <ChevronRight size={16} />
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              title="집중할 업무가 없습니다."
              action={
                <a href="/tasks">
                  <Button size="sm" variant="outline">
                    업무 목록 보기
                  </Button>
                </a>
              }
            />
          )}
        </div>
      </aside>
    </>
  );
}
