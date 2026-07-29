import type { PostgrestError } from "@supabase/supabase-js";
import { getCurrentEmployee, type CurrentEmployee } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { isTaskCompleted } from "@/lib/status";

export type NotificationSeverity = "danger" | "warning" | "info";
export type NotificationCategory = "task" | "shipment" | "project" | "employee";
export type NotificationType =
  | "task_delayed"
  | "task_today"
  | "task_started"
  | "shipment_scheduled"
  | "shipment_delayed"
  | "project_created"
  | "employee_approval";

type NotificationTask = {
  id: number;
  project_id: number;
  project_section_id?: number | null;
  task_name: string | null;
  task_type: string | null;
  assignee: string | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
};

type NotificationProject = {
  id: number;
  project_name: string;
};

type NotificationShipment = {
  id: number;
  project_id: number | null;
  item_name: string | null;
  site_name: string | null;
  status: string | null;
  shipment_date: string | null;
  driver_name: string | null;
};

type ApprovalEmployee = {
  id: number;
  name: string;
  created_at: string | null;
};

type ActivityRow = {
  id: number;
  activity_type: string;
  title: string;
  description: string | null;
  project_id: number | null;
  employee_name: string | null;
  employee_email: string | null;
  created_at: string | null;
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
  actor?: string | null;
  statusLabel?: string | null;
  isRead: boolean;
  readAt: string | null;
};

export type NotificationSummary = {
  currentEmployee: CurrentEmployee | null;
  items: NotificationItem[];
  unreadCount: number;
  totalCount: number;
  hiddenCount: number;
};

type LoadNotificationSummaryResult = {
  data: NotificationSummary | null;
  error: PostgrestError | Error | null;
};

const DEFAULT_LIMIT = 30;
export const NOTIFICATION_READ_EVENT = "notification-read-state-change";

type NotificationReadRow = {
  notification_id: string;
  read_at: string | null;
};

export function notifyNotificationReadStateChanged(notificationIds: string[]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string[]>(NOTIFICATION_READ_EVENT, {
    detail: notificationIds,
  }));
}

export async function markNotificationsRead(
  notificationIds: string[],
  currentEmployee: CurrentEmployee
) {
  const uniqueIds = [...new Set(notificationIds)];
  if (uniqueIds.length === 0) return { error: null, readAt: new Date().toISOString() };
  if (!currentEmployee.auth_user_id) {
    return { error: new Error("로그인 사용자 정보를 확인할 수 없습니다."), readAt: null };
  }

  const readAt = new Date().toISOString();
  const { error } = await supabase.from("notification_reads").upsert(
    uniqueIds.map((notificationId) => ({
      auth_user_id: currentEmployee.auth_user_id,
      notification_id: notificationId,
      is_read: true,
      read_at: readAt,
    })),
    { onConflict: "auth_user_id,notification_id" }
  );
  return { error, readAt: error ? null : readAt };
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getToday() {
  return formatDateInput(new Date());
}

function getWeekEnd(today: string) {
  const date = new Date(`${today}T00:00:00`);
  date.setDate(date.getDate() + 7);
  return formatDateInput(date);
}

function getRecentCutoffIso() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString();
}

function getProjectName(
  projects: NotificationProject[],
  projectId: number | null
) {
  if (projectId === null) return "프로젝트 없음";
  return (
    projects.find((project) => project.id === projectId)?.project_name ??
    `프로젝트 #${projectId}`
  );
}

function getDaysDelayed(date: string, today: string) {
  const dueTime = new Date(`${date}T00:00:00`).getTime();
  const todayTime = new Date(`${today}T00:00:00`).getTime();
  return Math.max(1, Math.ceil((todayTime - dueTime) / 86_400_000));
}

function compareNotifications(a: NotificationItem, b: NotificationItem) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return (b.date ?? "").localeCompare(a.date ?? "");
}

