import type { PostgrestError } from "@supabase/supabase-js";
import { getCurrentEmployee, type CurrentEmployee } from "@/lib/auth";
import { getProjectFileTypeLabel } from "@/lib/files";
import { supabase } from "@/lib/supabase";
import { getTaskStatusLabel, isTaskCompleted } from "@/lib/status";

export type NotificationSeverity = "danger" | "warning" | "info";
export type NotificationCategory = "task" | "file" | "notice";
export type NotificationType =
  | "task_delayed"
  | "task_today"
  | "task_this_week"
  | "task_assigned"
  | "project_file"
  | "notice";

export type NotificationTask = {
  id: number;
  project_id: number;
  task_name: string | null;
  task_type: string | null;
  assignee: string | null;
  status: string | null;
  due_date: string | null;
};

type NotificationProject = {
  id: number;
  project_name: string;
};

type NotificationProjectFile = {
  id: string | number;
  project_id: string | number;
  file_name: string;
  file_type: string | null;
  uploaded_by: string | null;
  uploaded_by_email: string | null;
  created_at: string | null;
};

type NotificationNotice = {
  id: number;
  title: string;
  description: string;
  date: string;
  author: string | null;
  href: string;
};

export type NotificationItem = {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  description: string;
  date: string | null;
  href: string;
  priority: number;
  severity: NotificationSeverity;
  projectName: string;
  assignee?: string | null;
  taskType?: string | null;
  dueDate?: string | null;
  statusLabel?: string;
  daysDelayed?: number | null;
  fileTypeLabel?: string;
  actor?: string | null;
};

export type NotificationSummary = {
  currentEmployee: CurrentEmployee | null;
  items: NotificationItem[];
  unreadCount: number;
  totalCount: number;
  hiddenCount: number;
  excludedSources: string[];
};

type LoadNotificationSummaryResult = {
  data: NotificationSummary | null;
  error: PostgrestError | Error | null;
};

const MAX_NOTIFICATION_ITEMS = 20;
const RECENT_DAYS = 7;
const STATIC_NOTICE_ROWS: NotificationNotice[] = [
  {
    id: 1,
    title: "공지사항 기능 준비 중",
    description: "공무팀 공지와 전달사항을 이곳에서 관리할 예정입니다.",
    date: "2026-07-06",
    author: null,
    href: "/notices",
  },
];

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getToday() {
  return formatDateInput(new Date());
}

function getRecentCutoffDate() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_DAYS);
  cutoff.setHours(0, 0, 0, 0);

  return formatDateInput(cutoff);
}

function getRecentCutoffIso() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_DAYS);
  cutoff.setHours(0, 0, 0, 0);

  return cutoff.toISOString();
}

function getThisWeekEnd(date: string) {
  const baseDate = new Date(`${date}T00:00:00`);
  const dayOfWeek = baseDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startDate = new Date(baseDate);
  const endDate = new Date(baseDate);

  startDate.setDate(baseDate.getDate() + mondayOffset);
  endDate.setDate(startDate.getDate() + 6);

  return formatDateInput(endDate);
}

function getDaysDelayed(dueDate: string | null, today: string) {
  if (!dueDate || dueDate >= today) return null;

  const dueTime = new Date(`${dueDate}T00:00:00`).getTime();
  const todayTime = new Date(`${today}T00:00:00`).getTime();

  return Math.max(1, Math.ceil((todayTime - dueTime) / (1000 * 60 * 60 * 24)));
}

function getProjectName(
  projects: NotificationProject[],
  projectId: number | string
) {
  const projectIdText = String(projectId);

  return (
    projects.find((project) => String(project.id) === projectIdText)
      ?.project_name || `프로젝트 #${projectIdText}`
  );
}

function toTaskNotificationItem(
  task: NotificationTask,
  projects: NotificationProject[],
  type: Extract<
    NotificationType,
    "task_delayed" | "task_today" | "task_this_week"
  >,
  today: string
): NotificationItem {
  const daysDelayed = getDaysDelayed(task.due_date, today);
  const title =
    type === "task_delayed"
      ? `지연 ${daysDelayed || 1}일`
      : type === "task_today"
        ? "오늘 마감"
        : "이번 주 마감";
  const severity =
    type === "task_delayed"
      ? "danger"
      : type === "task_today"
        ? "warning"
        : "info";

  return {
    id: `task-${type}-${task.id}`,
    type,
    category: "task",
    title,
    description: task.task_name || "-",
    date: task.due_date,
    href: `/projects/${task.project_id}`,
    priority: type === "task_delayed" ? 1 : type === "task_today" ? 2 : 6,
    severity,
    projectName: getProjectName(projects, task.project_id),
    assignee: task.assignee,
    taskType: task.task_type,
    dueDate: task.due_date,
    statusLabel: getTaskStatusLabel(task.status),
    daysDelayed,
  };
}

