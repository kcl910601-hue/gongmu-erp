"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { recordRecentTask } from "@/lib/recent";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  IntegratedProjectGantt,
  type GanttTaskDetail,
  type IntegratedProject,
} from "@/components/gantt/IntegratedProjectGantt";
import { GanttTaskDetailModal } from "@/components/gantt/GanttTaskDetailModal";
import {
  getTaskStatusLabel,
  isTaskCompleted,
  isTaskInProgress,
} from "@/lib/status";

type Project = IntegratedProject & {
  completion_due_date: string | null;
};

type Shipment = {
  id: number;
  site_name: string;
  item_name: string;
  shipment_date: string | null;
  status: string | null;
};

type Task = {
  id: number;
  project_id: number;
  task_name: string | null;
  task_type: string | null;
  assignee: string | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
  task_order: number | null;
};

type EmployeeProfile = {
  name: string;
  email: string | null;
};

type QuickFilter = "전체" | "내 업무" | "지연" | "오늘" | "이번 주";

type CalendarItem = {
  id: string;
  date: string;
  type: "준공예정" | "출고예정" | "업무마감" | "업무완료";
  title: string;
  status: string | null;
  assignee: string;
  projectName?: string;
  taskType?: string | null;
  href?: string;
};

const quickFilters: QuickFilter[] = ["전체", "내 업무", "지연", "오늘", "이번 주"];
const typeList = ["전체", "준공예정", "출고예정", "업무완료"];
const viewList = ["달력 보기", "타임라인 보기", "간트 보기"];

