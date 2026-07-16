"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Calendar,
  Clock,
  FileText,
  Megaphone,
  RefreshCw,
  X,
} from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  loadNotificationSummary,
  type NotificationCategory,
  type NotificationItem,
  type NotificationSummary,
} from "@/lib/notifications";

type NotificationFilter = "all" | NotificationCategory;

const filters: { value: NotificationFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "task", label: "업무" },
  { value: "file", label: "파일" },
  { value: "notice", label: "공지" },
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
  if (filter === "file") return "최근 등록된 파일이 없습니다.";
  if (filter === "notice") return "최근 공지가 없습니다.";

  return "확인할 알림이 없습니다.";
}

function NotificationIcon({ item }: { item: NotificationItem }) {
  const className = `mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
    item.severity === "danger"
      ? "bg-red-50 text-red-600"
      : item.severity === "warning"
        ? "bg-amber-50 text-amber-600"
        : "bg-blue-50 text-blue-600"
  }`;

  if (item.category === "file") {
    return (
      <div className={className}>
        <FileText size={17} />
      </div>
    );
  }

  if (item.category === "notice") {
    return (
      <div className={className}>
        <Megaphone size={17} />
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

function NotificationRow({
  item,
  onSelect,
}: {
  item: NotificationItem;
  onSelect: () => void;
}) {
  const subDescription =
    item.category === "task"
      ? item.taskType
        ? `${item.description} · ${item.taskType}`
        : item.description
      : item.category === "file"
        ? `${item.description} · ${item.fileTypeLabel || "-"}`
        : item.description;
  const actorLabel =
    item.category === "file" || item.category === "notice"
      ? item.actor || "-"
      : item.assignee || "미배정";
  const dateLabel =
    item.category === "task"
      ? `마감 ${item.dueDate || "-"}`
      : `등록 ${formatDisplayDate(item.date)}`;

  return (
    <Link
      href={item.href}
      onClick={onSelect}
      className="block rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-blue-200 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-100"
    >
      <div className="flex items-start gap-3">
        <NotificationIcon item={item} />

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <Badge
              variant={getSeverityVariant(item.severity)}
              className="shrink-0 px-2.5 py-0.5 font-semibold"
            >
              {item.title}
            </Badge>
            <span className="truncate text-xs text-slate-400">
              {actorLabel}
            </span>
          </div>
          <p className="truncate text-sm font-semibold text-slate-900">
            {item.projectName}
          </p>
          <p className="mt-1 truncate text-sm text-slate-700">
            {subDescription}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{dateLabel}</span>
            {item.statusLabel ? <span>{item.statusLabel}</span> : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    const { data, error } = await loadNotificationSummary();

    if (error) {
      setSummary(null);
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    setSummary(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadNotifications();
    }, 0);

    return () => window.clearTimeout(timer);
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

  const filteredItems = useMemo(() => {
    if (!summary) return [];
    if (activeFilter === "all") return summary.items;

    return summary.items.filter((item) => item.category === activeFilter);
  }, [activeFilter, summary]);

  const unreadCount = summary?.unreadCount || 0;
  const badgeLabel = getBadgeLabel(unreadCount);

  return (
    <>
      <button
        type="button"
        aria-label="알림 열기"
        onClick={() => setIsOpen(true)}
        className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        <Bell size={17} />
        {badgeLabel ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="알림 닫기"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 h-full w-full bg-slate-950/20"
          />

          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-slate-50 shadow-xl sm:right-4 sm:top-4 sm:h-[calc(100vh-2rem)] sm:rounded-2xl sm:border">
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

              <div className="mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1">
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
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
                  알림을 불러오는 중입니다.
                </div>
              ) : errorMessage ? (
                <div className="rounded-2xl border border-red-100 bg-white p-5 text-sm text-red-600">
                  <p className="font-semibold">알림을 불러오지 못했습니다.</p>
                  <p className="mt-1 text-red-500">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={() => void loadNotifications()}
                    className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-white"
                  >
                    다시 시도
                  </button>
                </div>
              ) : filteredItems.length > 0 ? (
                <div className="space-y-3">
                  {filteredItems.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      onSelect={() => setIsOpen(false)}
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
                  title={getEmptyMessage(activeFilter)}
                  className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"
                />
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
