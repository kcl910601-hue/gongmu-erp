"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NotificationRow } from "@/components/notifications/NotificationCenter";
import {
  loadNotificationSummary,
  markNotificationsRead,
  markNotificationsUnread,
  toggleNotificationRead,
  NOTIFICATION_READ_EVENT,
  notifyNotificationReadStateChanged,
  notifyNotificationPreferenceChanged,
  updateNotificationPreference,
  type NotificationCategory,
  type NotificationSummary,
} from "@/lib/notifications";
import { toast } from "@/lib/toast";
import { deriveNotificationState } from "@/lib/notifications/engine";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/collaboration-events";

type Filter = "all" | "task" | "project" | "raw_material" | "personal" | "system";
type ViewMode = "all" | "unread" | "read" | "pinned" | "hidden";
type BatchAction = "read" | "unread";

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
  const [filter, setFilter] = useState<Filter>(() => {
    if (typeof window === "undefined") return "all";
    const requestedFilter = new URLSearchParams(window.location.search).get("filter");
    return filters.some((item) => item.value === requestedFilter) ? requestedFilter as Filter : "all";
  });
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [markingIds, setMarkingIds] = useState<Set<string>>(() => new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const [pendingBatchAction, setPendingBatchAction] = useState<BatchAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    const { data, error } = await loadNotificationSummary(100, undefined, "include");
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

  useEffect(() => {
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, loadNotifications);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, loadNotifications);
  }, [loadNotifications]);

  const applyReadState = useCallback((notificationIds: string[], readAt: string | null) => {
    const idSet = new Set(notificationIds);
    setSummary((current) => {
      if (!current) return current;
      const items = current.items.map((item) => idSet.has(item.id) ? { ...item, isRead: readAt !== null, isUnread: readAt === null, readAt } : item);
      return { ...current, items, unreadCount: deriveNotificationState(items).unreadCount };
    });
  }, []);

  useEffect(() => {
    function handleReadState(event: Event) {
      const detail = (event as CustomEvent<{ notificationIds: string[]; readAt: string | null }>).detail;
      if (detail) applyReadState(detail.notificationIds, detail.readAt);
    }
    window.addEventListener(NOTIFICATION_READ_EVENT, handleReadState);
    return () => window.removeEventListener(NOTIFICATION_READ_EVENT, handleReadState);
  }, [applyReadState]);

  async function toggleOneRead(item: NonNullable<typeof summary>["items"][number]) {
    if (!summary?.currentEmployee || markingIds.has(item.id)) return;
    setMarkingIds((current) => new Set(current).add(item.id));
    const previousReadAt = item.readAt;
    const optimisticReadAt = previousReadAt ? null : new Date().toISOString();
    applyReadState([item.id], optimisticReadAt);
    const { error, readAt } = await toggleNotificationRead(item.id, previousReadAt, summary.currentEmployee);
    if (error) {
      applyReadState([item.id], previousReadAt);
      toast.error("알림 읽음 상태를 변경하지 못했습니다.");
    } else {
      applyReadState([item.id], readAt);
      notifyNotificationReadStateChanged([item.id], readAt);
    }
    setMarkingIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
  }

  async function applyBatchReadState(action: BatchAction) {
    if (!summary?.currentEmployee || markingAll) return;
    const targets = action === "read" ? filteredUnreadItems : filteredReadItems;
    const targetIds = targets.map((item) => item.id);
    if (targetIds.length === 0) return;
    setMarkingAll(true);
    const previousSummary = summary;
    const optimisticReadAt = action === "read" ? new Date().toISOString() : null;
    applyReadState(targetIds, optimisticReadAt);
    const result = action === "read"
      ? await markNotificationsRead(targetIds, summary.currentEmployee)
      : await markNotificationsUnread(targetIds, summary.currentEmployee);
    if (result.error || result.readAt === undefined) {
      setSummary(previousSummary);
      toast.error("알림 읽음 상태를 일괄 변경하지 못했습니다.");
    } else {
      applyReadState(targetIds, result.readAt);
      notifyNotificationReadStateChanged(targetIds, result.readAt);
      toast.success(action === "read" ? "현재 목록을 모두 읽음 처리했습니다." : "현재 목록을 모두 미확인 처리했습니다.");
    }
    setMarkingAll(false);
    setPendingBatchAction(null);
  }

  async function setPreference(item: NonNullable<typeof summary>["items"][number], values: { isPinned?: boolean; isHidden?: boolean }) {
    if (!summary?.currentEmployee) return;
    const { error } = await updateNotificationPreference(item.id, summary.currentEmployee, { ...values, isRead: item.isRead, readAt: item.readAt });
    if (error) { toast.error("알림 설정을 저장하지 못했습니다."); return; }
    setSummary((current) => current ? { ...current, items: current.items.map((currentItem) => currentItem.id === item.id ? { ...currentItem, isPinned: values.isPinned ?? currentItem.isPinned, isHidden: values.isHidden ?? currentItem.isHidden } : currentItem).sort((left, right) => Number(right.isPinned) - Number(left.isPinned)) } : current);
    notifyNotificationPreferenceChanged();
  }

  const items = useMemo(() => {
    if (!summary) return [];
    const categoryItems = summary.items.filter((item) => matchesFilter(item.category, filter));
    if (viewMode === "hidden") return categoryItems.filter((item) => item.isHidden);
    const visible = categoryItems.filter((item) => !item.isHidden);
    if (viewMode === "unread") return visible.filter((item) => !item.isRead);
    if (viewMode === "read") return visible.filter((item) => item.isRead);
    if (viewMode === "pinned") return visible.filter((item) => item.isPinned);
    return visible;
  }, [filter, summary, viewMode]);

  const filteredUnreadItems = items.filter((item) => !item.isRead);
  const filteredReadItems = items.filter((item) => item.isRead);
  const hasFilteredScope = filter !== "all" || viewMode !== "all";

  const notificationState = useMemo(() => deriveNotificationState(summary?.items ?? []), [summary]);
  const unreadCount = notificationState.unreadCount;

  return (
    <main className="space-y-5 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">모든 알림</h1>
          <p className="mt-1 text-sm text-slate-500">
            업무, 출고, 프로젝트 및 직원 승인 알림을 확인합니다.
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">확인 필요 항목 {unreadCount}건 · 전체 {notificationState.totalCount}건</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" title="현재 필터에 표시된 알림을 모두 읽음 처리합니다." onClick={() => setPendingBatchAction("read")} disabled={filteredUnreadItems.length === 0 || markingAll} className="flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-semibold text-blue-600 shadow-sm disabled:text-slate-300">
            <CheckCheck size={15} />{markingAll ? "처리 중..." : hasFilteredScope ? "현재 목록 모두 읽음" : "전체 읽음"}
          </button>
          <button type="button" title="현재 필터에 표시된 알림을 모두 미확인 처리합니다." onClick={() => setPendingBatchAction("unread")} disabled={filteredReadItems.length === 0 || markingAll} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm disabled:text-slate-300">
            {hasFilteredScope ? "현재 목록 모두 안읽음" : "전체 안읽음"}
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
            {item.label} ({summary?.items.filter((notification) => !notification.isHidden && matchesFilter(notification.category, item.value)).length ?? 0})
          </button>
        ))}
        <div className="ml-auto flex flex-wrap gap-1 rounded-xl bg-white p-1 shadow-sm">
          {([['all','전체'],['unread','읽지 않음'],['read','읽음'],['pinned','고정'],['hidden','숨긴 알림']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setViewMode(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === value ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>)}
        </div>
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
          title={viewMode === "hidden" ? "숨긴 알림이 없습니다." : viewMode === "unread" ? "읽지 않은 알림이 없습니다." : "새로운 알림이 없습니다."}
          className="rounded-2xl bg-white p-10 text-center text-slate-500 shadow-sm"
        />
      ) : (
        <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              isMarkingRead={markingIds.has(item.id)}
              onToggleRead={() => toggleOneRead(item)}
              onTogglePin={() => setPreference(item, { isPinned: !item.isPinned })}
              onHide={() => setPreference(item, { isHidden: !item.isHidden })}
              onSelect={() => item.isRead ? undefined : toggleOneRead(item)}
            />
          ))}
        </section>
      )}
      <ConfirmDialog
        open={pendingBatchAction !== null}
        title={pendingBatchAction === "unread" ? "현재 목록 모두 안읽음" : "현재 목록 모두 읽음"}
        description={pendingBatchAction === "unread"
          ? `현재 목록의 읽은 알림 ${filteredReadItems.length}건을 모두 미확인으로 변경하시겠습니까?`
          : `현재 목록의 미확인 알림 ${filteredUnreadItems.length}건을 모두 읽음 처리하시겠습니까?`}
        confirmLabel={pendingBatchAction === "unread" ? "모두 안읽음" : "모두 읽음"}
        isPending={markingAll}
        onClose={() => setPendingBatchAction(null)}
        onConfirm={() => { if (pendingBatchAction) void applyBatchReadState(pendingBatchAction); }}
      />
    </main>
  );
}
