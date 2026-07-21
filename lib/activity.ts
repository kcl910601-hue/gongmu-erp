import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getCurrentEmployee } from "@/lib/auth";

export type ActivityType =
  | "project_create"
  | "project_update"
  | "project_delete"
  | "task_create"
  | "task_update"
  | "task_assignee_change"
  | "task_status_change"
  | "task_complete"
  | "task_delete"
  | "shipment_create"
  | "shipment_update"
  | "shipment_complete"
  | "file_upload"
  | "file_delete"
  | "employee_approve"
  | "employee_reject"
  | "employee_role_change"
  | "employee_update"
  | "employee_activate"
  | "employee_deactivate"
  | "login_success"
  | "employee_create";

export type ActivityJsonValue =
  | string
  | number
  | boolean
  | null
  | ActivityJsonValue[]
  | { [key: string]: ActivityJsonValue };

export type ActivityMetadata = Record<string, ActivityJsonValue>;

export type ActivityInput = {
  type?: ActivityType;
  actionType?: ActivityType;
  title: string;
  description?: string;
  projectId?: number | null;
  employeeId?: number | null;
  employeeName?: string | null;
  employeeEmail?: string | null;
  targetType?: string;
  targetId?: number;
  metadata?: ActivityMetadata;
};

export type ActivityLog = {
  id: number;
  created_at: string | null;
  activity_type: string;
  action_type: string;
  title: string;
  description: string | null;
  project_id: number | null;
  employee_id: number | null;
  employee_name: string | null;
  metadata: ActivityMetadata | null;
};

export async function logActivityWithClient(
  client: SupabaseClient,
  data: ActivityInput
) {
  const activityType = data.type ?? data.actionType;
  if (!activityType) return;

  const { error } = await client.from("activity_logs").insert({
    activity_type: activityType,
    action_type: activityType,
    target_type: data.targetType ?? activityType.split("_")[0],
    target_id: data.targetId ?? null,
    project_id: data.projectId ?? null,
    employee_id: data.employeeId ?? null,
    employee_name: data.employeeName ?? null,
    employee_email: data.employeeEmail ?? null,
    title: data.title,
    description: data.description ?? null,
    metadata: data.metadata ?? {},
  });

  if (error) {
    console.error("activity log error:", error.message);
  }
}

export async function logActivity(data: ActivityInput) {
  const employee = await getCurrentEmployee();
  if (!employee) return;

  await logActivityWithClient(supabase, {
    ...data,
    employeeId: data.employeeId ?? employee.id,
    employeeName: data.employeeName ?? employee.name,
    employeeEmail: data.employeeEmail ?? employee.email,
  });
}

export const addActivity = logActivity;

export function getActivityIcon(activityType: string) {
  if (activityType.startsWith("project_")) return "📁";
  if (activityType.startsWith("task_")) return "✅";
  if (activityType.startsWith("shipment_")) return "📦";
  if (activityType.startsWith("file_")) return "📄";
  if (activityType.startsWith("employee_")) return "👤";
  if (activityType === "login_success") return "🔐";
  return "•";
}

export function formatActivityTime(createdAt: string | null, now = new Date()) {
  if (!createdAt) return "-";

  const createdDate = new Date(createdAt);
  const difference = now.getTime() - createdDate.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (difference < minute) return "방금 전";
  if (difference < hour) return `${Math.floor(difference / minute)}분 전`;
  if (difference < day) return `${Math.floor(difference / hour)}시간 전`;
  if (difference < day * 2) return "어제";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(createdDate);
}