function toFileNotificationItem(
  file: NotificationProjectFile,
  projects: NotificationProject[]
): NotificationItem {
  return {
    id: `project-file-${file.id}`,
    type: "project_file",
    category: "file",
    title: "새 프로젝트 파일",
    description: file.file_name,
    date: file.created_at,
    href: `/projects/${file.project_id}`,
    priority: 5,
    severity: "info",
    projectName: getProjectName(projects, file.project_id),
    fileTypeLabel: getProjectFileTypeLabel(file.file_type),
    actor: file.uploaded_by || file.uploaded_by_email,
  };
}

function toNoticeNotificationItem(notice: NotificationNotice): NotificationItem {
  return {
    id: `notice-${notice.id}`,
    type: "notice",
    category: "notice",
    title: "새 공지",
    description: notice.title,
    date: notice.date,
    href: notice.href,
    priority: 4,
    severity: "info",
    projectName: notice.description,
    actor: notice.author,
  };
}

function sortByDueDate(a: NotificationTask, b: NotificationTask) {
  return (a.due_date || "").localeCompare(b.due_date || "");
}

function getDateTime(date: string | null) {
  if (!date) return 0;

  const time = new Date(date).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function compareNotifications(a: NotificationItem, b: NotificationItem) {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }

  if (a.type === "task_delayed" || a.type === "task_this_week") {
    return (a.date || "").localeCompare(b.date || "");
  }

  const dateDiff = getDateTime(b.date) - getDateTime(a.date);
  if (dateDiff !== 0) return dateDiff;

  return a.id.localeCompare(b.id);
}

export function calculateNotificationSummary(
  tasks: NotificationTask[],
  projects: NotificationProject[],
  currentEmployee: CurrentEmployee | null,
  projectFiles: NotificationProjectFile[] = [],
  notices: NotificationNotice[] = []
): NotificationSummary {
  const today = getToday();
  const endOfWeek = getThisWeekEnd(today);
  const recentCutoffDate = getRecentCutoffDate();
  const assignedTasks = currentEmployee
    ? tasks.filter((task) => task.assignee === currentEmployee.name)
    : [];

  const delayedTasks = assignedTasks
    .filter(
      (task) =>
        !isTaskCompleted(task.status) &&
        task.due_date !== null &&
        task.due_date < today
    )
    .sort(sortByDueDate);

  const todayDueTasks = assignedTasks.filter(
    (task) => !isTaskCompleted(task.status) && task.due_date === today
  );

  const thisWeekDueTasks = assignedTasks
    .filter(
      (task) =>
        !isTaskCompleted(task.status) &&
        task.due_date !== null &&
        task.due_date > today &&
        task.due_date <= endOfWeek
    )
    .sort(sortByDueDate);

  const recentNotices = notices.filter(
    (notice) => notice.date >= recentCutoffDate && notice.date <= today
  );

  const allItems = [
    ...delayedTasks.map((task) =>
      toTaskNotificationItem(task, projects, "task_delayed", today)
    ),
    ...todayDueTasks.map((task) =>
      toTaskNotificationItem(task, projects, "task_today", today)
    ),
    ...recentNotices.map(toNoticeNotificationItem),
    ...projectFiles.map((file) => toFileNotificationItem(file, projects)),
    ...thisWeekDueTasks.map((task) =>
      toTaskNotificationItem(task, projects, "task_this_week", today)
    ),
  ].sort(compareNotifications);

  const excludedSources = [
    "최근 배정 업무: tasks.created_at은 업무 생성 시각이며 담당자 변경 시각을 보장하지 않아 제외",
  ];

  if (recentNotices.length === 0) {
    excludedSources.push(
      "최근 공지: notices 테이블이 없고 최근 7일 이내 정적 공지가 없어 제외"
    );
  }

  return {
    currentEmployee,
    items: allItems.slice(0, MAX_NOTIFICATION_ITEMS),
    unreadCount: delayedTasks.length + todayDueTasks.length,
    totalCount: allItems.length,
    hiddenCount: Math.max(0, allItems.length - MAX_NOTIFICATION_ITEMS),
    excludedSources,
  };
}

export async function loadNotificationSummary(): Promise<LoadNotificationSummaryResult> {
  const currentEmployee = await getCurrentEmployee();
  const recentCutoff = getRecentCutoffIso();

  const { data: taskData, error: taskError } = await supabase
    .from("tasks")
    .select("id, project_id, task_name, task_type, assignee, status, due_date");

  if (taskError) {
    return { data: null, error: taskError };
  }

  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select("id, project_name");

  if (projectError) {
    return { data: null, error: projectError };
  }

  const { data: fileData, error: fileError } = await supabase
    .from("project_files")
    .select(
      "id, project_id, file_name, file_type, uploaded_by, uploaded_by_email, created_at"
    )
    .gte("created_at", recentCutoff)
    .order("created_at", { ascending: false })
    .limit(MAX_NOTIFICATION_ITEMS);

  if (fileError) {
    return { data: null, error: fileError };
  }

  return {
    data: calculateNotificationSummary(
      (taskData || []) as NotificationTask[],
      (projectData || []) as NotificationProject[],
      currentEmployee,
      (fileData || []) as NotificationProjectFile[],
      STATIC_NOTICE_ROWS
    ),
    error: null,
  };
}
