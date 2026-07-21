"use client";

import Link from "next/link";
import { ListTodo } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { isTaskCompleted } from "@/lib/status";
import {
  deleteTask,
  updateTask,
  type TaskUpdatePatch,
} from "@/lib/task-actions";
import { logActivity } from "@/lib/activity";
import {
  openTaskDetail,
  TASK_DETAIL_UPDATED_EVENT,
} from "@/lib/task-detail";
import type { TaskDetailData } from "@/components/tasks/TaskDetailView";
import { TableViewControls } from "@/components/ui/TableViewControls";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import {
  BulkEditToolbar,
  type BulkEditAction,
} from "@/components/tasks/BulkEditToolbar";
import {
  BulkResultDialog,
  type BulkResult,
} from "@/components/tasks/BulkResultDialog";
import { BulkProgressDialog } from "@/components/tasks/BulkProgressDialog";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import {
  getErrorMessage,
  notifyTasksBulkChanged,
} from "@/lib/bulk-utils";
import {
  paginateRows,
  sortRows,
  type SortDirection,
} from "@/lib/table-view";

type Project = {
  id: number;
  project_code: string | null;
  project_name: string;
};

type Task = {
  id: number;
  project_id: number;
  project_section_id?: number | null;
  task_order: number | null;
  task_type: string | null;
  task_name: string | null;
  assignee: string | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
  created_at: string | null;
};

type TaskWithProject = Task & {
  project: Project | null;
};

const statusList = ["전체", "대기", "진행중", "완료"];
const workFilterList = [
  "전체",
  "오늘 할 일",
  "지연",
  "오늘 마감",
  "오늘 완료",
  "진행중",
  "완료",
];

