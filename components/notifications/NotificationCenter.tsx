"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Calendar,
  Clock,
  Check,
  CheckCheck,
  FolderKanban,
  RefreshCw,
  Truck,
  User,
  X,
} from "lucide-react";
import { ErrorState } from "@/components/ui/ErrorState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  loadNotificationSummary,
  markNotificationsRead,
  NOTIFICATION_READ_EVENT,
  notifyNotificationReadStateChanged,
  type NotificationCategory,
  type NotificationItem,
  type NotificationSummary,
} from "@/lib/notifications";
import { formatActivityTime } from "@/lib/activity";
import { useAppShellUser } from "@/contexts/AppShellUserContext";
import { toast } from "@/lib/toast";

type NotificationFilter = "all" | NotificationCategory;

const filters: { value: NotificationFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "task", label: "업무" },
  { value: "shipment", label: "출고" },
  { value: "project", label: "프로젝트" },
  { value: "employee", label: "직원" },
];

function getBadgeLabel(count: number) {
  if (count <= 0) return "";
  return count > 99 ? "99+" : String(count);
}

function getSeverityVariant(severity: NotificationItem["severity"]): BadgeVariant {
  if (severity === "danger") return "danger";
  if (severity === "warning") return "warning";
  return "info";
}

function formatDisplayDate(date: string | null) {
  if (!date) return "-";
  return date.slice(0, 10);
}

function getEmptyMessage(filter: NotificationFilter) {
  if (filter === "task") return "업무 알림이 없습니다.";
  if (filter === "shipment") return "확인할 출고 알림이 없습니다.";
  if (filter === "project") return "최근 프로젝트 알림이 없습니다.";
  if (filter === "employee") return "승인 대기 직원이 없습니다.";
  return "현재 확인해야 할 알림이 없습니다.";
}

function NotificationIcon({ item }: { item: NotificationItem }) {
  const className = `mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
    item.severity === "danger"
      ? "bg-red-50 text-red-600"
      : item.severity === "warning"
        ? "bg-amber-50 text-amber-600"
        : "bg-blue-50 text-blue-600"
  }`;

  if (item.category === "shipment") {
    return (
      <div className={className}>
        <Truck size={17} />
      </div>
    );
  }

  if (item.category === "project") {
    return (
      <div className={className}>
        <FolderKanban size={17} />
      </div>
    );
  }

  if (item.category === "employee") {
    return (
      <div className={className}>
        <User size={17} />
      </div>
    );
  }

  return (
    <div className={className}>
      {item.severity === "danger" ? (
        <AlertTriangle size={17} />
      ) : item.severity === "warning" ? (
        <Calendar size={17} />
      ) : (
        <Clock size={17} />
      )}
    </div>
  );
}

export function NotificationRow({
  item,
  onSelect,
  onMarkRead,
  isMarkingRead = false,
}: {
  item: NotificationItem;
  onSelect: () => void | Promise<void>;
  onMarkRead?: () => void | Promise<void>;
  isMarkingRead?: boolean;
}) {
  const router = useRouter();
  return (
    <div className={`relative rounded-2xl border transition-colors hover:border-blue-200 hover:bg-blue-50 ${
      item.isRead ? "border-slate-200 bg-slate-50" : "border-blue-100 bg-blue-50/40"
    }`}>
      <Link
        href={item.href}
        onClick={async (event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          await onSelect();
          router.push(item.href);
        }}
        className="block p-3.5 pr-12 text-left focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
      <div className="flex items-start gap-3">
        <NotificationIcon item={item} />

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <Badge
              variant={getSeverityVariant(item.severity)}
              className="shrink-0 px-2.5 py-0.5 font-semibold"
            >
              {item.title}
            </Badge>
            {!item.isRead && <span className="h-2 w-2 rounded-full bg-blue-600" />}
          </div>
          <p className={`truncate text-sm text-slate-900 ${item.isRead ? "font-medium" : "font-bold"}`}>
            {item.description}
          </p>
          <p className="mt-1 truncate text-sm text-slate-700">
            {item.projectName}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{item.actor || "담당자 없음"}</span>
            <span>
              {item.date?.includes("T")
                ? formatActivityTime(item.date)
                : formatDisplayDate(item.date)}
            </span>
            {item.statusLabel ? <span>{item.statusLabel}</span> : null}
            {item.isRead && item.readAt ? <span>읽음 {formatActivityTime(item.readAt)}</span> : null}
          </div>
        </div>
      </div>
      </Link>
      {!item.isRead && onMarkRead ? (
        <button
          type="button"
          onClick={() => void onMarkRead()}
          disabled={isMarkingRead}
          aria-label={`${item.description} 읽음 처리`}
          title="읽음 처리"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl border border-blue-100 bg-white text-blue-600 hover:bg-blue-50 disabled:opacity-50"
        >
          <Check size={15} />
        </button>
      ) : null}
    </div>
  );
}