export function calculateNotificationSummary({
  tasks,
  projects,
  shipments,
  approvals,
  activities,
  currentEmployee,
  limit = DEFAULT_LIMIT,
}: {
  tasks: NotificationTask[];
  projects: NotificationProject[];
  shipments: NotificationShipment[];
  approvals: ApprovalEmployee[];
  activities: ActivityRow[];
  currentEmployee: CurrentEmployee | null;
  limit?: number;
}): NotificationSummary {
  const today = getToday();
  const weekEnd = getWeekEnd(today);
  const isAdmin = currentEmployee?.role === "admin";
  const visibleTasks = isAdmin
    ? tasks
    : tasks.filter((task) => task.assignee === currentEmployee?.name);
  const allowedProjectIds = new Set(
    visibleTasks.map((task) => task.project_id)
  );
  const visibleShipments = isAdmin
    ? shipments
    : shipments.filter(
        (shipment) =>
          shipment.project_id !== null &&
          allowedProjectIds.has(shipment.project_id)
      );
  const visibleActivities = isAdmin
    ? activities
    : activities.filter(
        (activity) =>
          (activity.project_id !== null &&
            allowedProjectIds.has(activity.project_id)) ||
          activity.employee_email === currentEmployee?.email
      );

  const taskItems = visibleTasks.flatMap<NotificationItem>((task) => {
    if (isTaskCompleted(task.status)) return [];
    const projectName = getProjectName(projects, task.project_id);

    if (task.due_date && task.due_date < today) {
      const days = getDaysDelayed(task.due_date, today);
      return [{
        id: `task-delayed-${task.id}`,
        type: "task_delayed",
        category: "task",
        title: "지연 업무",
        description: `${task.task_name || "업무"} · ${days}일 지연`,
        date: task.due_date,
        href: `/projects/${task.project_id}?task=${task.id}`,
        priority: 1,
        severity: "danger",
        projectName,
        actor: task.assignee,
        statusLabel: task.status,
        isRead: false,
        readAt: null,
      }];
    }

    if (task.due_date === today) {
      return [{
        id: `task-today-${task.id}`,
        type: "task_today",
        category: "task",
        title: "오늘 마감",
        description: task.task_name || "업무",
        date: task.due_date,
        href: `/projects/${task.project_id}?task=${task.id}`,
        priority: 2,
        severity: "danger",
        projectName,
        actor: task.assignee,
        statusLabel: task.status,
        isRead: false,
        readAt: null,
      }];
    }

    if (task.start_date === today) {
      return [{
        id: `task-started-${task.id}`,
        type: "task_started",
        category: "task",
        title: "오늘 시작 업무",
        description: task.task_name || "업무",
        date: task.start_date,
        href: `/projects/${task.project_id}?task=${task.id}`,
        priority: 4,
        severity: "warning",
        projectName,
        actor: task.assignee,
        statusLabel: task.status,
        isRead: false,
        readAt: null,
      }];
    }

    return [];
  });

  const shipmentItems = visibleShipments.flatMap<NotificationItem>(
    (shipment) => {
      if (!shipment.shipment_date || shipment.status === "출고완료") return [];
      const isDelayed = shipment.shipment_date < today;
      if (!isDelayed && shipment.shipment_date > weekEnd) return [];

      return [{
        id: `shipment-${isDelayed ? "delayed" : "scheduled"}-${shipment.id}`,
        type: isDelayed ? "shipment_delayed" : "shipment_scheduled",
        category: "shipment",
        title: isDelayed ? "출고 지연" : "출고 예정",
        description: shipment.item_name || shipment.site_name || "출고",
        date: shipment.shipment_date,
        href: shipment.project_id
          ? `/projects/${shipment.project_id}`
          : "/shipments",
        priority: isDelayed ? 1 : 5,
        severity: isDelayed ? "danger" : "warning",
        projectName: getProjectName(projects, shipment.project_id),
        actor: shipment.driver_name,
        statusLabel: shipment.status,
        isRead: false,
        readAt: null,
      }];
    }
  );

  const approvalItems: NotificationItem[] = isAdmin
    ? approvals.map((employee) => ({
        id: `employee-approval-${employee.id}`,
        type: "employee_approval",
        category: "employee",
        title: "직원 승인 요청",
        description: employee.name,
        date: employee.created_at,
        href: "/employees",
        priority: 1,
        severity: "danger",
        projectName: "가입 승인 대기",
        isRead: false,
        readAt: null,
      }))
    : [];

  const projectItems: NotificationItem[] = visibleActivities
    .filter((activity) => activity.activity_type === "project_create")
    .map((activity) => ({
      id: `activity-project-${activity.id}`,
      type: "project_created",
      category: "project",
      title: "신규 프로젝트",
      description: activity.description || activity.title,
      date: activity.created_at,
      href: activity.project_id ? `/projects/${activity.project_id}` : "/projects",
      priority: 6,
      severity: "info",
      projectName: getProjectName(projects, activity.project_id),
      actor: activity.employee_name,
      isRead: false,
      readAt: null,
    }));

  const allItems = [
    ...taskItems,
    ...shipmentItems,
    ...approvalItems,
    ...projectItems,
  ].sort(compareNotifications);

  return {
    currentEmployee,
    items: allItems.slice(0, limit),
    unreadCount: allItems.length,
    totalCount: allItems.length,
    hiddenCount: Math.max(0, allItems.length - limit),
  };
}