function getTaskFiltersFromQuery() {
  const searchParams = new URLSearchParams(window.location.search);
  const filter = searchParams.get("filter");
  const status = searchParams.get("status");

  return {
    hasQuery: Boolean(filter || status),
    workFilter:
      filter === "today"
        ? "오늘 할 일"
        : filter === "completed_today"
          ? "오늘 완료"
          : status === "delayed"
            ? "지연"
            : "전체",
    statusFilter: status === "in_progress" ? "진행중" : "전체",
  };
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [availableAssignees, setAvailableAssignees] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = usePersistentState(
    "erp:table:tasks:assignee",
    "전체"
  );
  const [statusFilter, setStatusFilter] = usePersistentState(
    "erp:table:tasks:status",
    "전체"
  );
  const [typeFilter, setTypeFilter] = usePersistentState(
    "erp:table:tasks:type",
    "전체"
  );
  const [workFilter, setWorkFilter] = usePersistentState(
    "erp:table:tasks:work",
    "전체"
  );
  const [searchQuery, setSearchQuery] = usePersistentState(
    "erp:table:tasks:search",
    ""
  );
  const [sortKey, setSortKey] = usePersistentState(
    "erp:table:tasks:sort-key",
    "due_date"
  );
  const [sortDirection, setSortDirection] =
    usePersistentState<SortDirection>(
      "erp:table:tasks:sort-direction",
      "asc"
    );
  const [pageSize, setPageSize] = usePersistentState(
    "erp:table:tasks:page-size",
    20
  );
  const [currentPage, setCurrentPage] = usePersistentState(
    "erp:table:tasks:page",
    1
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const bulkSelection = useBulkSelection<number>();
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [isBulkWorking, setIsBulkWorking] = useState(false);
  const [bulkCompletedCount, setBulkCompletedCount] = useState(0);
  const [bulkTotalCount, setBulkTotalCount] = useState(0);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const queryFilters = getTaskFiltersFromQuery();
      if (queryFilters.hasQuery) {
        setWorkFilter(queryFilters.workFilter);
        setStatusFilter(queryFilters.statusFilter);
      }
      void loadTasks();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [setStatusFilter, setWorkFilter]);

  useEffect(() => {
    function handleTaskUpdated(event: Event) {
      const updatedTask = (
        event as CustomEvent<{ task: TaskDetailData }>
      ).detail.task;
      setTasks((current) =>
        current.map((task) =>
          task.id === updatedTask.id
            ? {
                ...task,
                ...updatedTask,
                project: updatedTask.project || task.project,
              }
            : task
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

  function getToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function isTodayTodo(task: TaskWithProject) {
    const today = getToday();

    if (task.status === "완료") return false;

    return (
      task.status === "진행중" ||
      task.start_date === today ||
      task.due_date === today ||
      (task.due_date !== null && task.due_date < today) ||
      (task.start_date !== null && task.start_date <= today)
    );
  }

  function getTaskDueLabel(task: TaskWithProject) {
    const today = getToday();

    if (task.status === "완료") {
      return {
        text: "완료",
        className: "text-green-600 font-bold",
      };
    }

    if (task.due_date && task.due_date < today) {
      return {
        text: "지연",
        className: "text-red-600 font-bold",
      };
    }

    if (task.due_date === today) {
      return {
        text: "오늘 마감",
        className: "text-orange-600 font-bold",
      };
    }

    if (task.start_date === today) {
      return {
        text: "오늘 시작",
        className: "text-blue-600 font-bold",
      };
    }

    if (task.status === "진행중") {
      return {
        text: "진행중",
        className: "text-blue-600 font-bold",
      };
    }

    return {
      text: "대기",
      className: "text-gray-600",
    };
  }

  async function loadTasks() {
    setIsLoading(true);

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .order("project_id", { ascending: false })
      .order("task_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });

    if (taskError) {
      toast.error(taskError.message);
      setIsLoading(false);
      return;
    }

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("id, project_code, project_name");

    if (projectError) {
      toast.error(projectError.message);
      setIsLoading(false);
      return;
    }

    const projects = projectData || [];

    const mergedTasks = (taskData || []).map((task) => {
      const matchedProject =
        projects.find((project) => project.id === task.project_id) || null;

      return {
        ...task,
        project: matchedProject,
      };
    });

    setTasks(mergedTasks);
    setIsLoading(false);
  }

  async function updateTaskStatus(taskId: number, newStatus: string) {
    if (isUpdating) return;
    const targetTask = tasks.find((task) => task.id === taskId);
    if (!targetTask) return;

    setIsUpdating(true);
    try {
      const updatedTask = await updateTask(targetTask, { status: newStatus });
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId ? { ...task, ...updatedTask } : task
        )
      );
      toast.success(
        isTaskCompleted(newStatus)
          ? "업무가 완료되었습니다."
          : "업무 상태가 변경되었습니다."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "업무 수정에 실패했습니다."
      );
    } finally {
      setIsUpdating(false);
    }

    const { data: employeeData } = await supabase
      .from("employees")
      .select("name")
      .eq("active", true)
      .order("name");
    setAvailableAssignees(
      (employeeData ?? []).map((employee) => employee.name)
    );
  }

  function clearTaskSelection() {
    bulkSelection.clear();
    setShowSelectedOnly(false);
  }

  async function runBulkAction(
    action: BulkEditAction,
    value: string | null
  ) {
    if (isBulkWorking || bulkSelection.selectedCount === 0) return;

    const selectedTasks = tasks.filter((task) =>
      bulkSelection.selectedIds.has(task.id)
    );
    if (selectedTasks.length === 0) return;

    setIsBulkWorking(true);
    setBulkCompletedCount(0);
    setBulkTotalCount(selectedTasks.length);

    const results = await Promise.allSettled(
      selectedTasks.map(async (task) => {
        try {
          if (action === "delete") {
            await deleteTask(task);
            return { id: task.id, deleted: true, task: null };
          }

          const patch: TaskUpdatePatch =
            action === "complete"
              ? { status: "completed" }
              : action === "assignee"
                ? { assignee: value }
                : action === "status"
                  ? { status: value }
                  : action === "start_date"
                    ? { start_date: value }
                    : { due_date: value };
          const updatedTask = await updateTask(task, patch);
          return {
            id: task.id,
            deleted: false,
            task: updatedTask,
          };
        } finally {
          setBulkCompletedCount((current) => current + 1);
        }
      })
    );

    const fulfilled = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    const failures = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [{
            taskId: selectedTasks[index].id,
            taskName: selectedTasks[index].task_name || "업무",
            reason: getErrorMessage(result.reason),
          }]
        : []
    );
    const failedCount = failures.length;
    const deletedIds = new Set(
      fulfilled.filter((result) => result.deleted).map((result) => result.id)
    );
    const updatedById = new Map(
      fulfilled.flatMap((result) =>
        result.task ? [[result.id, result.task] as const] : []
      )
    );

    setTasks((current) =>
      current
        .filter((task) => !deletedIds.has(task.id))
        .map((task) => {
          const updatedTask = updatedById.get(task.id);
          return updatedTask ? { ...task, ...updatedTask } : task;
        })
    );

    const actionLabel =
      action === "assignee"
        ? "담당자 변경"
        : action === "status"
          ? "상태 변경"
          : action === "start_date"
            ? "시작일 변경"
            : action === "due_date"
              ? "마감일 변경"
              : action === "complete"
                ? "완료 처리"
                : "삭제";
    await logActivity({
      type:
        action === "delete"
          ? "task_delete"
          : action === "complete"
            ? "task_complete"
            : action === "assignee"
              ? "task_assignee_change"
              : action === "status"
                ? "task_status_change"
                : "task_update",
      title: `업무 ${fulfilled.length}건 ${actionLabel}`,
      description: `선택한 업무 ${selectedTasks.length}건 중 ${fulfilled.length}건 성공, ${failedCount}건 실패`,
      projectId: null,
      targetType: "task_bulk",
      metadata: {
        action,
        value,
        selectedCount: selectedTasks.length,
        successCount: fulfilled.length,
        failedCount,
        taskIds: selectedTasks.map((task) => task.id),
      },
    }).catch(() => {
      toast.warning("업무 처리는 완료됐지만 일괄 활동 기록에 실패했습니다.");
    });

    setBulkResult({
      successCount: fulfilled.length,
      failures,
    });
    notifyTasksBulkChanged();

    if (failedCount > 0) {
      toast.warning(
        `${fulfilled.length}건 성공, ${failedCount}건 실패했습니다.`
      );
    } else if (action === "delete") {
      toast.success(`${fulfilled.length}건을 ${actionLabel}했습니다.`);
    } else {
      const restoredTasks = selectedTasks.filter((task) =>
        fulfilled.some((result) => result.id === task.id)
      );
      toast.success(`${fulfilled.length}건을 ${actionLabel}했습니다.`, {
        duration: 10000,
        actionLabel: "실행 취소",
        onAction: () => {
          void (async () => {
            const undoResults = await Promise.allSettled(
              restoredTasks.map((task) =>
                updateTask(task, {
                  assignee: task.assignee,
                  status: task.status,
                  start_date: task.start_date,
                  due_date: task.due_date,
                  completed_date: task.completed_date,
                })
              )
            );
            const restored = undoResults.flatMap((result) =>
              result.status === "fulfilled" ? [result.value] : []
            );
            const restoredById = new Map(
              restored.map((task) => [task.id, task] as const)
            );
            setTasks((current) =>
              current.map((task) => {
                const restoredTask = restoredById.get(task.id);
                return restoredTask ? { ...task, ...restoredTask } : task;
              })
            );
            notifyTasksBulkChanged();
            const undoFailedCount = undoResults.length - restored.length;
            if (undoFailedCount > 0) {
              toast.warning(
                `${restored.length}건 복구, ${undoFailedCount}건 복구 실패했습니다.`
              );
            } else {
              toast.info(`${restored.length}건의 변경을 취소했습니다.`);
            }
          })();
        },
      });
    }

    clearTaskSelection();
    setIsBulkWorking(false);
    setBulkCompletedCount(0);
    setBulkTotalCount(0);
  }

  const assigneeList = useMemo(() => {
    const list = tasks
      .map((task) => task.assignee)
      .filter((value): value is string => Boolean(value));

    return ["전체", ...Array.from(new Set(list))];
  }, [tasks]);

  const taskTypeList = useMemo(() => {
    const list = tasks
      .map((task) => task.task_type)
      .filter((value): value is string => Boolean(value));

    return ["전체", ...Array.from(new Set(list))];
  }, [tasks]);

  const today = getToday();
  const filteredTasks = tasks.filter((task) => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ko-KR");
    const searchMatched =
      !normalizedQuery ||
      [
        task.task_name,
        task.task_type,
        task.assignee,
        task.project?.project_name,
        task.project?.project_code,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("ko-KR").includes(normalizedQuery)
        );

    const assigneeMatched =
      assigneeFilter === "전체" || task.assignee === assigneeFilter;

    const statusMatched =
      statusFilter === "전체" || task.status === statusFilter;

    const typeMatched = typeFilter === "전체" || task.task_type === typeFilter;

    let workMatched = true;

    if (workFilter === "오늘 할 일") {
      workMatched = isTodayTodo(task);
    } else if (workFilter === "지연") {
      workMatched =
        task.status !== "완료" &&
        task.due_date !== null &&
        task.due_date < today;
    } else if (workFilter === "오늘 마감") {
      workMatched = task.status !== "완료" && task.due_date === today;
    } else if (workFilter === "오늘 완료") {
      workMatched =
        isTaskCompleted(task.status) && task.completed_date === today;
    } else if (workFilter === "진행중") {
      workMatched = task.status === "진행중";
    } else if (workFilter === "완료") {
      workMatched = task.status === "완료";
    }

    return (
      searchMatched &&
      assigneeMatched &&
      statusMatched &&
      typeMatched &&
      workMatched
    );
  });
  const sortedTasks = sortRows(
    filteredTasks,
    (task) => {
      if (sortKey === "project") return task.project?.project_name;
      if (sortKey === "task_name") return task.task_name;
      if (sortKey === "assignee") return task.assignee;
      if (sortKey === "status") return task.status;
      return task.due_date;
    },
    sortDirection
  );
  const displayedTasks = showSelectedOnly
    ? sortedTasks.filter((task) => bulkSelection.selectedIds.has(task.id))
    : sortedTasks;
  const taskPage = paginateRows(displayedTasks, currentPage, pageSize);
  const currentPageTaskIds = taskPage.rows.map((task) => task.id);
  const selectedOnPageCount = currentPageTaskIds.filter((taskId) =>
    bulkSelection.selectedIds.has(taskId)
  ).length;
  const isCurrentPageSelected =
    currentPageTaskIds.length > 0 &&
    selectedOnPageCount === currentPageTaskIds.length;
  const isCurrentPagePartiallySelected =
    selectedOnPageCount > 0 && !isCurrentPageSelected;

  function toggleCurrentPageSelection() {
    bulkSelection.togglePage(currentPageTaskIds);
  }

  function toggleTaskSelection(taskId: number, shiftKey: boolean) {
    bulkSelection.toggle(taskId, currentPageTaskIds, shiftKey);
  }

  const totalCount = filteredTasks.length;
  const selectedTasks = tasks.filter((task) =>
    bulkSelection.selectedIds.has(task.id)
  );
  const bulkSummary = {
    projectCount: new Set(selectedTasks.map((task) => task.project_id)).size,
    assigneeCount: new Set(
      selectedTasks.flatMap((task) => task.assignee ? [task.assignee] : [])
    ).size,
    dueTodayCount: selectedTasks.filter((task) => task.due_date === today).length,
    overdueCount: selectedTasks.filter(
      (task) =>
        !isTaskCompleted(task.status) &&
        task.due_date !== null &&
        task.due_date < today
    ).length,
  };

  const waitingCount = filteredTasks.filter(
    (task) => !task.status || task.status === "대기"
  ).length;

  const activeCount = filteredTasks.filter(
    (task) => task.status === "진행중"
  ).length;

  const completedCount = filteredTasks.filter(
    (task) => task.status === "완료"
  ).length;

  const todayTodoCount = tasks.filter((task) => isTodayTodo(task)).length;

  const delayedCount = tasks.filter(
    (task) =>
      task.status !== "완료" &&
      task.due_date !== null &&
      task.due_date < getToday()
  ).length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">업무 관리</h1>

        <button
          onClick={loadTasks}
          className="bg-slate-700 text-white px-4 py-2 rounded"
        >
          새로고침
        </button>
      </div>

      <div className="grid grid-cols-4 gap-5 mb-6">
        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">조회 업무</h3>
          <p className="text-3xl font-bold">{totalCount}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">오늘 할 일</h3>
          <p className="text-3xl font-bold text-orange-600">{todayTodoCount}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">지연</h3>
          <p className="text-3xl font-bold text-red-600">{delayedCount}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">완료</h3>
          <p className="text-3xl font-bold text-green-600">{completedCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-5 mb-6">
        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">대기</h3>
          <p className="text-3xl font-bold text-gray-600">{waitingCount}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-gray-600">진행중</h3>
          <p className="text-3xl font-bold text-blue-600">{activeCount}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-5 col-span-2">
          <h3 className="text-gray-600">현재 필터</h3>
          <p className="text-lg font-bold">
            {workFilter} / {assigneeFilter} / {statusFilter} / {typeFilter}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-5 mb-6">
        <input
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setCurrentPage(1);
            clearTaskSelection();
          }}
          placeholder="프로젝트, 업무명, 유형, 담당자 검색"
          aria-label="업무 검색"
          className="mb-4 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
        />
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">업무구분</label>
            <select
              value={workFilter}
              onChange={(e) => {
                setWorkFilter(e.target.value);
                setCurrentPage(1);
                clearTaskSelection();
              }}
              className="border w-full p-2 rounded"
            >
              {workFilterList.map((filter) => (
                <option key={filter} value={filter}>
                  {filter}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">담당자</label>
            <select
              value={assigneeFilter}
              onChange={(e) => {
                setAssigneeFilter(e.target.value);
                setCurrentPage(1);
                clearTaskSelection();
              }}
              className="border w-full p-2 rounded"
            >
              {assigneeList.map((assignee) => (
                <option key={assignee} value={assignee}>
                  {assignee}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">상태</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
                clearTaskSelection();
              }}
              className="border w-full p-2 rounded"
            >
              {statusList.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">업무유형</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setCurrentPage(1);
                clearTaskSelection();
              }}
              className="border w-full p-2 rounded"
            >
              {taskTypeList.map((taskType) => (
                <option key={taskType} value={taskType}>
                  {taskType}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-5 overflow-x-auto">
        {bulkSelection.selectedCount > 0 && (
          <BulkEditToolbar
            selectedCount={bulkSelection.selectedCount}
            summary={bulkSummary}
            assignees={
              availableAssignees.length > 0
                ? availableAssignees
                : assigneeList.filter((assignee) => assignee !== "전체")
            }
            statuses={statusList.filter((status) => status !== "전체")}
            isWorking={isBulkWorking}
            showSelectedOnly={showSelectedOnly}
            onToggleSelectedOnly={() =>
              setShowSelectedOnly((current) => !current)
            }
            onApply={(action, value) => void runBulkAction(action, value)}
            onCancel={clearTaskSelection}
          />
        )}
        <TableViewControls
          sortKey={sortKey}
          sortDirection={sortDirection}
          sortOptions={[
            { value: "due_date", label: "마감일" },
            { value: "project", label: "프로젝트" },
            { value: "task_name", label: "업무명" },
            { value: "assignee", label: "담당자" },
            { value: "status", label: "상태" },
          ]}
          pageSize={pageSize}
          page={taskPage.page}
          totalPages={taskPage.totalPages}
          totalItems={filteredTasks.length}
          onSortKeyChange={(value) => {
            setSortKey(value);
            setCurrentPage(1);
            clearTaskSelection();
          }}
          onSortDirectionChange={(value) => {
            setSortDirection(value);
            setCurrentPage(1);
            clearTaskSelection();
          }}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setCurrentPage(1);
            clearTaskSelection();
          }}
          onPageChange={(page) => {
            setCurrentPage(page);
            clearTaskSelection();
          }}
        />
        {isLoading ? (
          <TableSkeleton rows={7} columns={8} />
        ) : (
          <table className="w-full min-w-[1140px]">
            <thead>
              <tr className="border-b">
                <th className="w-10 p-2 text-left">
                  <input
                    ref={(node) => {
                      if (node) {
                        node.indeterminate = isCurrentPagePartiallySelected;
                      }
                    }}
                    type="checkbox"
                    checked={isCurrentPageSelected}
                    onChange={toggleCurrentPageSelection}
                    disabled={isBulkWorking || currentPageTaskIds.length === 0}
                    aria-label="현재 페이지 업무 전체 선택"
                    className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                  />
                </th>
                <th className="text-left p-2">업무상태</th>
                <th className="text-left p-2">프로젝트</th>
                <th className="text-left p-2">순번</th>
                <th className="text-left p-2">업무명</th>
                <th className="text-left p-2">업무유형</th>
                <th className="text-left p-2">담당자</th>
                <th className="text-left p-2">시작일</th>
                <th className="text-left p-2">마감일</th>
                <th className="text-left p-2">상태변경</th>
                <th className="text-left p-2">완료일</th>
              </tr>
            </thead>

            <tbody>
              {taskPage.rows.map((task) => {
                const dueLabel = getTaskDueLabel(task);

                return (
                  <tr
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openTaskDetail(task.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openTaskDetail(task.id);
                      }
                    }}
                    className="cursor-pointer border-b hover:bg-gray-50"
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={bulkSelection.selectedIds.has(task.id)}
                        onChange={() => undefined}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleTaskSelection(task.id, event.shiftKey);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                        disabled={isBulkWorking}
                        aria-label={`${task.task_name || "업무"} 선택`}
                        className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                      />
                    </td>
                    <td className={`p-2 ${dueLabel.className}`}>
                      {dueLabel.text}
                    </td>

                    <td className="p-2">
                      {task.project ? (
                        <Link
                          href={`/projects/${task.project.id}`}
                          className="text-blue-600 hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {task.project.project_name}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td className="p-2">{task.task_order || "-"}</td>
                    <td className="p-2">{task.task_name || "-"}</td>
                    <td className="p-2">{task.task_type || "-"}</td>
                    <td className="p-2">{task.assignee || "-"}</td>
                    <td className="p-2">{task.start_date || "-"}</td>
                    <td className="p-2">{task.due_date || "-"}</td>

                    <td className="p-2">
                      <select
                        value={task.status || "대기"}
                        disabled={isUpdating || isBulkWorking}
                        onChange={(e) =>
                          updateTaskStatus(task.id, e.target.value)
                        }
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                        className="border px-3 py-1 rounded"
                      >
                        {statusList
                          .filter((status) => status !== "전체")
                          .map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                      </select>
                    </td>

                    <td className="p-2">{task.completed_date || "-"}</td>
                  </tr>
                );
              })}

              {displayedTasks.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-0">
                    <EmptyState
                      title="조건에 맞는 업무가 없습니다."
                      message="필터를 변경하거나 목록을 새로고침해 보세요."
                      icon={<ListTodo size={26} />}
                      action={
                        <Button size="sm" variant="outline" onClick={() => void loadTasks()}>
                          다시 불러오기
                        </Button>
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <BulkProgressDialog
        open={isBulkWorking}
        completed={bulkCompletedCount}
        total={bulkTotalCount}
      />
      <BulkResultDialog
        result={bulkResult}
        onClose={() => setBulkResult(null)}
      />
    </div>
  );
}
