"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TASKS_BULK_CHANGED_EVENT } from "@/lib/bulk-utils";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  FolderKanban,
  Search,
  Truck,
  User,
  UserCheck,
  Users,
} from "lucide-react";
import type { KeyboardEvent } from "react";
import { supabase } from "@/lib/supabase";
import { getCurrentEmployee } from "@/lib/auth";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import ActivityTimeline from "@/components/activity/ActivityTimeline";
import MyWorkspaceRecent from "@/components/recent/MyWorkspaceRecent";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  MorningBrief,
  type MorningBriefShipment,
} from "@/components/dashboard/MorningBrief";
import { getLocalDateString } from "@/lib/task-priority";
import { TASK_DETAIL_UPDATED_EVENT } from "@/lib/task-detail";
import type { TaskDetailData } from "@/components/tasks/TaskDetailView";
import {
  getTaskStatusLabel,
  isProjectCompleted,
  isProjectInProgress,
  isTaskCompleted,
  isTaskInProgress,
  isTaskPending,
} from "@/lib/status";

const DASHBOARD_ACTIVITY_EXPANDED_KEY =
  "erp-dashboard-activity-expanded";

type Project = {
  id: number;
  project_code: string | null;
  project_name: string;
  assembly_vendor: string | null;
  process_type: string;
  salesperson: string | null;
  task_manager: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  completion_due_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Task = {
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

type ProjectWithProgress = Project & {
  progress: number;
  dueStatus: string;
};

type MyWorkTask = Task & {
  projectName: string;
};

type TeamWorkspaceTask = {
  id: number;
  project_id: number;
  project_name: string;
  task_name: string | null;
  due_date: string | null;
  status: string | null;
};

type TeamWorkspaceMember = {
  assignee: string;
  totalCount: number;
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  openCount: number;
  delayedCount: number;
  todayCount: number;
  thisWeekDueCount: number;
  representativeTasks: TeamWorkspaceTask[];
};

type AnalyticsPeriod = "week" | "month" | "quarter" | "custom";

type AnalyticsRange = {
  startDate: string;
  endDate: string;
};

function handleKpiKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
  if (event.key === " ") {
    event.preventDefault();
    event.currentTarget.click();
  }
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getThisWeekRange(date: string) {
  const baseDate = new Date(`${date}T00:00:00`);
  const dayOfWeek = baseDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startDate = new Date(baseDate);
  const endDate = new Date(baseDate);

  startDate.setDate(baseDate.getDate() + mondayOffset);
  endDate.setDate(startDate.getDate() + 6);

  return {
    startOfWeek: formatDateInput(startDate),
    endOfWeek: formatDateInput(endDate),
  };
}

function getDateAfter(date: string, days: number) {
  const nextDate = new Date(`${date}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + days);
  return formatDateInput(nextDate);
}

function parseDateInput(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getAnalyticsPresetRange(period: Exclude<AnalyticsPeriod, "custom">) {
  const today = new Date();
  const endDate = formatDateInput(today);

  if (period === "week") {
    const { startOfWeek } = getThisWeekRange(endDate);
    return { startDate: startOfWeek, endDate };
  }

  if (period === "quarter") {
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - 2);
    startDate.setDate(1);
    return { startDate: formatDateInput(startDate), endDate };
  }

  const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  return { startDate: formatDateInput(startDate), endDate };
}

function getDateOnly(date: string | null) {
  return date ? date.slice(0, 10) : null;
}

function isDateInRange(date: string | null, range: AnalyticsRange) {
  const dateOnly = getDateOnly(date);
  return (
    dateOnly !== null &&
    dateOnly >= range.startDate &&
    dateOnly <= range.endDate
  );
}

function getDateRangeDays(range: AnalyticsRange) {
  const startDate = parseDateInput(range.startDate);
  const endDate = parseDateInput(range.endDate);
  const diff = endDate.getTime() - startDate.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
}

function formatShortDate(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function getProjectEndDate(project: Project) {
  return project.end_date || project.completion_due_date;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [shipments, setShipments] = useState<MorningBriefShipment[]>([]);
  const [recentProjects, setRecentProjects] = useState<ProjectWithProgress[]>([]);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserName, setCurrentUserName] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [expandedTeamAssignee, setExpandedTeamAssignee] = useState<string | null>(
    null
  );
  const defaultAnalyticsRange = getAnalyticsPresetRange("month");
  const [analyticsPeriod, setAnalyticsPeriod] =
    useState<AnalyticsPeriod>("month");
  const [analyticsStartDate, setAnalyticsStartDate] = useState(
    defaultAnalyticsRange.startDate
  );
  const [analyticsEndDate, setAnalyticsEndDate] = useState(
    defaultAnalyticsRange.endDate
  );
  const [appliedAnalyticsRange, setAppliedAnalyticsRange] =
    useState<AnalyticsRange>(defaultAnalyticsRange);
  const [analyticsDateError, setAnalyticsDateError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowAllActivities(
        window.localStorage.getItem(DASHBOARD_ACTIVITY_EXPANDED_KEY) === "true"
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      // eslint-disable-next-line react-hooks/immutability
      void loadCurrentUser();
      // eslint-disable-next-line react-hooks/immutability
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function refreshAfterBulkChange() {
      void loadDashboard();
    }
    window.addEventListener(TASKS_BULK_CHANGED_EVENT, refreshAfterBulkChange);
    return () =>
      window.removeEventListener(
        TASKS_BULK_CHANGED_EVENT,
        refreshAfterBulkChange
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleTaskUpdated(event: Event) {
      const updatedTask = (
        event as CustomEvent<{ task: TaskDetailData }>
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

  useEffect(() => {
    function handleTaskCompleted(event: Event) {
      const taskId = (
        event as CustomEvent<{ taskId: number }>
      ).detail.taskId;
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: "completed",
                completed_date: getLocalDateString(),
              }
            : task
        )
      );
    }

    window.addEventListener("dashboard:task-completed", handleTaskCompleted);
    return () =>
      window.removeEventListener(
        "dashboard:task-completed",
        handleTaskCompleted
      );
  }, []);

  function getToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function getDaysLeft(date: string | null) {
    if (!date) return null;

    const today = new Date(getToday());
    const dueDate = new Date(date);
    const diff = dueDate.getTime() - today.getTime();

    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function getDueStatus(project: Project) {
    if (isProjectCompleted(project.status)) return "완료";

    const endDate = getProjectEndDate(project);

    if (!endDate) return "미정";

    const daysLeft = getDaysLeft(endDate);

    if (daysLeft === null) return "미정";
    if (daysLeft < 0) return "지연";
    if (daysLeft <= 7) return "임박";

    return "정상";
  }

  function isDelayedProject(project: Project) {
    if (isProjectCompleted(project.status)) return false;

    const endDate = getProjectEndDate(project);
    const daysLeft = getDaysLeft(endDate);

    return daysLeft !== null && daysLeft < 0;
  }

  function getProjectName(projectId: number) {
    const project = projects.find((item) => item.id === projectId);
    return project?.project_name || "-";
  }

  function isShipmentTask(task: Task) {
    return (task.task_type || "").includes("출고");
  }

  async function loadCurrentUser() {
    const employee = await getCurrentEmployee();

    if (!employee) return;

    setCurrentUserName(employee.name);
    setCurrentUserRole(employee.role || "");
  }

  async function loadDashboard() {
    setIsLoading(true);

    const [projectResult, taskResult, shipmentResult] = await Promise.all([
      supabase
        .from("projects")
        .select("*")
        .order("id", { ascending: false }),
      supabase
        .from("tasks")
        .select(
          "id, project_id, task_name, task_type, assignee, status, start_date, due_date, completed_date, created_at"
        ),
      supabase
        .from("shipments")
        .select(
          "id, project_id, site_name, item_name, shipment_date, status"
        ),
    ]);

    const { data: projectData, error: projectError } = projectResult;
    const { data: taskData, error: taskError } = taskResult;
    const { data: shipmentData } = shipmentResult;

    if (projectError) {
      alert(projectError.message);
      setIsLoading(false);
      return;
    }

    if (taskError) {
      alert(taskError.message);
      setIsLoading(false);
      return;
    }

    const loadedProjects = projectData || [];
    const loadedTasks = taskData || [];

    setProjects(loadedProjects);
    setTasks(loadedTasks);
    setShipments(shipmentData || []);

    const projectsWithProgress = loadedProjects.slice(0, 10).map((project) => {
      const projectTasks = loadedTasks.filter(
        (task) => task.project_id === project.id
      );

      const completedTasks = projectTasks.filter(
        (task) => isTaskCompleted(task.status)
      );

      const progress =
        projectTasks.length > 0
          ? Math.round((completedTasks.length / projectTasks.length) * 100)
          : 0;

      return {
        ...project,
        progress,
        dueStatus: getDueStatus(project),
      };
    });

    setRecentProjects(projectsWithProgress);
    setIsLoading(false);
  }

  function getStatusBadgeVariant(status: string): BadgeVariant {
    if (status === "완료") {
      return "success";
    }

    if (status === "진행중") {
      return "info";
    }

    if (status === "지연") {
      return "danger";
    }

    if (status === "임박") {
      return "warning";
    }

    return "default";
  }

  function handleAnalyticsPeriodChange(period: AnalyticsPeriod) {
    setAnalyticsPeriod(period);
    setAnalyticsDateError("");

    if (period === "custom") return;

    const nextRange = getAnalyticsPresetRange(period);
    setAnalyticsStartDate(nextRange.startDate);
    setAnalyticsEndDate(nextRange.endDate);
    setAppliedAnalyticsRange(nextRange);
  }

  function applyCustomAnalyticsRange() {
    if (!analyticsStartDate || !analyticsEndDate) {
      setAnalyticsDateError("시작일과 종료일을 모두 선택하세요.");
      return;
    }

    if (analyticsStartDate > analyticsEndDate) {
      setAnalyticsDateError("시작일은 종료일보다 늦을 수 없습니다.");
      return;
    }

    setAnalyticsDateError("");
    setAppliedAnalyticsRange({
      startDate: analyticsStartDate,
      endDate: analyticsEndDate,
    });
  }

  const today = getToday();

  const totalProjects = projects.length;
  const activeProjects = projects.filter((project) =>
    isProjectInProgress(project.status)
  ).length;
  const completedProjects = projects.filter((project) =>
    isProjectCompleted(project.status)
  ).length;
  const delayedProjects = projects.filter((project) =>
    isDelayedProject(project)
  ).length;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) =>
    isTaskCompleted(task.status)
  ).length;
  const activeTasks = tasks.filter((task) =>
    isTaskInProgress(task.status)
  ).length;

  const totalProgress =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const todayTaskItems = tasks.filter((task) => task.due_date === today);
  const todayOpenTaskItems = todayTaskItems.filter(
    (task) => !isTaskCompleted(task.status)
  );
  const todayDueTasks = todayOpenTaskItems.length;

  const delayedTaskItems = tasks.filter(
    (task) =>
      !isTaskCompleted(task.status) &&
      task.due_date !== null &&
      task.due_date < today
  );
  const delayedTasks = delayedTaskItems.length;
  const { endOfWeek } = getThisWeekRange(today);
  const thisWeekTaskItems = tasks.filter(
    (task) =>
      !isTaskCompleted(task.status) &&
      task.due_date !== null &&
      task.due_date > today &&
      task.due_date <= endOfWeek
  );
  const thisWeekTaskIds = new Set(thisWeekTaskItems.map((task) => task.id));

  const tomorrow = getDateAfter(today, 1);
  const myTasks = tasks.filter(
    (task) =>
      task.assignee === currentUserName && !isTaskCompleted(task.status)
  );
  const myTasksWithProject: MyWorkTask[] = myTasks.map((task) => ({
    ...task,
    projectName: getProjectName(task.project_id),
  }));
  const sortPlannerTasks = (items: MyWorkTask[]) =>
    [...items].sort((a, b) => {
      const dateCompare = (a.due_date || a.start_date || "").localeCompare(
        b.due_date || b.start_date || ""
      );
      return dateCompare || (a.task_name || "").localeCompare(b.task_name || "");
    });
  const myTodayDueTasks = sortPlannerTasks(
    myTasksWithProject.filter(
      (task) => task.start_date === today || task.due_date === today
    )
  );
  const myTomorrowTasks = sortPlannerTasks(
    myTasksWithProject.filter(
      (task) => task.start_date === tomorrow || task.due_date === tomorrow
    )
  );
  const myThisWeekTasks = sortPlannerTasks(
    myTasksWithProject.filter(
      (task) =>
        task.start_date !== today &&
        task.due_date !== today &&
        task.start_date !== tomorrow &&
        task.due_date !== tomorrow &&
        ((task.start_date !== null &&
          task.start_date > tomorrow &&
          task.start_date <= endOfWeek) ||
          (task.due_date !== null &&
            task.due_date > tomorrow &&
            task.due_date <= endOfWeek))
    )
  );
  const myWorkSummary = {
    myTasks: myTasksWithProject,
    myTodayDueTasks,
    myTomorrowTasks,
    myThisWeekTasks,
  };
  const myWorkSections = [
    {
      title: "오늘",
      tasks: myWorkSummary.myTodayDueTasks,
      accentClass: "text-orange-600",
      getDetail: (task: MyWorkTask) =>
        task.start_date === today && task.due_date !== today
          ? "오늘 시작 · 시간 미지정"
          : "오늘 마감 · 시간 미지정",
    },
    {
      title: "내일",
      tasks: myWorkSummary.myTomorrowTasks,
      accentClass: "text-blue-600",
      getDetail: (task: MyWorkTask) =>
        `${task.start_date === tomorrow ? "시작" : "마감"} ${tomorrow}`,
    },
    {
      title: "이번 주",
      tasks: myWorkSummary.myThisWeekTasks,
      accentClass: "text-emerald-600",
      getDetail: (task: MyWorkTask) =>
        `일정 ${task.due_date || task.start_date || "-"}`,
    },
  ];

  const adminTeamTasks = tasks.filter((task) => Boolean(task.assignee));
  const teamWorkspaceSourceTasks =
    currentUserRole === "admin"
      ? adminTeamTasks
      : todayTaskItems.filter((task) => task.assignee === currentUserName);
  const teamWorkspaceGrouped = teamWorkspaceSourceTasks.reduce<
    Record<string, Task[]>
  >((grouped, task) => {
    const assignee = task.assignee || "미지정";

    if (!grouped[assignee]) {
      grouped[assignee] = [];
    }

    grouped[assignee].push(task);
    return grouped;
  }, {});
  const teamWorkspace: TeamWorkspaceMember[] = Object.entries(
    teamWorkspaceGrouped
  ).map(([assignee, assigneeTasks]) => {
    const delayedTeamTasks = assigneeTasks
      .filter(
        (task) =>
          !isTaskCompleted(task.status) &&
          task.due_date !== null &&
          task.due_date < today
      )
      .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
    const todayDueTeamTasks = assigneeTasks
      .filter((task) => !isTaskCompleted(task.status) && task.due_date === today)
      .sort((a, b) => (a.task_name || "").localeCompare(b.task_name || ""));
    const todayTeamTasks = assigneeTasks.filter(
      (task) => !isTaskCompleted(task.status) && task.due_date === today
    );
    const thisWeekDueTeamTasks = assigneeTasks
      .filter((task) => thisWeekTaskIds.has(task.id))
      .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
    const inProgressTeamTasks = assigneeTasks
      .filter((task) => isTaskInProgress(task.status))
      .sort((a, b) => {
        if (a.due_date && !b.due_date) return -1;
        if (!a.due_date && b.due_date) return 1;
        return (a.due_date || "").localeCompare(b.due_date || "");
      });
    const representativeTasks = [
      ...delayedTeamTasks,
      ...todayDueTeamTasks,
      ...thisWeekDueTeamTasks,
      ...inProgressTeamTasks,
    ]
      .filter(
        (task, index, allTasks) =>
          allTasks.findIndex((item) => item.id === task.id) === index
      )
      .slice(0, 3)
      .map((task) => ({
        id: task.id,
        project_id: task.project_id,
        project_name: getProjectName(task.project_id),
        task_name: task.task_name,
        due_date: task.due_date,
        status: task.status,
      }));

    return {
      assignee,
      totalCount: assigneeTasks.length,
      pendingCount: assigneeTasks.filter((task) => isTaskPending(task.status))
        .length,
      inProgressCount: inProgressTeamTasks.length,
      completedCount: assigneeTasks.filter((task) =>
        isTaskCompleted(task.status)
      ).length,
      openCount: assigneeTasks.filter((task) => !isTaskCompleted(task.status))
        .length,
      delayedCount: delayedTeamTasks.length,
      todayCount: todayTeamTasks.length,
      thisWeekDueCount: thisWeekDueTeamTasks.length,
      representativeTasks,
    };
  });

  const adminWorkloadRows = teamWorkspace
    .map((member) => {
      const memberTasks = teamWorkspaceGrouped[member.assignee] || [];

      return {
        ...member,
        totalCount: memberTasks.length,
      };
    })
    .sort((a, b) => {
      if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
      return a.assignee.localeCompare(b.assignee);
    });
  const visibleAdminWorkloadRows = adminWorkloadRows.slice(0, 8);
  const hiddenAdminWorkloadCount = Math.max(adminWorkloadRows.length - 8, 0);
  const maxAdminWorkloadCount = Math.max(
    ...visibleAdminWorkloadRows.map((member) => member.totalCount),
    1
  );

  const vendorStats = Object.values(
    projects.reduce<
      Record<
        string,
        {
          vendor: string;
          totalCount: number;
          activeCount: number;
          delayedCount: number;
          isUnassigned: boolean;
        }
      >
    >((grouped, project) => {
      const vendor = project.assembly_vendor?.trim() || "미지정";

      if (!grouped[vendor]) {
        grouped[vendor] = {
          vendor,
          totalCount: 0,
          activeCount: 0,
          delayedCount: 0,
          isUnassigned: vendor === "미지정",
        };
      }

      grouped[vendor].totalCount += 1;
      grouped[vendor].activeCount += isProjectInProgress(project.status) ? 1 : 0;
      grouped[vendor].delayedCount += isDelayedProject(project) ? 1 : 0;

      return grouped;
    }, {})
  ).sort((a, b) => {
    if (a.isUnassigned !== b.isUnassigned) return a.isUnassigned ? 1 : -1;
    if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
    return a.vendor.localeCompare(b.vendor);
  });
  const visibleVendorStats = vendorStats.slice(0, 6);
  const hiddenVendorCount = Math.max(vendorStats.length - 6, 0);

  const delayedProjectRows = projects
    .map((project) => {
      const projectDelayedTasks = delayedTaskItems.filter(
        (task) => task.project_id === project.id
      );
      const oldestDelayedDays = projectDelayedTasks.reduce((maxDays, task) => {
        const daysLeft = getDaysLeft(task.due_date);
        const delayedDays = daysLeft !== null ? Math.abs(daysLeft) : 0;

        return Math.max(maxDays, delayedDays);
      }, 0);

      return {
        project,
        delayedTaskCount: projectDelayedTasks.length,
        oldestDelayedDays,
      };
    })
    .filter((row) => row.delayedTaskCount > 0)
    .sort((a, b) => {
      if (b.oldestDelayedDays !== a.oldestDelayedDays) {
        return b.oldestDelayedDays - a.oldestDelayedDays;
      }

      return b.delayedTaskCount - a.delayedTaskCount;
    })
    .slice(0, 5);

  const projectShipmentStatuses = projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.project_id === project.id);
    const shipmentTasks = projectTasks.filter(isShipmentTask);

    if (shipmentTasks.length === 0) return "none";

    const hasCompletedShipmentTask = shipmentTasks.some((task) =>
      isTaskCompleted(task.status)
    );

    if (hasCompletedShipmentTask) return "completed";

    const prerequisiteTasks = projectTasks.filter((task) => !isShipmentTask(task));
    const isReadyForShipment =
      prerequisiteTasks.length > 0 &&
      prerequisiteTasks.every((task) => isTaskCompleted(task.status));

    return isReadyForShipment ? "waiting" : "none";
  });
  const completedShipments = projectShipmentStatuses.filter(
    (status) => status === "completed"
  ).length;
  const waitingShipments = projectShipmentStatuses.filter(
    (status) => status === "waiting"
  ).length;

  const getProjectProgressValue = (projectId: number) => {
    const projectTasks = tasks.filter((task) => task.project_id === projectId);
    if (projectTasks.length === 0) return 0;

    const projectCompletedTasks = projectTasks.filter((task) =>
      isTaskCompleted(task.status)
    );
    return Math.round((projectCompletedTasks.length / projectTasks.length) * 100);
  };

  const periodNewProjects = projects.filter((project) =>
    isDateInRange(project.created_at, appliedAnalyticsRange)
  );
  const periodCompletedTasks = tasks.filter(
    (task) =>
      isTaskCompleted(task.status) &&
      isDateInRange(task.completed_date, appliedAnalyticsRange)
  );
  const periodDelayedTasks = tasks.filter(
    (task) =>
      !isTaskCompleted(task.status) &&
      task.due_date !== null &&
      task.due_date < today &&
      isDateInRange(task.due_date, appliedAnalyticsRange)
  );
  const periodShipmentCompletedProjectIds = new Set(
    tasks
      .filter(
        (task) =>
          isShipmentTask(task) &&
          isTaskCompleted(task.status) &&
          isDateInRange(task.completed_date, appliedAnalyticsRange)
      )
      .map((task) => task.project_id)
  );

  const periodAssigneeRows = Object.values(
    tasks.reduce<
      Record<
        string,
        {
          assignee: string;
          completedCount: number;
          delayedCount: number;
          dueCount: number;
          completedDueCount: number;
        }
      >
    >((grouped, task) => {
      const assignee = task.assignee?.trim();
      if (!assignee) return grouped;

      if (!grouped[assignee]) {
        grouped[assignee] = {
          assignee,
          completedCount: 0,
          delayedCount: 0,
          dueCount: 0,
          completedDueCount: 0,
        };
      }

      if (
        isTaskCompleted(task.status) &&
        isDateInRange(task.completed_date, appliedAnalyticsRange)
      ) {
        grouped[assignee].completedCount += 1;
      }

      if (
        !isTaskCompleted(task.status) &&
        task.due_date !== null &&
        task.due_date < today
      ) {
        grouped[assignee].delayedCount += 1;
      }

      if (isDateInRange(task.due_date, appliedAnalyticsRange)) {
        grouped[assignee].dueCount += 1;
        grouped[assignee].completedDueCount += isTaskCompleted(task.status)
          ? 1
          : 0;
      }

      return grouped;
    }, {})
  )
    .map((row) => ({
      ...row,
      completionRate:
        row.dueCount > 0 ? Math.round((row.completedDueCount / row.dueCount) * 100) : 0,
    }))
    .filter(
      (row) =>
        row.completedCount > 0 || row.delayedCount > 0 || row.dueCount > 0
    )
    .sort((a, b) => {
      if (b.completedCount !== a.completedCount) {
        return b.completedCount - a.completedCount;
      }
      if (b.completionRate !== a.completionRate) {
        return b.completionRate - a.completionRate;
      }
      return a.assignee.localeCompare(b.assignee);
    })
    .slice(0, 8);

  const buildProjectGroupRows = (
    getGroupName: (project: Project) => string | null,
    isVendorGroup = false
  ) =>
    Object.values(
      projects.reduce<
        Record<
          string,
          {
            name: string;
            totalCount: number;
            activeCount: number;
            delayedCount: number;
            progressTotal: number;
            newCount: number;
            shipmentCompletedCount: number;
            isUnassigned: boolean;
          }
        >
      >((grouped, project) => {
        const name = getGroupName(project)?.trim() || "미지정";

        if (!grouped[name]) {
          grouped[name] = {
            name,
            totalCount: 0,
            activeCount: 0,
            delayedCount: 0,
            progressTotal: 0,
            newCount: 0,
            shipmentCompletedCount: 0,
            isUnassigned: name === "미지정",
          };
        }

        grouped[name].totalCount += 1;
        grouped[name].activeCount += isProjectInProgress(project.status) ? 1 : 0;
        grouped[name].delayedCount += isDelayedProject(project) ? 1 : 0;
        grouped[name].progressTotal += getProjectProgressValue(project.id);
        grouped[name].newCount += isDateInRange(
          project.created_at,
          appliedAnalyticsRange
        )
          ? 1
          : 0;
        grouped[name].shipmentCompletedCount +=
          isVendorGroup && periodShipmentCompletedProjectIds.has(project.id)
            ? 1
            : 0;

        return grouped;
      }, {})
    )
      .map((row) => ({
        ...row,
        averageProgress:
          row.totalCount > 0 ? Math.round(row.progressTotal / row.totalCount) : 0,
      }))
      .sort((a, b) => {
        if (a.isUnassigned !== b.isUnassigned) return a.isUnassigned ? 1 : -1;
        if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 6);

  const salespersonAnalyticsRows = buildProjectGroupRows(
    (project) => project.salesperson
  );
  const vendorAnalyticsRows = buildProjectGroupRows(
    (project) => project.assembly_vendor,
    true
  );

  const trendUsesDailyBuckets = getDateRangeDays(appliedAnalyticsRange) <= 31;
  const trendRows = (() => {
    const rows: {
      key: string;
      label: string;
      completedCount: number;
      delayedCount: number;
    }[] = [];
    let currentStart = parseDateInput(appliedAnalyticsRange.startDate);
    const rangeEnd = parseDateInput(appliedAnalyticsRange.endDate);

    while (currentStart <= rangeEnd) {
      const bucketStart = formatDateInput(currentStart);
      const currentEnd = trendUsesDailyBuckets
        ? currentStart
        : addDays(currentStart, 6);
      const bucketEndDate = currentEnd > rangeEnd ? rangeEnd : currentEnd;
      const bucketEnd = formatDateInput(bucketEndDate);

      rows.push({
        key: bucketStart,
        label: trendUsesDailyBuckets
          ? formatShortDate(bucketStart)
          : `${formatShortDate(bucketStart)}-${formatShortDate(bucketEnd)}`,
        completedCount: periodCompletedTasks.filter((task) =>
          isDateInRange(task.completed_date, {
            startDate: bucketStart,
            endDate: bucketEnd,
          })
        ).length,
        delayedCount: periodDelayedTasks.filter((task) =>
          isDateInRange(task.due_date, {
            startDate: bucketStart,
            endDate: bucketEnd,
          })
        ).length,
      });

      currentStart = addDays(bucketEndDate, 1);
    }

    return rows;
  })();
  const maxTrendCount = Math.max(
    ...trendRows.map((row) => Math.max(row.completedCount, row.delayedCount)),
    1
  );
  const hasPeriodAnalyticsData =
    periodNewProjects.length > 0 ||
    periodCompletedTasks.length > 0 ||
    periodDelayedTasks.length > 0 ||
    periodShipmentCompletedProjectIds.size > 0;
  const analyticsPeriodOptions: { value: AnalyticsPeriod; label: string }[] = [
    { value: "week", label: "이번 주" },
    { value: "month", label: "이번 달" },
    { value: "quarter", label: "최근 3개월" },
    { value: "custom", label: "직접 선택" },
  ];

  const searchedProjects = recentProjects.filter((project) => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) return true;

    return (
      project.project_name.toLowerCase().includes(keyword) ||
      (project.project_code || "").toLowerCase().includes(keyword) ||
      project.process_type.toLowerCase().includes(keyword) ||
      (project.task_manager || "").toLowerCase().includes(keyword)
    );
  });
  const morningBriefTasks = tasks.map((task) => ({
    ...task,
    projectName: getProjectName(task.project_id),
  }));

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-5 text-slate-900 lg:px-8">
      <MorningBrief
        tasks={morningBriefTasks}
        shipments={shipments}
        currentUserName={currentUserName}
        currentUserRole={currentUserRole}
        isLoading={isLoading}
        onTaskCompleted={(taskId) => {
          setTasks((current) =>
            current.map((task) =>
              task.id === taskId
                ? { ...task, status: "completed", completed_date: today }
                : task
            )
          );
        }}
      />

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Search className="text-slate-400" size={20} />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="프로젝트명, 코드, 공정, 담당자로 검색"
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {isLoading ? (
        <div role="status" aria-label="대시보드를 불러오는 중" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Skeleton className="h-16" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          <MyWorkspaceRecent />
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Link
              href="/projects"
              role="button"
              tabIndex={0}
              title="전체 프로젝트 보기"
              onKeyDown={handleKpiKeyDown}
              style={{ animationDelay: "0ms" }}
              className="group kpi-enter relative h-24 cursor-pointer rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">전체 프로젝트</p>
                  <p className="mt-0.5 text-3xl font-bold tracking-tight text-slate-950">{totalProjects}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <FolderKanban size={18} />
                </div>
              </div>
              <span className="absolute bottom-2 right-3 text-slate-400 opacity-40 transition-opacity group-hover:opacity-100">
                <ChevronRight size={14} aria-hidden="true" />
              </span>
            </Link>

            <Link
              href="/projects?status=in_progress"
              role="button"
              tabIndex={0}
              title="진행중 프로젝트 보기"
              onKeyDown={handleKpiKeyDown}
              style={{ animationDelay: "30ms" }}
              className="group kpi-enter relative h-24 cursor-pointer rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">진행중 프로젝트</p>
                  <p className="mt-0.5 text-3xl font-bold tracking-tight text-blue-600">
                    {activeProjects}
                  </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Clock size={18} />
                </div>
              </div>
              <span className="absolute bottom-2 right-3 text-slate-400 opacity-40 transition-opacity group-hover:opacity-100">
                <ChevronRight size={14} aria-hidden="true" />
              </span>
            </Link>

            <Link
              href="/projects?status=completed"
              role="button"
              tabIndex={0}
              title="완료 프로젝트 보기"
              onKeyDown={handleKpiKeyDown}
              style={{ animationDelay: "60ms" }}
              className="group kpi-enter relative h-24 cursor-pointer rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">완료 프로젝트</p>
                  <p className="mt-0.5 text-3xl font-bold tracking-tight text-emerald-600">
                    {completedProjects}
                  </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 size={18} />
                </div>
              </div>
              <span className="absolute bottom-2 right-3 text-slate-400 opacity-40 transition-opacity group-hover:opacity-100">
                <ChevronRight size={14} aria-hidden="true" />
              </span>
            </Link>

            <Link
              href="/projects?status=delayed"
              role="button"
              tabIndex={0}
              title="지연 프로젝트 보기"
              onKeyDown={handleKpiKeyDown}
              style={{ animationDelay: "90ms" }}
              className="group kpi-enter relative h-24 cursor-pointer rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-red-200"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">지연 프로젝트</p>
                  <p className="mt-0.5 text-3xl font-bold tracking-tight text-red-600">
                    {delayedProjects}
                  </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <AlertTriangle size={18} />
                </div>
              </div>
              <span className="absolute bottom-2 right-3 text-slate-400 opacity-40 transition-opacity group-hover:opacity-100">
                <ChevronRight size={14} aria-hidden="true" />
              </span>
            </Link>

            <div className="kpi-enter h-24 rounded-2xl border border-slate-300 bg-slate-100 p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-xs font-medium leading-4 text-slate-500">전체 진행률</p>
              <p className="text-xl font-bold leading-6 tracking-tight text-blue-700">
                {totalProgress}%
              </p>
              <ProgressBar
                percent={totalProgress}
                className="mt-1 h-1.5 w-full !bg-slate-300"
                barClassName={`h-1.5 ${
                  totalProgress <= 30
                    ? "!bg-red-600"
                    : totalProgress <= 70
                      ? "!bg-amber-600"
                      : "!bg-emerald-600"
                }`}
              />
              <p className="mt-1 text-[11px] leading-3 text-slate-500">
                완료 {completedTasks}건 / 전체 {totalTasks}건
              </p>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Link
              href="/tasks?filter=today"
              role="button"
              tabIndex={0}
              title="오늘 업무 보기"
              onKeyDown={handleKpiKeyDown}
              style={{ animationDelay: "120ms" }}
              className="group kpi-enter relative min-h-24 cursor-pointer rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-orange-200"
            >
              <p className="text-xs font-medium text-slate-500">오늘 마감 업무</p>
              <p className="mt-0.5 text-2xl font-bold tracking-tight text-orange-600">
                {todayDueTasks}
              </p>
              <span className="absolute bottom-2 right-3 text-slate-400 opacity-40 transition-opacity group-hover:opacity-100">
                <ChevronRight size={14} aria-hidden="true" />
              </span>
            </Link>

            <Link
              href="/tasks?status=delayed"
              role="button"
              tabIndex={0}
              title="지연 업무 보기"
              onKeyDown={handleKpiKeyDown}
              style={{ animationDelay: "150ms" }}
              className="group kpi-enter relative min-h-24 cursor-pointer rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-red-200"
            >
              <p className="text-xs font-medium text-slate-500">지연 업무</p>
              <p className="mt-0.5 text-2xl font-bold tracking-tight text-red-600">
                {delayedTasks}
              </p>
              <span className="absolute bottom-2 right-3 text-slate-400 opacity-40 transition-opacity group-hover:opacity-100">
                <ChevronRight size={14} aria-hidden="true" />
              </span>
            </Link>

            <Link
              href="/tasks?status=in_progress"
              role="button"
              tabIndex={0}
              title="진행중 업무 보기"
              onKeyDown={handleKpiKeyDown}
              style={{ animationDelay: "180ms" }}
              className="group kpi-enter relative min-h-24 cursor-pointer rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <p className="text-xs font-medium text-slate-500">진행중 업무</p>
              <p className="mt-0.5 text-2xl font-bold tracking-tight text-blue-600">
                {activeTasks}
              </p>
              <span className="absolute bottom-2 right-3 text-slate-400 opacity-40 transition-opacity group-hover:opacity-100">
                <ChevronRight size={14} aria-hidden="true" />
              </span>
            </Link>

            <Link
              href="/shipments?status=pending"
              role="button"
              tabIndex={0}
              title="출고 대기 보기"
              onKeyDown={handleKpiKeyDown}
              style={{ animationDelay: "210ms" }}
              className="group kpi-enter relative min-h-24 cursor-pointer rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-orange-200"
            >
              <p className="text-xs font-medium text-slate-500">출고대기</p>
              <div className="mt-1 flex items-center gap-3">
                <Truck className="text-orange-500" size={16} />
                <p className="text-2xl font-bold tracking-tight text-orange-600">
                  {waitingShipments}
                </p>
              </div>
              <span className="absolute bottom-2 right-3 text-slate-400 opacity-40 transition-opacity group-hover:opacity-100">
                <ChevronRight size={14} aria-hidden="true" />
              </span>
            </Link>

            <div className="min-h-24 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <p className="text-xs font-medium text-slate-500">출고완료</p>
              <div className="mt-1 flex items-center gap-3">
                <CheckCircle2 className="text-emerald-500" size={16} />
                <p className="text-2xl font-bold tracking-tight text-emerald-600">
                  {completedShipments}
                </p>
              </div>
            </div>
          </div>

          {currentUserRole === "admin" && (
            <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-slate-950">
                    관리자 팀 현황
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    전체 프로젝트와 업무 기준의 팀 KPI입니다.
                  </p>
                </div>
                <Badge variant="info" className="shrink-0">
                  admin
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-slate-900">
                      담당자별 업무량
                    </h3>
                    {hiddenAdminWorkloadCount > 0 && (
                      <span className="text-xs text-slate-400">
                        외 {hiddenAdminWorkloadCount}명
                      </span>
                    )}
                  </div>

                  {visibleAdminWorkloadRows.length > 0 ? (
                    <div className="space-y-3">
                      {visibleAdminWorkloadRows.map((member) => (
                        <div key={member.assignee} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="truncate font-semibold text-slate-700">
                              {member.assignee}
                            </span>
                            <span className="shrink-0 text-slate-500">
                              전체 {member.totalCount} · 대기{" "}
                              {member.pendingCount} · 진행{" "}
                              {member.inProgressCount} · 지연{" "}
                              {member.delayedCount}
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{
                                width: `${Math.max(
                                  (member.totalCount / maxAdminWorkloadCount) *
                                    100,
                                  4
                                )}%`,
                              }}
                            />
                          </div>
                          <p className="text-xs text-slate-400">
                            오늘 {member.todayCount} · 이번 주{" "}
                            {member.thisWeekDueCount} · 완료{" "}
                            {member.completedCount}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      message="표시할 담당자 업무가 없습니다."
                      className="rounded-xl bg-white p-5 text-center text-sm text-slate-500"
                    />
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-slate-900">
                        조립처별 프로젝트
                      </h3>
                      {hiddenVendorCount > 0 && (
                        <span className="text-xs text-slate-400">
                          외 {hiddenVendorCount}곳
                        </span>
                      )}
                    </div>

                    {visibleVendorStats.length > 0 ? (
                      <div className="space-y-2">
                        {visibleVendorStats.map((vendor) => (
                          <div
                            key={vendor.vendor}
                            className="rounded-xl bg-white p-3 text-sm"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate font-semibold text-slate-800">
                                {vendor.vendor}
                              </span>
                              <span className="shrink-0 font-bold text-slate-950">
                                {vendor.totalCount}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              진행중 {vendor.activeCount} · 지연{" "}
                              {vendor.delayedCount}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        message="조립처 정보가 등록된 프로젝트가 없습니다."
                        className="rounded-xl bg-white p-5 text-center text-sm text-slate-500"
                      />
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="mb-3 text-sm font-bold text-slate-900">
                      지연 프로젝트
                    </h3>

                    {delayedProjectRows.length > 0 ? (
                      <div className="space-y-2">
                        {delayedProjectRows.map((row) => (
                          <Link
                            key={row.project.id}
                            href={`/projects/${row.project.id}`}
                            className="block rounded-xl bg-white p-3 text-sm transition-colors hover:bg-blue-50"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate font-semibold text-blue-700">
                                {row.project.project_name}
                              </span>
                              <span className="shrink-0 text-xs font-bold text-red-600">
                                {row.oldestDelayedDays}일
                              </span>
                            </div>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              조립처 {row.project.assembly_vendor || "미지정"} ·
                              지연 업무 {row.delayedTaskCount}건 · 담당{" "}
                              {row.project.task_manager ||
                                row.project.salesperson ||
                                "-"}
                            </p>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        message="지연 중인 프로젝트가 없습니다."
                        className="rounded-xl bg-white p-5 text-center text-sm text-slate-500"
                      />
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {currentUserRole === "admin" && (
            <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold tracking-tight text-slate-950">
                      관리자 기간 분석
                    </h2>
                    <Badge variant="info">기간</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    선택 기간 실적만 따로 집계합니다. 기존 KPI와 TEAM WORKSPACE
                    범위는 변경하지 않습니다.
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    적용 기간 {appliedAnalyticsRange.startDate} ~{" "}
                    {appliedAnalyticsRange.endDate}
                  </p>
                </div>

                <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap gap-2">
                    {analyticsPeriodOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleAnalyticsPeriodChange(option.value)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                          analyticsPeriod === option.value
                            ? "bg-blue-600 text-white"
                            : "bg-white text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {analyticsPeriod === "custom" && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="date"
                        value={analyticsStartDate}
                        onChange={(event) =>
                          setAnalyticsStartDate(event.target.value)
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-300"
                      />
                      <span className="hidden text-xs text-slate-400 sm:inline">
                        ~
                      </span>
                      <input
                        type="date"
                        value={analyticsEndDate}
                        onChange={(event) =>
                          setAnalyticsEndDate(event.target.value)
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-300"
                      />
                      <button
                        type="button"
                        onClick={applyCustomAnalyticsRange}
                        className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
                      >
                        적용
                      </button>
                    </div>
                  )}

                  {analyticsDateError && (
                    <p className="text-xs font-medium text-red-600">
                      {analyticsDateError}
                    </p>
                  )}
                </div>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-500">
                    신규 프로젝트
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">
                    {periodNewProjects.length}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    projects.created_at 기준
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-500">완료 업무</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-600">
                    {periodCompletedTasks.length}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    tasks.completed_date 기준
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-500">
                    지연 발생 업무
                  </p>
                  <p className="mt-1 text-2xl font-bold text-red-600">
                    {periodDelayedTasks.length}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    기간 내 마감 + 현재 미완료
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-500">출고 완료</p>
                  <p className="mt-1 text-2xl font-bold text-blue-600">
                    {periodShipmentCompletedProjectIds.size}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    출고 업무 completed_date 기준
                  </p>
                </div>
              </div>

              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
                프로젝트 완료 시점을 신뢰할 completed_at 또는 상태 변경 이력 컬럼이
                없어, 기간별 완료 프로젝트 분석은 제외했습니다.
              </div>

              {hasPeriodAnalyticsData ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="mb-3 text-sm font-bold text-slate-900">
                      완료/지연 추이
                    </h3>
                    <div className="space-y-3">
                      {trendRows.map((row) => (
                        <div key={row.key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-600">
                              {row.label}
                            </span>
                            <span className="text-slate-400">
                              완료 {row.completedCount} · 지연 {row.delayedCount}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="h-2 overflow-hidden rounded-full bg-white">
                              <div
                                className="h-full rounded-full bg-emerald-500"
                                style={{
                                  width: `${Math.max(
                                    (row.completedCount / maxTrendCount) * 100,
                                    row.completedCount > 0 ? 6 : 0
                                  )}%`,
                                }}
                              />
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-white">
                              <div
                                className="h-full rounded-full bg-red-500"
                                style={{
                                  width: `${Math.max(
                                    (row.delayedCount / maxTrendCount) * 100,
                                    row.delayedCount > 0 ? 6 : 0
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="mb-3 text-sm font-bold text-slate-900">
                      담당자별 기간 실적
                    </h3>
                    {periodAssigneeRows.length > 0 ? (
                      <div className="space-y-3">
                        {periodAssigneeRows.map((member) => (
                          <div
                            key={member.assignee}
                            className="rounded-xl bg-white p-3"
                          >
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <span className="truncate text-sm font-semibold text-slate-800">
                                {member.assignee}
                              </span>
                              <span className="shrink-0 text-xs font-semibold text-blue-600">
                                완료율 {member.dueCount > 0 ? `${member.completionRate}%` : "-"}
                              </span>
                            </div>
                            <ProgressBar
                              percent={member.completionRate}
                              className="h-2 w-full"
                            />
                            <p className="mt-2 text-xs text-slate-500">
                              완료 {member.completedCount} · 현재 지연{" "}
                              {member.delayedCount} · 기간 내 마감{" "}
                              {member.dueCount}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        message="선택한 기간의 담당자 업무 실적이 없습니다."
                        className="rounded-xl bg-white p-5 text-center text-sm text-slate-500"
                      />
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="mb-3 text-sm font-bold text-slate-900">
                      영업자별 프로젝트 현황
                    </h3>
                    <div className="space-y-2">
                      {salespersonAnalyticsRows.map((row) => (
                        <div key={row.name} className="rounded-xl bg-white p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-semibold text-slate-800">
                              {row.name}
                            </span>
                            <span className="shrink-0 text-xs text-slate-500">
                              평균 {row.averageProgress}%
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            전체 {row.totalCount} · 진행 {row.activeCount} · 지연{" "}
                            {row.delayedCount} · 기간 신규 {row.newCount}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="mb-3 text-sm font-bold text-slate-900">
                      조립처별 프로젝트 현황
                    </h3>
                    <div className="space-y-2">
                      {vendorAnalyticsRows.map((row) => (
                        <div key={row.name} className="rounded-xl bg-white p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-semibold text-slate-800">
                              {row.name}
                            </span>
                            <span className="shrink-0 text-xs text-slate-500">
                              평균 {row.averageProgress}%
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            전체 {row.totalCount} · 진행 {row.activeCount} · 지연{" "}
                            {row.delayedCount} · 기간 신규 {row.newCount} · 기간
                            출고완료 {row.shipmentCompletedCount}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  message="선택한 기간에 집계할 데이터가 없습니다."
                  className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500"
                />
              )}
            </section>
          )}

          <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-lg font-bold tracking-tight text-slate-950">
                      DAILY PLANNER
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {`${currentUserName || "-"}님의 오늘·내일·이번 주 일정`}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {myWorkSummary.myTasks.length}건
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-1">
                {myWorkSections.map((section) => (
                  <div
                    key={section.title}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-700">
                        {section.title}
                      </h3>
                      <span className={`text-sm font-bold ${section.accentClass}`}>
                        {section.tasks.length}
                      </span>
                    </div>

                    {section.tasks.length > 0 ? (
                      <div className="space-y-2">
                        {section.tasks.slice(0, 3).map((task) => (
                          <Link
                            key={`${section.title}-${task.id}`}
                            href={`/projects/${task.project_id}`}
                            className="block rounded-xl border border-transparent bg-white p-3 text-sm transition-colors hover:border-blue-100 hover:bg-blue-50"
                          >
                            <div className="truncate text-xs text-slate-500">
                              {task.projectName}
                            </div>
                            <div className="mt-0.5 truncate font-medium text-slate-900">
                              {task.task_name || "-"}
                            </div>
                            <div className={`mt-1 text-xs ${section.accentClass}`}>
                              {section.getDetail(task)}
                            </div>
                          </Link>
                        ))}
                        {section.tasks.length > 3 && (
                          <div className="px-1 text-xs text-slate-400">
                            외 {section.tasks.length - 3}건
                          </div>
                        )}
                      </div>
                    ) : (
                      <EmptyState
                        message={`${section.title} 예정된 업무가 없습니다.`}
                        className="rounded-xl bg-white p-3 text-center text-xs text-slate-400"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    {currentUserRole === "admin" ? (
                      <Users size={18} />
                    ) : (
                      <User size={18} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold tracking-tight text-slate-950">
                      {currentUserRole === "admin" ? "TEAM WORKSPACE" : "WORKSPACE"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {currentUserRole === "admin"
                        ? "팀 전체 업무 현황"
                        : "오늘 나의 업무 현황"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="info" className="px-2.5 py-1">
                    {currentUserRole === "admin" ? "TEAM" : "MY"}
                  </Badge>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {teamWorkspace.length}명
                  </span>
                </div>
              </div>

              {teamWorkspace.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {teamWorkspace.map((member) => {
                    const isExpanded = expandedTeamAssignee === member.assignee;

                    return (
                      <div
                        key={member.assignee}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setExpandedTeamAssignee((currentAssignee) =>
                            currentAssignee === member.assignee
                              ? null
                              : member.assignee
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setExpandedTeamAssignee((currentAssignee) =>
                              currentAssignee === member.assignee
                                ? null
                                : member.assignee
                            );
                          }
                        }}
                        className={`rounded-2xl border p-4 shadow-sm transition duration-200 hover:shadow-md ${
                          isExpanded
                            ? "border-blue-300 bg-blue-50"
                            : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                        }`}
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <UserCheck size={16} className="shrink-0 text-slate-500" />
                            <h3 className="truncate text-sm font-semibold text-slate-800">
                              {member.assignee}
                            </h3>
                          </div>
                          <span className="shrink-0 text-xs text-slate-400">
                            {isExpanded ? "접기" : "펼치기"}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                          <div className="rounded-xl bg-white p-2">
                            <p className="text-slate-500">전체</p>
                            <p className="mt-1 font-bold text-slate-800">
                              {member.totalCount}
                            </p>
                          </div>
                          <div className="rounded-xl bg-white p-2">
                            <p className="text-slate-500">대기</p>
                            <p className="mt-1 font-bold text-slate-600">
                              {member.pendingCount}
                            </p>
                          </div>
                          <div className="rounded-xl bg-white p-2">
                            <p className="text-slate-500">미완료</p>
                            <p className="mt-1 font-bold text-orange-600">
                              {member.openCount}
                            </p>
                          </div>
                          <div className="rounded-xl bg-white p-2">
                            <p className="text-slate-500">오늘</p>
                            <p className="mt-1 font-bold text-orange-600">
                              {member.todayCount}
                            </p>
                          </div>
                          <div className="rounded-xl bg-white p-2">
                            <p className="text-slate-500">진행</p>
                            <p className="mt-1 font-bold text-blue-600">
                              {member.inProgressCount}
                            </p>
                          </div>
                          <div className="rounded-xl bg-white p-2">
                            <p className="text-slate-500">지연</p>
                            <p className="mt-1 font-bold text-red-600">
                              {member.delayedCount}
                            </p>
                          </div>
                          <div className="rounded-xl bg-white p-2">
                            <p className="text-slate-500">이번 주</p>
                            <p className="mt-1 font-bold text-emerald-600">
                              {member.thisWeekDueCount}
                            </p>
                          </div>
                          <div className="rounded-xl bg-white p-2">
                            <p className="text-slate-500">완료</p>
                            <p className="mt-1 font-bold text-emerald-600">
                              {member.completedCount}
                            </p>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                            {member.representativeTasks.length > 0 ? (
                              member.representativeTasks.map((task) => (
                                <Link
                                  key={task.id}
                                  href={`/projects/${task.project_id}`}
                                  onClick={(event) => event.stopPropagation()}
                                  className="block rounded-xl border border-transparent bg-white p-3 text-sm transition-colors hover:border-blue-100 hover:bg-blue-50"
                                >
                                  <div className="truncate text-xs text-slate-500">
                                    {task.project_name}
                                  </div>
                                  <div className="mt-0.5 truncate font-medium text-slate-900">
                                    {task.task_name || "-"}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {task.due_date
                                      ? `일정 ${task.due_date}`
                                      : getTaskStatusLabel(task.status)}
                                  </div>
                                </Link>
                              ))
                            ) : (
                              <EmptyState
                                message="대표 업무 없음"
                                className="rounded-xl bg-white p-3 text-center text-xs text-slate-400"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  message={
                    currentUserRole === "admin"
                      ? "표시할 팀 업무가 없습니다."
                      : "오늘 예정된 업무가 없습니다."
                  }
                  className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500"
                />
              )}
            </div>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-950">최근 프로젝트</h2>
                <p className="mt-1 text-sm text-slate-500">
                  검색 조건에 맞는 최근 프로젝트 현황
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {searchedProjects.length}건
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead>
                  <tr className="border-y border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="px-3 py-2.5 text-left">프로젝트코드</th>
                    <th className="px-3 py-2.5 text-left">프로젝트명</th>
                    <th className="px-3 py-2.5 text-left">공정</th>
                    <th className="px-3 py-2.5 text-left">담당자</th>
                    <th className="px-3 py-2.5 text-left">종료일</th>
                    <th className="px-3 py-2.5 text-left">상태</th>
                    <th className="px-3 py-2.5 text-left">진행률</th>
                  </tr>
                </thead>

                <tbody>
                  {searchedProjects.map((project) => (
                    <tr key={project.id} className="border-b border-slate-100 text-sm text-slate-700 transition-colors hover:bg-slate-50">
                      <td className="px-3 py-2.5 text-slate-500">
                        <Link
                          href={`/projects/${project.id}`}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {project.project_code || "-"}
                        </Link>
                      </td>

                      <td className="max-w-56 px-3 py-2.5">
                        <Link
                          href={`/projects/${project.id}`}
                          className="block truncate font-medium text-blue-600 hover:underline"
                          title={project.project_name}
                        >
                          {project.project_name}
                        </Link>
                      </td>

                      <td className="px-3 py-2.5">{project.process_type}</td>
                      <td className="px-3 py-2.5">{project.task_manager || "-"}</td>
                      <td className="px-3 py-2.5 text-slate-500">
                        {getProjectEndDate(project) || "-"}
                      </td>

                      <td className="px-3 py-2.5">
                        <Badge variant={getStatusBadgeVariant(project.dueStatus)}>
                          {project.dueStatus}
                        </Badge>
                      </td>

                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            percent={project.progress}
                            className="h-1.5 w-20"
                          />
                          <span className="text-sm font-medium">
                            {project.progress}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {searchedProjects.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <EmptyState
                          message="조회된 프로젝트가 없습니다."
                          className="p-8 text-center text-slate-500"
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-4 xl:sticky xl:top-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-slate-950">
                  최근 활동
                </h2>
                <span className="shrink-0 text-xs font-medium text-slate-500">
                  최근 활동 {showAllActivities ? 20 : 2}건
                </span>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                <Clock size={16} />
              </div>
            </div>

            <div
              className={`overflow-hidden transition-[max-height,opacity] duration-200 motion-reduce:transition-none ${
                showAllActivities
                  ? "max-h-[620px] opacity-100"
                  : "max-h-44 opacity-100"
              }`}
            >
              <ActivityTimeline
                limit={showAllActivities ? 20 : 2}
                compact
              />
            </div>
            <div className="mt-2 border-t border-slate-100 pt-2 text-center">
              <button
                type="button"
                aria-expanded={showAllActivities}
                onClick={() => {
                  const nextValue = !showAllActivities;
                  setShowAllActivities(nextValue);
                  window.localStorage.setItem(
                    DASHBOARD_ACTIVITY_EXPANDED_KEY,
                    String(nextValue)
                  );
                }}
                className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                {showAllActivities ? (
                  <>
                    접기 <ChevronUp size={14} />
                  </>
                ) : (
                  <>
                    더 보기 <ChevronDown size={14} />
                  </>
                )}
              </button>
            </div>
          </aside>
          </div>
        </>
      )}
    </div>
  );
}
