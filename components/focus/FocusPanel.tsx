"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Target, X } from "lucide-react";
import { FocusTaskCard, type FocusTask } from "@/components/focus/FocusTaskCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { getCurrentEmployee, isAdmin, type CurrentEmployee } from "@/lib/auth";
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
  const [isOpen, setIsOpen] = useState(false);
  const [tasks, setTasks] = useState<FocusTask[]>([]);
  const [employee, setEmployee] = useState<CurrentEmployee | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState("mine");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const today = getLocalDateString();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const currentEmployee = await getCurrentEmployee();
      setEmployee(currentEmployee);
      if (!window.localStorage.getItem(FILTER_KEY)) {
        setAssigneeFilter(isAdmin(currentEmployee) ? "all" : "mine");
      }

      const [{ data: taskData, error: taskError }, { data: projectData, error: projectError }] =
        await Promise.all([
          supabase
            .from("tasks")
            .select(
              "id, project_id, task_name, task_type, assignee, status, start_date, due_date, completed_date, created_at"
            ),
          supabase.from("projects").select("id, project_name"),
        ]);
      if (taskError) throw taskError;
      if (projectError) throw projectError;

      const projectsById = new Map(
        (projectData ?? []).map((project) => [project.id, project.project_name])
      );
      setTasks(
        ((taskData ?? []) as PrioritizableTask[]).map((task) => ({
          ...task,
          projectName:
            projectsById.get(task.project_id) || `프로젝트 #${task.project_id}`,
        }))
      );

      if (isAdmin(currentEmployee)) {
        const { data: employeeData, error: employeeError } = await supabase
          .from("employees")
          .select("id, name, active")
          .eq("active", true)
          .order("name");
        if (employeeError) throw employeeError;
        setEmployees(employeeData ?? []);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "집중 업무를 불러오지 못했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsOpen(window.localStorage.getItem(OPEN_KEY) === "true");
      const storedTaskId = Number(window.localStorage.getItem(TASK_KEY));
      setSelectedTaskId(Number.isFinite(storedTaskId) && storedTaskId > 0 ? storedTaskId : null);
      setAssigneeFilter(window.localStorage.getItem(FILTER_KEY) || "mine");
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    function refreshAfterBulkChange() {
      void loadData();
    }
    window.addEventListener(TASKS_BULK_CHANGED_EVENT, refreshAfterBulkChange);
    return () =>
      window.removeEventListener(
        TASKS_BULK_CHANGED_EVENT,
        refreshAfterBulkChange
      );
  }, [loadData]);

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
