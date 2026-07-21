"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotificationRow } from "@/components/notifications/NotificationCenter";
import {
  loadNotificationSummary,
  type NotificationCategory,
  type NotificationSummary,
} from "@/lib/notifications";

type Filter = "all" | NotificationCategory;

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "task", label: "업무" },
  { value: "shipment", label: "출고" },
  { value: "project", label: "프로젝트" },
  { value: "employee", label: "직원" },
];

export default function NotificationsPage() {
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
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

  const items = useMemo(() => {
    if (!summary) return [];
    return filter === "all"
      ? summary.items
      : summary.items.filter((item) => item.category === filter);
  }, [filter, summary]);

  return (
    <main className="space-y-5 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">모든 알림</h1>
          <p className="mt-1 text-sm text-slate-500">
            업무, 출고, 프로젝트 및 직원 승인 알림을 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadNotifications()}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          새로고침
        </button>
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
            {item.label}
          </button>
        ))}
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
          title="현재 확인해야 할 알림이 없습니다."
          className="rounded-2xl bg-white p-10 text-center text-slate-500 shadow-sm"
        />
      ) : (
        <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              isRead={readIds.has(item.id)}
              onSelect={() =>
                setReadIds((current) => {
                  const next = new Set(current);
                  next.add(item.id);
                  return next;
                })
              }
            />
          ))}
        </section>
      )}
    </main>
  );
}
