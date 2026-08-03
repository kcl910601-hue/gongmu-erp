import { getDday } from "../dday.ts";
import { NOTIFICATION_PRIORITY_RANK, type EngineNotification, type NotificationPriority } from "./types.ts";

export type NotificationEngineInput = {
  today: string;
  projects?: { id: number; project_name: string; status: string | null; end_date: string | null }[];
  tasks?: { id: number; project_id: number; project_name: string; task_name: string | null; assignee: string | null; status: string | null; due_date: string | null }[];
  shipments?: { id: number; project_id: number | null; project_name: string; site_name: string | null; item_name: string | null; status: string | null; shipment_date: string | null }[];
  personal?: { id: string; note_type: "todo" | "memo" | "sticky" | "reminder"; title: string | null; content: string; due_date: string | null; is_completed: boolean; is_pinned: boolean }[];
  contracts?: { id: string; contract_name: string; effective_end_date: string; contract_quantity_ton: number; remaining_quantity_ton: number; status: string }[];
  weeklyLmeChangeRate?: number | null;
};

function item(value: EngineNotification) { return value; }
function priorityForProject(diff: number): NotificationPriority | null {
  if (diff <= 0) return "critical";
  if (diff === 2) return "high";
  if (diff >= 3 && diff <= 7) return "medium";
  return null;
}
function isCompleted(status: string | null) { return status === "completed" || status === "완료" || status === "출고완료"; }

export function sortNotifications(items: EngineNotification[]) {
  return [...items].sort((left, right) => NOTIFICATION_PRIORITY_RANK[left.priority] - NOTIFICATION_PRIORITY_RANK[right.priority] || (right.date ?? "").localeCompare(left.date ?? "") || left.id.localeCompare(right.id));
}

export type HiddenNotificationMode = "exclude" | "only" | "include";

export function applyNotificationPreferences<T extends { id: string }>(items: T[], preferences: { notification_id: string; is_read: boolean; read_at: string | null; is_pinned: boolean; is_hidden: boolean }[], options: { hiddenMode?: HiddenNotificationMode } = {}) {
  const byId = new Map(preferences.map((preference) => [preference.notification_id, preference]));
  const hiddenMode = options.hiddenMode ?? "exclude";
  return items.map((entry) => {
    const preference = byId.get(entry.id);
    const readAt = preference?.read_at ?? null;
    return { ...entry, isRead: readAt !== null, isUnread: readAt === null, readAt, isPinned: preference?.is_pinned ?? false, isHidden: preference?.is_hidden ?? false };
  }).filter((entry) => hiddenMode === "include" || (hiddenMode === "only" ? entry.isHidden : !entry.isHidden)).sort((left, right) => Number(right.isPinned) - Number(left.isPinned));
}

export function countUnreadNotifications(items: { isRead: boolean; isHidden?: boolean }[]) {
  return items.filter((item) => !item.isRead && !item.isHidden).length;
}

export function buildNotificationCounts<T extends { category: string; isRead: boolean; isPinned?: boolean; isHidden?: boolean }>(items: T[]) {
  const visible = items.filter((item) => !item.isHidden);
  const byCategory: Record<string, { total: number; unread: number }> = {};
  for (const item of visible) {
    const current = byCategory[item.category] ?? { total: 0, unread: 0 };
    current.total += 1;
    if (!item.isRead) current.unread += 1;
    byCategory[item.category] = current;
  }
  return {
    totalCount: visible.length,
    unreadCount: visible.filter((item) => !item.isRead).length,
    pinnedCount: visible.filter((item) => item.isPinned).length,
    hiddenCount: items.filter((item) => item.isHidden).length,
    byCategory,
  };
}

export function deriveNotificationState<T extends { category: string; isRead: boolean; isPinned?: boolean; isHidden?: boolean }>(items: T[]) {
  const visibleItems = items.filter((item) => !item.isHidden);
  const hiddenItems = items.filter((item) => item.isHidden);
  const unreadItems = visibleItems.filter((item) => !item.isRead);
  const readItems = visibleItems.filter((item) => item.isRead);
  return { visibleItems, unreadItems, readItems, hiddenItems, ...buildNotificationCounts(items) };
}

export function buildNotificationReadRows(notificationIds: string[], authUserId: string, existingRows: { notification_id: string; is_pinned: boolean; is_hidden: boolean }[], readAt: string) {
  const existingById = new Map(existingRows.map((row) => [row.notification_id, row]));
  return notificationIds.map((notificationId) => ({
    auth_user_id: authUserId,
    notification_id: notificationId,
    is_read: true,
    read_at: readAt,
    is_pinned: existingById.get(notificationId)?.is_pinned ?? false,
    is_hidden: existingById.get(notificationId)?.is_hidden ?? false,
  }));
}

