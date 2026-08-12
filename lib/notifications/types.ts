export type NotificationCategory = "project" | "task" | "shipment" | "personal" | "raw_material" | "lme" | "system";
export type NotificationPriority = "critical" | "high" | "medium" | "low";
export type NotificationAction = { label: string; href: string };
export type SmartNotificationType =
  | "project_dday" | "project_overdue" | "task_today" | "task_overdue" | "task_due_soon"
  | "shipment_today" | "shipment_overdue" | "personal_todo_today" | "personal_todo_overdue"
  | "personal_memo_today" | "personal_sticky" | "raw_material_contract_ending"
  | "task_note_check_today" | "task_note_check_overdue"
  | "raw_material_remaining" | "lme_weekly_change" | "system_employee_approval";

export type EngineNotification = {
  id: string;
  type: SmartNotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  description: string;
  date: string | null;
  action: NotificationAction;
  projectName: string;
  actor?: string | null;
  statusLabel?: string | null;
};

export const NOTIFICATION_PRIORITY_RANK: Record<NotificationPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