export default function NotificationCenter() {
  const { employee } = useAppShellUser();
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [markingIds, setMarkingIds] = useState<Set<string>>(() => new Set());
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const requestInFlightRef = useRef(false);
  const hasLoadedRef = useRef(false);

  const loadNotifications = useCallback(async () => {
    if (!employee || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setIsLoading(true);
    setErrorMessage("");

    const { data, error } = await loadNotificationSummary(30, employee);

    if (error) {
      setSummary(null);
      setErrorMessage(error.message);
      setIsLoading(false);
      requestInFlightRef.current = false;
      return;
    }

    setSummary(data);
    hasLoadedRef.current = true;
    setIsLoading(false);
    requestInFlightRef.current = false;
  }, [employee]);

  useEffect(() => {
    if (!employee) return;
    const timer = window.setTimeout(() => void loadNotifications(), 0);
    return () => window.clearTimeout(timer);
  }, [employee, loadNotifications]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadNotifications();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

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
      const notificationIds = (event as CustomEvent<string[]>).detail ?? [];
      applyReadState(notificationIds, new Date().toISOString());
    }
    window.addEventListener(NOTIFICATION_READ_EVENT, handleReadState);
    return () => window.removeEventListener(NOTIFICATION_READ_EVENT, handleReadState);
  }, [applyReadState]);

  const markRead = useCallback(async (notificationIds: string[]) => {
    if (!employee || notificationIds.length === 0) return false;
    const previousSummary = summary;
    const optimisticReadAt = new Date().toISOString();
    applyReadState(notificationIds, optimisticReadAt);
    const { error, readAt } = await markNotificationsRead(notificationIds, employee);
    if (error || !readAt) {
      setSummary(previousSummary);
      toast.error("알림 읽음 처리에 실패했습니다.");
      return false;
    }
    notifyNotificationReadStateChanged(notificationIds);
    return true;
  }, [applyReadState, employee, summary]);

  async function markOneRead(item: NotificationItem) {
    if (item.isRead || markingIds.has(item.id)) return;
    setMarkingIds((current) => new Set(current).add(item.id));
    await markRead([item.id]);
    setMarkingIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
  }

  async function markAllRead() {
    if (!summary || isMarkingAll) return;
    const unreadIds = summary.items.filter((item) => !item.isRead).map((item) => item.id);
    if (unreadIds.length === 0) return;
    setIsMarkingAll(true);
    const succeeded = await markRead(unreadIds);
    if (succeeded) toast.success("모든 알림을 읽음 처리했습니다.");
    setIsMarkingAll(false);
  }

  const filteredItems = useMemo(() => {
    if (!summary) return [];
    const categoryItems = activeFilter === "all"
      ? summary.items
      : summary.items.filter((item) => item.category === activeFilter);
    return showUnreadOnly ? categoryItems.filter((item) => !item.isRead) : categoryItems;
  }, [activeFilter, showUnreadOnly, summary]);

  const unreadCount =
    summary?.items.filter((item) => !item.isRead).length || 0;
  const badgeLabel = getBadgeLabel(unreadCount);

  return (
    <>
      <button
        type="button"
        aria-label="알림 열기"
        onClick={() => {
          setIsOpen(true);
          if (!hasLoadedRef.current) void loadNotifications();
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        <Bell size={17} />
        {badgeLabel ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {isOpen
        ? createPortal(
            <div className="fixed inset-0 z-[100]">
          <button
            type="button"
            aria-label="알림 닫기"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 h-full w-full bg-slate-950/20"
          />

          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-slate-50 shadow-xl sm:right-4 sm:top-20 sm:h-[560px] sm:w-[400px] sm:max-w-[calc(100vw-2rem)] sm:rounded-2xl sm:border">
            <div className="border-b border-slate-200 bg-white px-5 py-4 sm:rounded-t-2xl">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-950">알림</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    확인 필요 항목 {unreadCount}건
                    {summary ? ` · 전체 ${summary.totalCount}건` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void loadNotifications()}
                    disabled={isLoading}
                    className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-white disabled:opacity-60"
                    aria-label="알림 새로고침"
                  >
                    <RefreshCw
                      size={16}
                      className={isLoading ? "animate-spin" : ""}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-white"
                    aria-label="알림 닫기"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-5 gap-1 rounded-2xl bg-slate-100 p-1">
                {filters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setActiveFilter(filter.value)}
                    className={`rounded-xl px-2 py-1.5 text-xs font-semibold transition-colors ${
                      activeFilter === filter.value
                        ? "bg-white text-blue-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={showUnreadOnly}
                    onChange={(event) => setShowUnreadOnly(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  읽지 않은 알림만
                </label>
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={unreadCount === 0 || isMarkingAll}
                  className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:text-slate-300 disabled:hover:bg-transparent"
                >
                  <CheckCheck size={14} />
                  {isMarkingAll ? "처리 중..." : "모두 읽음"}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <TableSkeleton rows={6} columns={1} />
              ) : errorMessage ? (
                <ErrorState
                  message={errorMessage}
                  onRetry={() => void loadNotifications()}
                />
              ) : filteredItems.length > 0 ? (
                <div className="space-y-3">
                  {filteredItems.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      isMarkingRead={markingIds.has(item.id)}
                      onMarkRead={() => markOneRead(item)}
                      onSelect={async () => {
                        if (!item.isRead) await markOneRead(item);
                        setIsOpen(false);
                      }}
                    />
                  ))}
                  {activeFilter === "all" && summary && summary.hiddenCount > 0 ? (
                    <div className="px-2 py-1 text-center text-xs text-slate-400">
                      외 {summary.hiddenCount}건 더 있음
                    </div>
                  ) : null}
                </div>
              ) : (
                <EmptyState
                  title={showUnreadOnly ? "읽지 않은 알림이 없습니다." : getEmptyMessage(activeFilter)}
                  className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"
                />
              )}
            </div>
            <div className="border-t border-slate-200 bg-white p-3 text-center sm:rounded-b-2xl">
              <Link
                href="/notifications"
                onClick={() => setIsOpen(false)}
                className="text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                모든 알림 보기
              </Link>
            </div>
          </aside>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