export default function CalendarPage() {
  function padDatePart(value: number) {
    return String(value).padStart(2, "0");
  }

  function getLocalDateValue(date = new Date()) {
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(
      date.getDate()
    )}`;
  }

  function getLocalMonthValue(date = new Date()) {
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
  }

  function parseDateValue(date: string) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function formatMonthLabel(month: string) {
    const [year, monthValue] = month.split("-");
    return `${year}년 ${Number(monthValue)}월`;
  }

  const [items, setItems] = useState<CalendarItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [selectedTask, setSelectedTask] = useState<GanttTaskDetail | null>(null);
  const [editDate, setEditDate] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("전체");
  const [excludeCompleted, setExcludeCompleted] = useState(false);
  const [currentAssignee, setCurrentAssignee] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("전체");
  const [assigneeFilter, setAssigneeFilter] = useState("전체");
  const [viewMode, setViewMode] = useState("달력 보기");
  const [currentMonth, setCurrentMonth] = useState(() =>
    getLocalMonthValue()
  );
  const [selectedDate, setSelectedDate] = useState(() =>
    getLocalDateValue()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDate, setIsSavingDate] = useState(false);

  useEffect(() => {
    void loadCalendar();
    void loadCurrentAssignee();
  }, []);

  async function loadCurrentAssignee() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const email = session?.user?.email ?? null;

    if (!email) {
      setCurrentAssignee(null);
      return;
    }

    const { data, error } = await supabase
      .from("employees")
      .select("name, email")
      .eq("email", email)
      .maybeSingle();

    if (error || !data) {
      setCurrentAssignee(email);
      return;
    }

    const profile = data as EmployeeProfile;
    setCurrentAssignee(profile.name || profile.email || email);
  }

  async function loadCalendar() {
    setIsLoading(true);

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select(
        "id, project_code, project_name, assembly_vendor, salesperson, task_manager, completion_due_date, status"
      );

    if (projectError) {
      alert(projectError.message);
      setIsLoading(false);
      return;
    }

    const { data: shipmentData, error: shipmentError } = await supabase
      .from("shipments")
      .select("id, site_name, item_name, shipment_date, status");

    if (shipmentError) {
      alert(shipmentError.message);
      setIsLoading(false);
      return;
    }

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select(
        "id, project_id, task_order, task_name, task_type, assignee, status, start_date, due_date, completed_date"
      );

    if (taskError) {
      alert(taskError.message);
      setIsLoading(false);
      return;
    }

    const calendarProjects = (projectData || []) as Project[];
    const calendarTasks = (taskData || []) as Task[];

    setProjects(calendarProjects);
    setTasks(calendarTasks);

    const projectItems: CalendarItem[] = calendarProjects
      .filter((project) => project.completion_due_date)
      .map((project) => ({
        id: `project-${project.id}`,
        date: project.completion_due_date as string,
        type: "준공예정",
        title: project.project_name,
        status: project.status,
        assignee: project.task_manager || "미지정",
        href: `/projects/${project.id}`,
      }));

    const shipmentItems: CalendarItem[] = ((shipmentData || []) as Shipment[])
      .filter((shipment) => shipment.shipment_date)
      .map((shipment) => ({
        id: `shipment-${shipment.id}`,
        date: shipment.shipment_date as string,
        type: "출고예정",
        title: `${shipment.site_name} / ${shipment.item_name}`,
        status: shipment.status,
        assignee: "미지정",
        href: "/shipments",
      }));

    const projectNameById = new Map(
      calendarProjects.map((project) => [
        project.id,
        project.project_name,
      ])
    );

    const taskDueItems: CalendarItem[] = calendarTasks
      .filter((task) => task.due_date)
      .map((task) => ({
        id: `task-due-${task.id}`,
        date: task.due_date as string,
        type: "업무마감",
        title: task.task_name || "-",
        status: task.status,
        assignee: task.assignee || "미지정",
        projectName: projectNameById.get(task.project_id) || "-",
        taskType: task.task_type,
        href: `/projects/${task.project_id}`,
      }));

    const taskItems: CalendarItem[] = calendarTasks
      .filter((task) => task.completed_date)
      .map((task) => ({
        id: `task-${task.id}`,
        date: task.completed_date as string,
        type: "업무완료",
        title: `${task.task_name || "-"} / ${task.task_type || "-"}`,
        status: "완료",
        assignee: task.assignee || "미지정",
        projectName: projectNameById.get(task.project_id) || "-",
        taskType: task.task_type,
        href: `/projects/${task.project_id}`,
      }));

    const mergedItems = [
      ...projectItems,
      ...shipmentItems,
      ...taskDueItems,
      ...taskItems,
    ].sort((a, b) => a.date.localeCompare(b.date));

    setItems(mergedItems);
    setIsLoading(false);
  }

  function openItemModal(item: CalendarItem) {
    setSelectedItem(item);
    setEditDate(item.date);
  }

  function getTaskIdFromCalendarItem(item: CalendarItem) {
    if (item.id.startsWith("task-due-")) {
      return Number(item.id.replace("task-due-", ""));
    }

    if (item.id.startsWith("task-")) {
      return Number(item.id.replace("task-", ""));
    }

    return null;
  }

  function isTaskCalendarItem(item: CalendarItem) {
    return getTaskIdFromCalendarItem(item) !== null;
  }

  function getDelayedDays(task: Task) {
    if (isTaskCompleted(task.status) || !task.due_date || task.due_date >= today) {
      return null;
    }

    const diffMs =
      parseDateValue(today).getTime() - parseDateValue(task.due_date).getTime();

    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  function openTaskDetailModal(item: CalendarItem) {
    const taskId = getTaskIdFromCalendarItem(item);
    if (taskId === null || Number.isNaN(taskId)) return;

    const task = tasks.find((taskItem) => taskItem.id === taskId);
    if (!task) return;

    const project = projects.find(
      (projectItem) => projectItem.id === task.project_id
    );
    const dueDate = task.due_date || item.date || "";
    const startDate = task.start_date || dueDate;

    setSelectedTask({
      taskId: task.id,
      projectId: task.project_id,
      projectName: project?.project_name || item.projectName || "-",
      projectCode: project?.project_code || null,
      taskName: task.task_name,
      taskType: task.task_type,
      assignee: task.assignee,
      startDate,
      dueDate,
      status: task.status,
      completedDate: task.completed_date,
      delayedDays: getDelayedDays(task),
      taskTypeClassName: "bg-slate-100 text-slate-700 ring-slate-200",
    });
  }

  async function updateCalendarDate() {
    if (!selectedItem) return;

    if (!editDate) {
      alert("변경할 날짜를 선택하세요.");
      return;
    }

    if (selectedItem.type === "업무완료") {
      alert("업무완료일은 업무 상태 변경으로 관리하는 값입니다.");
      return;
    }

    setIsSavingDate(true);

    let error = null;

    if (selectedItem.type === "준공예정") {
      const projectId = Number(selectedItem.id.replace("project-", ""));

      const result = await supabase
        .from("projects")
        .update({
          completion_due_date: editDate,
        })
        .eq("id", projectId);

      error = result.error;
    }

    if (selectedItem.type === "출고예정") {
      const shipmentId = Number(selectedItem.id.replace("shipment-", ""));

      const result = await supabase
        .from("shipments")
        .update({
          shipment_date: editDate,
        })
        .eq("id", shipmentId);

      error = result.error;
    }

    if (error) {
      alert(error.message);
      setIsSavingDate(false);
      return;
    }

    setSelectedItem(null);
    setEditDate("");
    setIsSavingDate(false);
    await loadCalendar();
  }

  function getTypeStyle(type: string) {
    if (type === "준공예정") {
      return "bg-blue-100 text-blue-700 border-blue-300";
    }

    if (type === "출고예정") {
      return "bg-yellow-100 text-yellow-700 border-yellow-300";
    }

    if (type === "업무마감") {
      return "bg-slate-50 text-slate-700 border-slate-200";
    }

    return "bg-green-100 text-green-700 border-green-300";
  }

  function getDisplayType(type: string) {
    return type;
  }

  function matchesTypeFilter(item: CalendarItem) {
    if (typeFilter === "전체") return true;

    if (typeFilter === "업무완료") {
      return item.type === "업무마감" || item.type === "업무완료";
    }

    return item.type === typeFilter;
  }

  function isCompletedFilterTarget(item: CalendarItem) {
    return item.type === "업무완료" || isTaskCompleted(item.status);
  }

  function getTaskDueVariant(item: CalendarItem): BadgeVariant {
    if (isTaskCompleted(item.status)) return "success";
    if (item.date < today) return "danger";
    if (item.date === today) return "warning";
    return "info";
  }

  function getTaskDueLabel(item: CalendarItem) {
    if (isTaskCompleted(item.status)) return "완료";
    if (item.date < today) {
      const diffMs =
        parseDateValue(today).getTime() - parseDateValue(item.date).getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      return `지연 ${diffDays}일`;
    }
    if (item.date === today) return "오늘";

    const diffMs =
      parseDateValue(item.date).getTime() - parseDateValue(today).getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return `D-${diffDays}`;
  }

  function getTaskDueClassName(item: CalendarItem) {
    if (isTaskCompleted(item.status)) {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (item.date < today) {
      return "border-red-200 bg-red-50 text-red-700";
    }

    if (item.date === today) {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }

    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  function getTaskStatusVariant(status: string | null): BadgeVariant {
    if (isTaskCompleted(status)) return "success";
    if (isTaskInProgress(status)) return "info";
    return "default";
  }

  function getCalendarItemPriority(item: CalendarItem) {
    if (item.type !== "업무마감") return 2;
    if (isTaskCompleted(item.status)) return 4;
    if (item.date < today) return 1;
    if (item.date === today) return 2;
    return 3;
  }

  function getWeekRange(date: string) {
    const baseDate = parseDateValue(date);
    const mondayIndex = (baseDate.getDay() + 6) % 7;
    const startDate = new Date(baseDate);
    const endDate = new Date(baseDate);

    startDate.setDate(baseDate.getDate() - mondayIndex);
    endDate.setDate(startDate.getDate() + 6);

    return {
      start: getLocalDateValue(startDate),
      end: getLocalDateValue(endDate),
    };
  }

  function matchesQuickFilter(item: CalendarItem) {
    if (quickFilter === "전체") return true;

    if (quickFilter === "내 업무") {
      return Boolean(currentAssignee) && item.assignee === currentAssignee;
    }

    if (item.type !== "업무마감") return false;

    if (quickFilter === "지연") {
      return !isTaskCompleted(item.status) && item.date < today;
    }

    if (quickFilter === "오늘") {
      return !isTaskCompleted(item.status) && item.date === today;
    }

    const { start, end } = getWeekRange(today);
    return item.date >= start && item.date <= end;
  }

  function moveMonth(direction: "prev" | "next") {
    const [year, month] = currentMonth.split("-").map(Number);
    const baseDate = new Date(year, month - 1, 1);

    if (direction === "prev") {
      baseDate.setMonth(baseDate.getMonth() - 1);
    } else {
      baseDate.setMonth(baseDate.getMonth() + 1);
    }

    const nextMonth = getLocalMonthValue(baseDate);

    setCurrentMonth(nextMonth);
    setSelectedDate(`${nextMonth}-01`);
  }

  function selectMonth(month: string) {
    if (!month) return;

    setCurrentMonth(month);
    setSelectedDate(`${month}-01`);
  }

  function goToday() {
    setCurrentMonth(today.slice(0, 7));
    setSelectedDate(today);
  }

  function getCalendarDays() {
    const [year, month] = currentMonth.split("-").map(Number);
    const firstDate = new Date(year, month - 1, 1);
    const lastDate = new Date(year, month, 0);

    const startDay = (firstDate.getDay() + 6) % 7;
    const totalDays = lastDate.getDate();

    const days: (string | null)[] = [];

    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

    for (let day = 1; day <= totalDays; day++) {
      days.push(`${currentMonth}-${String(day).padStart(2, "0")}`);
    }

    while (days.length % 7 !== 0) {
      days.push(null);
    }

    return days;
  }

  const today = getLocalDateValue();
  const assigneeList = useMemo(() => {
    const names = items.map((item) => item.assignee);
    return ["전체", ...Array.from(new Set(names))];
  }, [items]);

  const filteredItems = items.filter((item) => {
    const quickMatched = matchesQuickFilter(item);
    const typeMatched = matchesTypeFilter(item);
    const assigneeMatched =
      assigneeFilter === "전체" || item.assignee === assigneeFilter;
    const completedMatched =
      !excludeCompleted || !isCompletedFilterTarget(item);

    return quickMatched && typeMatched && assigneeMatched && completedMatched;
  });

  const ganttTaskIds = useMemo(
    () =>
      new Set(
        filteredItems
          .filter((item) => item.id.startsWith("task-due-"))
          .map((item) => Number(item.id.replace("task-due-", "")))
      ),
    [filteredItems]
  );

  function handleGanttTaskUpdated(updatedTask: Task) {
    const projectName =
      projects.find((project) => project.id === updatedTask.project_id)
        ?.project_name || "-";
    void recordRecentTask({
      task_id: updatedTask.id,
      project_id: updatedTask.project_id,
      project_name: projectName,
      task_name: updatedTask.task_name,
      task_type: updatedTask.task_type,
      assignee: updatedTask.assignee,
      status: updatedTask.status,
      due_date: updatedTask.due_date,
    });
    const taskDueItem: CalendarItem | null = updatedTask.due_date
      ? {
          id: `task-due-${updatedTask.id}`,
          date: updatedTask.due_date,
          type: "업무마감",
          title: updatedTask.task_name || "-",
          status: updatedTask.status,
          assignee: updatedTask.assignee || "미지정",
          projectName,
          taskType: updatedTask.task_type,
          href: `/projects/${updatedTask.project_id}`,
        }
      : null;
    const taskCompletedItem: CalendarItem | null = updatedTask.completed_date
      ? {
          id: `task-${updatedTask.id}`,
          date: updatedTask.completed_date,
          type: "업무완료",
          title: `${updatedTask.task_name || "-"} / ${
            updatedTask.task_type || "-"
          }`,
          status: "완료",
          assignee: updatedTask.assignee || "미지정",
          projectName,
          taskType: updatedTask.task_type,
          href: `/projects/${updatedTask.project_id}`,
        }
      : null;

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === updatedTask.id ? updatedTask : task
      )
    );
    setItems((currentItems) =>
      [
        ...currentItems.filter(
          (item) =>
            item.id !== `task-due-${updatedTask.id}` &&
            item.id !== `task-${updatedTask.id}`
        ),
        ...(taskDueItem ? [taskDueItem] : []),
        ...(taskCompletedItem ? [taskCompletedItem] : []),
      ].sort((a, b) => a.date.localeCompare(b.date))
    );
  }

  const groupedItems = useMemo(() => {
    const grouped: Record<string, CalendarItem[]> = {};

    filteredItems.forEach((item) => {
      if (!grouped[item.date]) {
        grouped[item.date] = [];
      }

      grouped[item.date].push(item);
    });

    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredItems]);

  function getDateItems(date: string) {
    return filteredItems
      .filter((item) => item.date === date)
      .sort((a, b) => {
        const priorityDiff =
          getCalendarItemPriority(a) - getCalendarItemPriority(b);

        if (priorityDiff !== 0) return priorityDiff;

        return a.title.localeCompare(b.title);
      });
  }

  function formatKoreanDate(date: string) {
    const [year, month, day] = date.split("-");
    return `${year}년 ${Number(month)}월 ${Number(day)}일`;
  }

  const calendarDays = getCalendarDays();
  const selectedDateTaskItems = filteredItems
    .filter(
      (item) => item.date === selectedDate && item.type === "업무마감"
    )
    .sort((a, b) => {
      const priorityDiff =
        getCalendarItemPriority(a) - getCalendarItemPriority(b);

      if (priorityDiff !== 0) return priorityDiff;

      return a.title.localeCompare(b.title);
    });
  const legendItems: { label: string; variant: BadgeVariant }[] = [
    { label: "지연", variant: "danger" },
    { label: "오늘", variant: "warning" },
    { label: "이번 주", variant: "info" },
    { label: "완료", variant: "success" },
  ];
  const hasActiveFilter =
    quickFilter !== "전체" ||
    typeFilter !== "전체" ||
    assigneeFilter !== "전체" ||
    excludeCompleted;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-500">
            <CalendarDays size={16} />
            Calendar
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            Calendar
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            프로젝트 업무를 한눈에 관리하세요.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Workspace Filter
          </div>
          <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
            {quickFilters.map((filter) => (
              <Button
                key={filter}
                onClick={() => setQuickFilter(filter)}
                variant={quickFilter === filter ? "primary" : "ghost"}
                size="sm"
                className={`h-9 rounded-2xl px-3.5 text-sm font-medium transition-colors duration-150 ${
                  quickFilter === filter
                    ? "shadow-sm ring-1 ring-blue-100"
                    : "border border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-100"
                }`}
              >
                {filter}
              </Button>
            ))}
            <Button
              onClick={() => setExcludeCompleted((current) => !current)}
              variant={excludeCompleted ? "primary" : "ghost"}
              size="sm"
              className={`h-9 rounded-2xl px-3.5 text-sm font-medium transition-colors duration-150 ${
                excludeCompleted
                  ? "shadow-sm ring-1 ring-blue-100"
                  : "border border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-100"
              }`}
            >
              완료제외
            </Button>
          </div>
          <Button
            onClick={loadCalendar}
            variant="secondary"
            className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-medium transition-colors duration-150"
          >
            <RefreshCw size={16} />
            새로고침
          </Button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">조회 일정</h3>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{filteredItems.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">준공예정</h3>
          <p className="mt-1 text-3xl font-bold tracking-tight text-blue-600">
            {filteredItems.filter((item) => item.type === "준공예정").length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">출고예정</h3>
          <p className="mt-1 text-3xl font-bold tracking-tight text-amber-600">
            {filteredItems.filter((item) => item.type === "출고예정").length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">오늘 일정</h3>
          <p className="mt-1 text-3xl font-bold tracking-tight text-orange-600">
            {filteredItems.filter((item) => item.date === today).length}
          </p>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-500">보기 방식</div>

            <div className="flex gap-2">
              {viewList.map((view) => (
                <Button
                  key={view}
                  onClick={() => setViewMode(view)}
                  variant={viewMode === view ? "primary" : "ghost"}
                  className={`h-10 rounded-2xl px-4 text-sm font-medium transition-colors duration-150 ${
                    viewMode === view
                      ? "shadow-sm ring-1 ring-blue-100"
                      : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white focus-visible:ring-2 focus-visible:ring-blue-100"
                  }`}
                >
                  {view}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-500">일정 구분</div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-colors duration-150 hover:bg-white focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            >
              {typeList.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-500">담당자</div>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-colors duration-150 hover:bg-white focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            >
              {assigneeList.map((assignee) => (
                <option key={assignee} value={assignee}>
                  {assignee}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-500">완료</div>
            <Button
              onClick={() => setExcludeCompleted((current) => !current)}
              variant={excludeCompleted ? "primary" : "ghost"}
              className={`h-10 rounded-2xl px-4 text-sm font-medium transition-colors duration-150 ${
                excludeCompleted
                  ? "shadow-sm ring-1 ring-blue-100"
                  : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white focus-visible:ring-2 focus-visible:ring-blue-100"
              }`}
            >
              완료제외
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          불러오는 중...
        </div>
      ) : viewMode === "달력 보기" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <Button
              onClick={() => moveMonth("prev")}
              variant="secondary"
              className="flex h-10 items-center gap-2 rounded-2xl px-4 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-100"
            >
              <ChevronLeft size={16} />
              이전달
            </Button>

            <div className="flex flex-wrap items-end justify-center gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-400">기준 월</span>
                <input
                  type="month"
                  value={currentMonth}
                  onChange={(event) => selectMonth(event.target.value)}
                  aria-label="기준 월 선택"
                  className="h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-center text-sm font-semibold text-slate-950 outline-none transition-colors duration-150 hover:bg-white focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <span className="hidden h-10 items-center rounded-2xl bg-slate-100 px-3 text-sm font-medium text-slate-600 sm:inline-flex">
                {formatMonthLabel(currentMonth)}
              </span>
              <Button
                onClick={goToday}
                variant="ghost"
                className="h-10 rounded-2xl border border-transparent px-3 text-sm transition-colors duration-150 hover:border-slate-200 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-100"
              >
                Today
              </Button>
            </div>

            <Button
              onClick={() => moveMonth("next")}
              variant="secondary"
              className="flex h-10 items-center gap-2 rounded-2xl px-4 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-100"
            >
              다음달
              <ChevronRight size={16} />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {["월", "화", "수", "목", "금", "토", "일"].map((day) => (
              <div
                key={day}
                className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-semibold text-slate-500"
              >
                {day}
              </div>
            ))}

            {calendarDays.map((date, index) => {
              const dateItems = date ? getDateItems(date) : [];
              const visibleDateItems = dateItems.slice(0, 3);

              return (
                <div
                  key={index}
                  onClick={() => {
                    if (date) {
                      setSelectedDate(date);
                    }
                  }}
                  role={date ? "button" : undefined}
                  tabIndex={date ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (!date) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedDate(date);
                    }
                  }}
                  className={`min-h-[140px] rounded-2xl border p-2.5 outline-none transition-all duration-150 sm:min-h-[148px] ${
                    date === selectedDate
                      ? "border-blue-200 bg-blue-50 shadow-sm ring-2 ring-blue-100"
                      : date === today
                        ? "border-amber-200 bg-amber-50"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm"
                  } ${date ? "cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-100" : "border-slate-100 bg-slate-50/60"}`}
                >
                  {date && (
                    <>
                      <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold text-slate-700">
                        <span>
                        {Number(date.slice(-2))}
                        </span>
                        {date === today && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">오늘</span>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {visibleDateItems.map((item) =>
                          isTaskCalendarItem(item) ? (
                            <button
                              type="button"
                              key={item.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                openTaskDetailModal(item);
                              }}
                              className="block w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left transition-colors duration-150 hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                            >
                              <div className="truncate text-sm font-semibold leading-5 text-slate-900">
                                {item.projectName || "-"}
                              </div>
                              <div className="truncate text-[11px] font-medium leading-4 text-slate-400">
                                {item.taskType || getDisplayType(item.type)}
                              </div>
                              <div className="truncate text-xs leading-4 text-slate-600">
                                {item.title}
                              </div>
                              <div
                                className={`mt-1 inline-flex max-w-full rounded-full border px-2 py-0.5 text-[11px] font-medium ${getTaskDueClassName(
                                  item
                                )}`}
                              >
                                {getTaskDueLabel(item)}
                              </div>
                            </button>
                          ) : (
                            <button
                              key={item.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                openItemModal(item);
                              }}
                              className={`block w-full truncate rounded-xl border px-2.5 py-2 text-left text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 ${getTypeStyle(
                                item.type
                              )}`}
                            >
                              {getDisplayType(item.type)} · {item.title}
                            </button>
                          )
                        )}

                        {dateItems.length > 3 && (
                          <div className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">
                            +{dateItems.length - 3}건
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : viewMode === "간트 보기" ? (
        <IntegratedProjectGantt
          projects={projects}
          tasks={tasks}
          visibleTaskIds={ganttTaskIds}
          currentMonth={currentMonth}
          today={today}
          onTaskUpdated={handleGanttTaskUpdated}
        />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-5 text-lg font-bold tracking-tight text-slate-950">타임라인</h2>

          {groupedItems.length === 0 ? (
            <EmptyState
              message="조회된 일정이 없습니다."
              className="rounded-2xl bg-slate-50 p-10 text-center text-sm text-slate-500"
            />
          ) : (
            <div className="relative ml-4 space-y-7 border-l border-slate-200">
              {groupedItems.map(([date, dateItems]) => (
                <div key={date} className="relative pl-8">
                  <div className="absolute -left-[7px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-slate-400 shadow-sm" />

                  <div className="mb-3">
                    <span className="text-base font-bold text-slate-950">{date}</span>
                    {date === today && (
                      <span className="ml-2 text-sm font-bold text-orange-600">
                        오늘
                      </span>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {dateItems.map((item) => {
                      const itemContent = (
                        <>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <span
                                className={`mr-3 inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${getTypeStyle(
                                  item.type
                                )}`}
                              >
                                {getDisplayType(item.type)}
                              </span>
                              <span className="font-medium leading-6 text-slate-900">{item.title}</span>
                            </div>

                            <div className="shrink-0 text-sm text-slate-500">
                              담당자: {item.assignee}
                            </div>
                          </div>

                          <div className="mt-2 text-sm leading-6 text-slate-500">
                            상태: {item.status || "-"}
                            {item.projectName ? ` · ${item.projectName}` : ""}
                          </div>
                        </>
                      );

                      return isTaskCalendarItem(item) ? (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => openTaskDetailModal(item)}
                          className="block w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition-colors duration-150 hover:border-slate-300 hover:bg-white hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                        >
                          {itemContent}
                        </button>
                      ) : (
                        <button
                          key={item.id}
                          onClick={() => openItemModal(item)}
                          className="block w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition-colors duration-150 hover:border-slate-300 hover:bg-white hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                        >
                          {itemContent}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold tracking-tight text-slate-950">
              {formatKoreanDate(selectedDate)}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {selectedDate === today ? "오늘 업무" : "업무"}{" "}
              {selectedDateTaskItems.length}건
            </p>
          </div>

          <div className="mb-5 rounded-2xl bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-800">선택 날짜 업무</h3>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
                {selectedDateTaskItems.length}건
              </span>
            </div>

            {selectedDateTaskItems.length > 0 ? (
              <div className="max-h-[520px] space-y-2.5 overflow-y-auto pr-1">
                {selectedDateTaskItems.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => openTaskDetailModal(item)}
                    className="block rounded-2xl border border-slate-200 bg-white p-4 text-sm transition-colors duration-150 hover:border-blue-200 hover:bg-blue-50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                  >
                    <div className="truncate text-base font-semibold leading-6 text-slate-950">
                      {item.title}
                    </div>
                    <div className="mt-1 truncate text-sm font-medium leading-5 text-slate-600">
                      {item.projectName || "-"}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                        {item.taskType || getDisplayType(item.type)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                        담당 {item.assignee}
                      </span>
                      <Badge
                        variant={getTaskStatusVariant(item.status)}
                        className="px-2.5 py-1 text-xs font-medium"
                      >
                        {getTaskStatusLabel(item.status)}
                      </Badge>
                      <Badge
                        variant={getTaskDueVariant(item)}
                        className="px-2.5 py-1 text-xs font-medium"
                      >
                        {getTaskDueLabel(item)}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                message={
                  hasActiveFilter
                    ? "조건에 맞는 업무가 없습니다."
                    : "선택한 날짜에 등록된 업무가 없습니다."
                }
                className="rounded-xl bg-white p-8 text-center text-sm text-slate-400"
              />
            )}
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Legend</h3>
            <div className="flex flex-wrap gap-2">
              {legendItems.map((item) => (
                <Badge key={item.label} variant={item.variant}>
                  {item.label}
                </Badge>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {selectedTask && (
        <GanttTaskDetailModal
          task={selectedTask}
          today={today}
          onTaskUpdated={handleGanttTaskUpdated}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[600px] rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight text-slate-950">일정 상세</h2>

              <button
                onClick={() => {
                  setSelectedItem(null);
                  setEditDate("");
                }}
                className="rounded-full px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-slate-500">일정명</div>
                <div className="mt-1 font-medium text-slate-950">{selectedItem.title}</div>
              </div>

              <div>
                <div className="text-sm font-medium text-slate-500">구분</div>
                <span
                  className={`mt-1 inline-block rounded-full border px-3 py-1 text-sm ${getTypeStyle(
                    selectedItem.type
                  )}`}
                >
                  {getDisplayType(selectedItem.type)}
                </span>
              </div>

              <div>
                <div className="text-sm font-medium text-slate-500">담당자</div>
                <div className="mt-1 text-slate-900">{selectedItem.assignee}</div>
              </div>

              <div>
                <div className="text-sm font-medium text-slate-500">상태</div>
                <div className="mt-1 text-slate-900">{selectedItem.status || "-"}</div>
              </div>

              <div>
                <div className="text-sm font-medium text-slate-500">일정일</div>

                {selectedItem.type === "업무완료" ? (
                  <div className="mt-1 text-slate-900">{selectedItem.date}</div>
                ) : (
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                  />
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                onClick={() => {
                  setSelectedItem(null);
                  setEditDate("");
                }}
                variant="secondary"
                className="rounded-2xl px-4 py-2 text-sm"
              >
                닫기
              </Button>

              {selectedItem.type !== "업무완료" && (
                <Button
                  onClick={updateCalendarDate}
                  disabled={isSavingDate}
                  variant="primary"
                  className="rounded-2xl px-4 py-2 text-sm"
                >
                  {isSavingDate ? "저장 중..." : "일정변경 저장"}
                </Button>
              )}

              {selectedItem.href && (
                <Link
                  href={selectedItem.href}
                  className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  상세보기
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