export async function loadNotificationSummary(
  limit = DEFAULT_LIMIT,
  providedEmployee?: CurrentEmployee | null
): Promise<LoadNotificationSummaryResult> {
  const currentEmployee =
    providedEmployee === undefined
      ? await getCurrentEmployee()
      : providedEmployee;
  if (!currentEmployee) {
    return { data: null, error: new Error("직원 정보를 확인할 수 없습니다.") };
  }

  const isAdmin = currentEmployee.role === "admin";
  const today = getToday();
  const weekEnd = getWeekEnd(today);
  const recentCutoff = getRecentCutoffIso();
  let taskQuery = supabase
    .from("tasks")
    .select(
      "id, project_id, task_name, task_type, assignee, status, start_date, due_date"
    )
    .or("status.is.null,status.in.(pending,대기,in_progress,진행중)")
    .or(`due_date.lte.${weekEnd},start_date.eq.${today}`)
    .limit(200);

  if (!isAdmin) {
    taskQuery = taskQuery.eq("assignee", currentEmployee.name);
  }

  const taskResult = await taskQuery;
  if (taskResult.error) return { data: null, error: taskResult.error };

  const allowedProjectIds = Array.from(
    new Set((taskResult.data ?? []).map((task) => task.project_id))
  );
  let shipmentQuery = supabase
    .from("shipments")
    .select(
      "id, project_id, item_name, site_name, status, shipment_date, driver_name"
    )
    .lte("shipment_date", weekEnd)
    .or("status.is.null,status.neq.출고완료")
    .order("shipment_date", { ascending: true })
    .limit(100);
  let activityQuery = supabase
    .from("activity_logs")
    .select(
      "id, activity_type, title, description, project_id, employee_name, employee_email, created_at"
    )
    .gte("created_at", recentCutoff)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!isAdmin && allowedProjectIds.length > 0) {
    shipmentQuery = shipmentQuery.in("project_id", allowedProjectIds);
    activityQuery = activityQuery.in("project_id", allowedProjectIds);
  }

  const [shipmentResult, approvalResult, activityResult] =
    await Promise.all([
      !isAdmin && allowedProjectIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : shipmentQuery,
      isAdmin
        ? supabase
            .from("employees")
            .select("id, name, created_at")
            .eq("approval_status", "pending")
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
      !isAdmin && allowedProjectIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : activityQuery,
    ]);

  const error =
    shipmentResult.error ||
    approvalResult.error ||
    activityResult.error;

  if (error) return { data: null, error };

  const projectIds = Array.from(
    new Set([
      ...allowedProjectIds,
      ...(shipmentResult.data ?? []).flatMap((shipment) =>
        shipment.project_id === null ? [] : [shipment.project_id]
      ),
      ...(activityResult.data ?? []).flatMap((activity) =>
        activity.project_id === null ? [] : [activity.project_id]
      ),
    ])
  );
  const projectResult = projectIds.length
    ? await supabase
        .from("projects")
        .select("id, project_name")
        .in("id", projectIds)
    : { data: [], error: null };
  if (projectResult.error) return { data: null, error: projectResult.error };

  const summary = calculateNotificationSummary({
      tasks: (taskResult.data ?? []) as NotificationTask[],
      projects: (projectResult.data ?? []) as NotificationProject[],
      shipments: (shipmentResult.data ?? []) as NotificationShipment[],
      approvals: (approvalResult.data ?? []) as ApprovalEmployee[],
      activities: (activityResult.data ?? []) as ActivityRow[],
      currentEmployee,
      limit,
    });
  const notificationIds = summary.items.map((item) => item.id);
  const readResult = notificationIds.length === 0
    ? { data: [], error: null }
    : await supabase
        .from("notification_reads")
        .select("notification_id, read_at")
        .in("notification_id", notificationIds);
  if (readResult.error) return { data: null, error: readResult.error };

  const readById = new Map(
    ((readResult.data ?? []) as NotificationReadRow[]).map((row) => [row.notification_id, row.read_at])
  );
  summary.items = summary.items.map((item) => ({
    ...item,
    isRead: readById.has(item.id),
    readAt: readById.get(item.id) ?? null,
  }));
  summary.unreadCount = summary.items.filter((item) => !item.isRead).length;

  return {
    data: summary,
    error: null,
  };
}
