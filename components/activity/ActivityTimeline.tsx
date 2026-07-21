"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatActivityTime,
  getActivityIcon,
  type ActivityLog,
} from "@/lib/activity";
import {
  formatAuditValue,
  type AuditChange,
  type AuditValue,
} from "@/lib/audit";
import { supabase } from "@/lib/supabase";
import { getCurrentEmployee, isAdmin } from "@/lib/auth";

type HistoryFilter = "all" | "project" | "task" | "shipment" | "employee";

type ActivityTimelineProps = {
  limit: number;
  projectId?: number;
  compact?: boolean;
  historyOnly?: boolean;
  defaultHistoryFilter?: HistoryFilter;
};

function getActivityIconStyle(activityType: string) {
  if (activityType.startsWith("project_")) return "bg-blue-50 text-blue-700";
  if (activityType.startsWith("task_")) return "bg-emerald-50 text-emerald-700";
  if (activityType.startsWith("shipment_")) return "bg-amber-50 text-amber-700";
  if (activityType.startsWith("file_")) return "bg-violet-50 text-violet-700";
  if (activityType.startsWith("employee_")) return "bg-sky-50 text-sky-700";
  if (activityType === "login_success") return "bg-slate-100 text-slate-700";
  return "bg-slate-50 text-slate-600";
}

function getAuditChanges(activity: ActivityLog): AuditChange[] {
  const rawChanges = activity.metadata?.changes;
  if (!Array.isArray(rawChanges)) return [];

  return rawChanges.flatMap<AuditChange>((change) => {
    if (
      typeof change !== "object" ||
      change === null ||
      Array.isArray(change) ||
      typeof change.field !== "string" ||
      typeof change.label !== "string"
    ) {
      return [];
    }

    return [
      {
        field: change.field,
        label: change.label,
        before: (change.before ?? null) as AuditValue,
        after: (change.after ?? null) as AuditValue,
        beforeLabel:
          typeof change.beforeLabel === "string" ? change.beforeLabel : undefined,
        afterLabel:
          typeof change.afterLabel === "string" ? change.afterLabel : undefined,
      },
    ];
  });
}

export default function ActivityTimeline({
  limit,
  projectId,
  compact = false,
  historyOnly = false,
  defaultHistoryFilter = "all",
}: ActivityTimelineProps) {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const [historyFilter, setHistoryFilter] =
    useState<HistoryFilter>(defaultHistoryFilter);
  const [canViewEmployeeAudit, setCanViewEmployeeAudit] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadActivities = useCallback(async () => {
    let query = supabase
      .from("activity_logs")
      .select(
        "id, created_at, activity_type, action_type, title, description, project_id, employee_id, employee_name, metadata"
      )
      .order("created_at", { ascending: false })
      .limit(historyOnly ? Math.max(limit, 100) : limit);

    if (projectId !== undefined) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (!error) setActivities((data ?? []) as ActivityLog[]);
    setLoading(false);
  }, [historyOnly, limit, projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadActivities(), 0);
    return () => window.clearTimeout(timer);
  }, [loadActivities]);

  useEffect(() => {
    void getCurrentEmployee().then((employee) =>
      setCanViewEmployeeAudit(isAdmin(employee))
    );
  }, []);

  const visibleActivities = useMemo(
    () =>
      activities
        .filter((activity) => !historyOnly || getAuditChanges(activity).length > 0)
        .filter((activity) => {
          if (!historyOnly || historyFilter === "all") return true;
          const activityType = activity.activity_type || activity.action_type;
          return activityType.startsWith(`${historyFilter}_`);
        })
        .slice(0, limit),
    [activities, historyFilter, historyOnly, limit]
  );

  if (loading) {
    return <p className="py-6 text-center text-sm text-slate-400">불러오는 중...</p>;
  }

  return (
    <div>
      {historyOnly && (
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            ["all", "전체"],
            ["project", "프로젝트"],
            ["task", "업무"],
            ["shipment", "출고"],
            ["employee", "직원"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setHistoryFilter(value as HistoryFilter)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                historyFilter === value
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {visibleActivities.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          {historyOnly
            ? "조건에 맞는 변경 이력이 없습니다."
            : "최근 활동이 없습니다."}
        </p>
      ) : (
        <div
          className={`divide-y divide-slate-100 ${
            compact ? "max-h-[620px] overflow-y-auto" : ""
          }`}
        >
          {visibleActivities.map((activity) => {
            const activityType =
              activity.activity_type || activity.action_type;
            const changes =
              activityType.startsWith("employee_") && !canViewEmployeeAudit
                ? []
                : getAuditChanges(activity);
            const isExpanded = expandedIds.has(activity.id);

            return (
              <article
                key={activity.id}
                className={`min-w-0 hover:bg-slate-50 ${
                  compact ? "px-1 py-2.5" : "rounded-xl px-2 py-3"
                }`}
              >
                <div
                  className={`flex min-w-0 items-start ${
                    compact ? "gap-2" : "gap-3"
                  }`}
                >
                  <span
                    className={`flex shrink-0 items-center justify-center rounded-lg ${
                      compact ? "h-7 w-7 text-sm" : "h-8 w-8 text-base"
                    } ${getActivityIconStyle(activityType)}`}
                    aria-hidden="true"
                  >
                    {getActivityIcon(activityType)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate font-semibold text-slate-900 ${
                        compact ? "text-sm leading-5" : "text-base"
                      }`}
                    >
                      {activity.title}
                    </p>
                    {activity.description && (
                      <p
                        className={`mt-0.5 text-slate-600 ${
                          compact ? "truncate text-[12px] leading-4" : "text-sm"
                        }`}
                      >
                        {activity.description}
                      </p>
                    )}
                    <p
                      className={
                        compact
                          ? "mt-0.5 text-[11px] leading-4 text-slate-400"
                          : "mt-1 text-xs text-slate-400"
                      }
                    >
                      {activity.employee_name || "시스템"} ·{" "}
                      {formatActivityTime(activity.created_at)}
                    </p>
                  </div>
                  {changes.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedIds((current) => {
                          const next = new Set(current);
                          if (next.has(activity.id)) next.delete(activity.id);
                          else next.add(activity.id);
                          return next;
                        })
                      }
                      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100"
                      aria-expanded={isExpanded}
                    >
                      {changes.length}개
                      {isExpanded ? (
                        <ChevronDown size={13} />
                      ) : (
                        <ChevronRight size={13} />
                      )}
                    </button>
                  )}
                </div>

                {changes.length > 0 && isExpanded && (
                  <div className="ml-10 mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                    {changes.map((change) => (
                      <div
                        key={`${activity.id}-${change.field}`}
                        className="grid gap-1 text-xs sm:grid-cols-[120px_minmax(0,1fr)]"
                      >
                        <span className="font-semibold text-slate-600">
                          {change.label}
                        </span>
                        <span className="min-w-0 break-words text-slate-500">
                          {formatAuditValue(change.before, change.beforeLabel)}
                          <span className="mx-2 text-slate-300">→</span>
                          <strong className="font-semibold text-slate-800">
                            {formatAuditValue(change.after, change.afterLabel)}
                          </strong>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {activity.project_id && !compact && (
                  <div className="ml-10 mt-2">
                    <Link
                      href={`/projects/${activity.project_id}`}
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      프로젝트로 이동
                    </Link>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