export function generateNotifications(input: NotificationEngineInput): EngineNotification[] {
  const output: EngineNotification[] = [];
  for (const project of input.projects ?? []) {
    if (!project.end_date || isCompleted(project.status)) continue;
    const dday = getDday(project.end_date, input.today);
    const priority = dday ? priorityForProject(dday.diff) : null;
    if (!dday || !priority) continue;
    output.push(item({ id: `project-${dday.isExpired ? "overdue" : "dday"}-${project.id}`, type: dday.isExpired ? "project_overdue" : "project_dday", category: "project", priority, title: dday.label, description: dday.isExpired ? `${Math.abs(dday.diff)}일 지연` : dday.isToday ? "오늘 종료" : `${dday.diff}일 후 종료`, date: project.end_date, action: { label: "프로젝트 열기", href: `/projects/${project.id}` }, projectName: project.project_name }));
  }
  for (const task of input.tasks ?? []) {
    if (!task.due_date || isCompleted(task.status)) continue;
    const dday = getDday(task.due_date, input.today);
    if (!dday || dday.diff > 3) continue;
    const overdue = dday.diff < 0;
    output.push(item({ id: `task-${overdue ? "overdue" : dday.isToday ? "today" : "soon"}-${task.id}`, type: overdue ? "task_overdue" : dday.isToday ? "task_today" : "task_due_soon", category: "task", priority: overdue ? "critical" : dday.isToday ? "high" : "medium", title: overdue ? "지연 업무" : dday.isToday ? "오늘 마감" : dday.label, description: task.task_name || "업무", date: task.due_date, action: { label: "업무 열기", href: `/projects/${task.project_id}?task=${task.id}` }, projectName: task.project_name, actor: task.assignee, statusLabel: task.status }));
  }
  for (const shipment of input.shipments ?? []) {
    if (!shipment.shipment_date || isCompleted(shipment.status)) continue;
    const dday = getDday(shipment.shipment_date, input.today);
    if (!dday || dday.diff > 0) continue;
    output.push(item({ id: `shipment-${dday.isExpired ? "overdue" : "today"}-${shipment.id}`, type: dday.isExpired ? "shipment_overdue" : "shipment_today", category: "shipment", priority: dday.isExpired ? "critical" : "high", title: dday.isExpired ? "지연 출고" : "오늘 출고", description: shipment.item_name || shipment.site_name || "출고", date: shipment.shipment_date, action: { label: "출고 보기", href: shipment.project_id ? `/projects/${shipment.project_id}` : "/shipments" }, projectName: shipment.project_name, statusLabel: shipment.status }));
  }
  for (const note of input.personal ?? []) {
    if (note.note_type === "sticky") {
      output.push(item({ id: `personal-sticky-${note.id}`, type: "personal_sticky", category: "personal", priority: "low", title: "Sticky Memo", description: note.title || note.content, date: note.due_date, action: { label: "My Workspace", href: "/?workspace=personal" }, projectName: "My Workspace" }));
      continue;
    }
    if (!note.due_date || (note.note_type === "todo" && note.is_completed)) continue;
    const dday = getDday(note.due_date, input.today);
    if (!dday || dday.diff > 0) continue;
    if (note.note_type === "todo") output.push(item({ id: `personal-todo-${dday.isExpired ? "overdue" : "today"}-${note.id}`, type: dday.isExpired ? "personal_todo_overdue" : "personal_todo_today", category: "personal", priority: dday.isExpired ? "high" : "medium", title: dday.isExpired ? "지연 Todo" : "오늘 Todo", description: note.title || note.content, date: note.due_date, action: { label: "My Workspace", href: "/?workspace=personal" }, projectName: "My Workspace" }));
    if (note.note_type === "memo" && dday.isToday) output.push(item({ id: `personal-memo-today-${note.id}`, type: "personal_memo_today", category: "personal", priority: "low", title: "오늘 Memo", description: note.title || note.content, date: note.due_date, action: { label: "My Workspace", href: "/?workspace=personal" }, projectName: "My Workspace" }));
  }
  for (const contract of input.contracts ?? []) {
    if (contract.status !== "active") continue;
    const dday = getDday(contract.effective_end_date, input.today);
    if (dday && dday.diff >= 0 && dday.diff <= 30) output.push(item({ id: `raw-material-ending-${contract.id}`, type: "raw_material_contract_ending", category: "raw_material", priority: dday.diff <= 7 ? "critical" : dday.diff <= 14 ? "high" : "medium", title: "원자재 계약 종료", description: `${contract.contract_name} · ${dday.label}`, date: contract.effective_end_date, action: { label: "계약 보기", href: "/statistics/lme" }, projectName: contract.contract_name }));
    const ratio = contract.contract_quantity_ton > 0 ? contract.remaining_quantity_ton / contract.contract_quantity_ton : 0;
    if (ratio <= 0.2) output.push(item({ id: `raw-material-remaining-${contract.id}`, type: "raw_material_remaining", category: "raw_material", priority: ratio <= 0.1 ? "critical" : "high", title: "원자재 잔여톤", description: `${contract.contract_name} · ${(ratio * 100).toFixed(1)}%`, date: input.today, action: { label: "계약 보기", href: "/statistics/lme" }, projectName: contract.contract_name }));
  }
  if (input.weeklyLmeChangeRate !== null && input.weeklyLmeChangeRate !== undefined && Math.abs(input.weeklyLmeChangeRate) >= 5) output.push(item({ id: `lme-weekly-${input.today}`, type: "lme_weekly_change", category: "lme", priority: "medium", title: "LME 전주 대비", description: `${input.weeklyLmeChangeRate > 0 ? "+" : ""}${input.weeklyLmeChangeRate.toFixed(1)}%`, date: input.today, action: { label: "LME 보기", href: "/statistics/lme" }, projectName: "LME" }));
  return sortNotifications(output);
}
