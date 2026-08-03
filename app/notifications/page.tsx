"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotificationRow } from "@/components/notifications/NotificationCenter";
import {
  loadNotificationSummary,
  markNotificationsRead,
  NOTIFICATION_READ_EVENT,
  notifyNotificationReadStateChanged,
  updateNotificationPreference,
  type NotificationCategory,
  type NotificationSummary,
} from "@/lib/notifications";
import { toast } from "@/lib/toast";

type Filter = "all" | "task" | "project" | "raw_material" | "personal" | "system";

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "task", label: "업무" },
  { value: "project", label: "프로젝트" },
  { value: "raw_material", label: "원자재" },
  { value: "personal", label: "개인" },
  { value: "system", label: "시스템" },
];

function matchesFilter(category: NotificationCategory, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "task") return category === "task" || category === "shipment";
  if (filter === "system") return category === "system" || category === "employee" || category === "lme";
  return category === filter;
}

export default function NotificationsPage() {
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [markingIds, setMarkingIds] = useState<Set<string>>(() => new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    const { data, error } = await loadNotificationSummary(100);
    if (error || !data) {
      setErrorMessage("알림을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }
    setSummary(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadNotifications(), 0);
    const interval = window.setInterval(
      () => void loadNotifications(),
      5 * 60 * 1000
    );
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [loadNotifications]);

  const applyReadState = useCallback((notificationIds: string[], readAt: string) => {
    const idSet = new Set(notificationIds);
    setSummary((current) => current ? {
      ...current,
      items: current.items.map((item) => idSet.has(item.id) ? { ...item, isRead: true, readAt } : item),
      unreadCount: current.items.filter((item) => !idSet.has(item.id) && !item.isRead).length,
    } : current);
  }, []);

  useEffect(() => {
    function handleReadState(event: Event) {
      applyReadState((event as CustomEvent<string[]>).detail ?? [], new Date().toISOString());
    }
    window.addEventListener(NOTIFICATION_READ_EVENT, handleReadState);
    return () => window.removeEventListener(NOTIFICATION_READ_EVENT, handleReadState);
  }, [applyReadState]);

  const markRead = useCallback(async (notificationIds: string[]) => {
    if (!summary?.currentEmployee || notificationIds.length === 0) return false;
    const previousSummary = summary;
    applyReadState(notificationIds, new Date().toISOString());
    const { error, readAt } = await markNotificationsRead(notificationIds, summary.currentEmployee);
    if (error || !readAt) {
      setSummary(previousSummary);
      toast.error("알림 읽음 처리에 실패했습니다.");
      return false;
    }
    notifyNotificationReadStateChanged(notificationIds);
    return true;
  }, [applyReadState, summary]);

  async function markOneRead(notificationId: string) {
    if (markingIds.has(notificationId)) return;
    setMarkingIds((current) => new Set(current).add(notificationId));
    await markRead([notificationId]);
    setMarkingIds((current) => {
      const next = new Set(current);
      next.delete(notificationId);
      return next;
    });
  }

  async function markAllRead() {
    if (!summary || markingAll) return;
    const unreadIds = summary.items.filter((item) => !item.isRead).map((item) => item.id);
    if (unreadIds.length === 0) return;
    setMarkingAll(true);
    const succeeded = await markRead(unreadIds);
    if (succeeded) toast.success("모든 알림을 읽음 처리했습니다.");
    setMarkingAll(false);
  }

  async function setPreference(item: NonNullable<typeof summary>["items"][number], values: { isPinned?: boolean; isHidden?: boolean }) {
    if (!summary?.currentEmployee) return;
    const { error } = await updateNotificationPreference(item.id, summary.currentEmployee, { ...values, isRead: item.isRead });
    if (error) { toast.error("알림 설정을 저장하지 못했습니다."); return; }
    setSummary((current) => current ? { ...current, items: current.items.map((currentItem) => currentItem.id === item.id ? { ...currentItem, isPinned: values.isPinned ?? currentItem.isPinned, isHidden: values.isHidden ?? currentItem.isHidden } : currentItem).filter((currentItem) => !currentItem.isHidden).sort((left, right) => Number(right.isPinned) - Number(left.isPinned)) } : current);
  }

  const items = useMemo(() => {
    if (!summary) return [];
    const categoryItems = summary.items.filter((item) => matchesFilter(item.category, filter));
    return showUnreadOnly ? categoryItems.filter((item) => !item.isRead) : categoryItems;
  }, [filter, showUnreadOnly, summary]);

  const unreadCount = summary?.items.filter((item) => !item.isRead).length ?? 0;

  return (
    <main className="space-y-5 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">모든 알림</h1>
          <p className="mt-1 text-sm text-slate-500">
            업무, 출고, 프로젝트 및 직원 승인 알림을 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void markAllRead()} disabled={unreadCount === 0 || markingAll} className="flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-semibold text-blue-600 shadow-sm disabled:text-slate-300">
            <CheckCheck size={15} />{markingAll ? "처리 중..." : "모두 읽음"}
          </button>
          <button
            type="button"
            onClick={() => void loadNotifications()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            새로고침
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              filter === item.value
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 shadow-sm"
            }`}
          >
            {item.label} ({summary?.items.filter((notification) => matchesFilter(notification.category, item.value)).length ?? 0})
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm">
          <input type="checkbox" checked={showUnreadOnly} onChange={(event) => setShowUnreadOnly(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
          읽지 않은 알림만
        </label>
      </div>

      {loading ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          알림을 불러오는 중입니다.
        </p>
      ) : errorMessage ? (
        <p className="rounded-2xl bg-red-50 p-8 text-center text-sm text-red-600">
          {errorMessage}
        </p>
      ) : items.length === 0 ? (
        <EmptyState
          title={showUnreadOnly ? "읽지 않은 알림이 없습니다." : "새로운 알림이 없습니다."}
          className="rounded-2xl bg-white p-10 text-center text-slate-500 shadow-sm"
        />
      ) : (
        <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              isMarkingRead={markingIds.has(item.id)}
              onMarkRead={() => markOneRead(item.id)}
              onTogglePin={() => setPreference(item, { isPinned: !item.isPinned })}
              onHide={() => setPreference(item, { isHidden: true })}
              onSelect={() => item.isRead ? undefined : markOneRead(item.id)}
            />
          ))}
        </section>
      )}
    </main>
  );
}
