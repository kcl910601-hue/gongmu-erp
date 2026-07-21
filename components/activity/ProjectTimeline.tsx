"use client";

import Link from "next/link";
import {
  CircleCheck,
  ClipboardList,
  FileText,
  FolderPlus,
  RefreshCcw,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActivityLog, ActivityMetadata } from "@/lib/activity";
import { supabase } from "@/lib/supabase";

type ProjectTimelineProps = {
  projectId: number;
};

type TimelineKind =
  | "project"
  | "task"
  | "shipment"
  | "file"
  | "status"
  | "complete";

type TimelineEvent = {
  activity: ActivityLog;
  kind: TimelineKind;
  label: string;
  detail: string | null;
  href: string;
};

const timelineStyles: Record<
  TimelineKind,
  { icon: LucideIcon; className: string }
> = {
  project: { icon: FolderPlus, className: "bg-blue-50 text-blue-600" },
  task: { icon: ClipboardList, className: "bg-violet-50 text-violet-600" },
  shipment: { icon: Truck, className: "bg-orange-50 text-orange-600" },
  file: { icon: FileText, className: "bg-slate-100 text-slate-600" },
  status: { icon: RefreshCcw, className: "bg-amber-50 text-amber-600" },
  complete: { icon: CircleCheck, className: "bg-emerald-50 text-emerald-600" },
};

function getActivityType(activity: ActivityLog) {
  return activity.activity_type || activity.action_type;
}

function getStatusChange(metadata: ActivityMetadata | null) {
  const changes = metadata?.changes;
  if (!Array.isArray(changes)) return null;

  const statusChange = changes.find(
    (change) =>
      typeof change === "object" &&
      change !== null &&
      !Array.isArray(change) &&
      change.field === "status"
  );

  if (
    typeof statusChange !== "object" ||
    statusChange === null ||
    Array.isArray(statusChange)
  ) {
    return null;
  }

  return {
    before:
      typeof statusChange.beforeLabel === "string"
        ? statusChange.beforeLabel
        : statusChange.before === null
          ? "없음"
          : String(statusChange.before),
    after:
      typeof statusChange.afterLabel === "string"
        ? statusChange.afterLabel
        : statusChange.after === null
          ? "없음"
          : String(statusChange.after),
    completed:
      statusChange.after === "completed" ||
      statusChange.after === "완료" ||
      statusChange.afterLabel === "완료",
  };
}

function createTimelineEvent(
  activity: ActivityLog,
  projectId: number
): TimelineEvent | null {
  const activityType = getActivityType(activity);
  const projectHref = `/projects/${projectId}`;

  if (activityType === "project_create") {
    return {
      activity,
      kind: "project",
      label: "프로젝트 생성",
      detail: activity.description,
      href: `${projectHref}#project-info`,
    };
  }

  if (activityType === "task_create") {
    return {
      activity,
      kind: "task",
      label: "업무 등록",
      detail: activity.description,
      href: `${projectHref}#project-tasks`,
    };
  }

  if (activityType === "task_assignee_change") {
    return {
      activity,
      kind: "task",
      label: "담당자 변경",
      detail: getChangeSummary(activity.metadata, "assignee") || activity.description,
      href: `${projectHref}#project-tasks`,
    };
  }

  if (activityType === "task_complete") {
    return {
      activity,
      kind: "complete",
      label: "업무 완료",
      detail: activity.description,
      href: `${projectHref}#project-tasks`,
    };
  }

  if (activityType === "shipment_create") {
    return {
      activity,
      kind: "shipment",
      label: "출고 등록",
      detail: activity.description,
      href: "/shipments",
    };
  }

  if (activityType === "shipment_complete") {
    return {
      activity,
      kind: "complete",
      label: "출고 완료",
      detail: activity.description,
      href: "/shipments?status=completed",
    };
  }

  if (activityType === "file_upload") {
    return {
      activity,
      kind: "file",
      label: "파일 업로드",
      detail: activity.description,
      href: `${projectHref}#project-files`,
    };
  }

  if (activityType === "project_update") {
    const statusChange = getStatusChange(activity.metadata);
    if (!statusChange) return null;

    return {
      activity,
      kind: statusChange.completed ? "complete" : "status",
      label: statusChange.completed ? "프로젝트 완료" : "프로젝트 상태 변경",
      detail: `${statusChange.before} → ${statusChange.after}`,
      href: `${projectHref}#project-info`,
    };
  }

  return null;
}

function getChangeSummary(
  metadata: ActivityMetadata | null,
  field: string
) {
  const changes = metadata?.changes;
  if (!Array.isArray(changes)) return null;

  const change = changes.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      !Array.isArray(item) &&
      item.field === field
  );

  if (
    typeof change !== "object" ||
    change === null ||
    Array.isArray(change)
  ) {
    return null;
  }

  const before =
    change.before === null || change.before === "" ? "미배정" : String(change.before);
  const after =
    change.after === null || change.after === "" ? "미배정" : String(change.after);
  return `${before} → ${after}`;
}

function getDateKey(createdAt: string | null) {
  if (!createdAt) return "날짜 없음";

  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatRelativeDate(createdAt: string | null) {
  if (!createdAt) return "-";

  const date = new Date(createdAt);
  const today = new Date();
  const startToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.floor(
    (startToday.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
  );
  const time = new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  if (dayDifference === 0) return `오늘 ${time}`;
  if (dayDifference === 1) return `어제 ${time}`;
  if (dayDifference < 7) return `${dayDifference}일 전 ${time}`;

  const weeks = Math.floor(dayDifference / 7);
  return `${weeks}주 전 ${time}`;
}

function formatAbsoluteDate(createdAt: string | null) {
  if (!createdAt) return "-";

  const date = new Date(createdAt);
  const datePart = getDateKey(createdAt);
  const timePart = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${datePart} ${timePart}`;
}

export default function ProjectTimeline({ projectId }: ProjectTimelineProps) {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTimeline = useCallback(async () => {
    const { data, error } = await supabase
      .from("activity_logs")
      .select(
        "id, created_at, activity_type, action_type, title, description, project_id, employee_id, employee_name, metadata"
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error) {
      setActivities([...(data ?? [])].reverse() as ActivityLog[]);
    }
    setIsLoading(false);
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTimeline(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTimeline]);

  const groupedEvents = useMemo(() => {
    const firstTaskActivityId = activities.find(
      (activity) => getActivityType(activity) === "task_create"
    )?.id;
    const events = activities.flatMap<TimelineEvent>((activity) => {
      const event = createTimelineEvent(activity, projectId);
      if (!event) return [];
      return [
        event.activity.id === firstTaskActivityId
          ? { ...event, label: "업무 최초 등록" }
          : event,
      ];
    });

    return events.reduce<Map<string, TimelineEvent[]>>((groups, event) => {
      const dateKey = getDateKey(event.activity.created_at);
      const currentEvents = groups.get(dateKey) ?? [];
      currentEvents.push(event);
      groups.set(dateKey, currentEvents);
      return groups;
    }, new Map());
  }, [activities, projectId]);

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-slate-400">불러오는 중...</p>;
  }

  if (groupedEvents.size === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        아직 기록된 프로젝트 이벤트가 없습니다.
      </p>
    );
  }

  return (
    <div className="max-h-[680px] space-y-6 overflow-y-auto pr-2">
      {Array.from(groupedEvents.entries()).map(([date, events]) => (
        <section key={date}>
          <div className="mb-3 flex items-center gap-3">
            <h3 className="shrink-0 text-xs font-bold text-slate-500">{date}</h3>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="relative ml-4 space-y-1 border-l border-slate-200 pl-6">
            {events.map((event) => {
              const style = timelineStyles[event.kind];
              const Icon = style.icon;

              return (
                <Link
                  key={event.activity.id}
                  href={event.href}
                  className="group relative block rounded-2xl p-3 transition-colors hover:bg-slate-50"
                >
                  <span
                    className={`absolute -left-[43px] top-3 flex h-8 w-8 items-center justify-center rounded-full border-4 border-white ${style.className}`}
                  >
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-700">
                        {event.label}
                      </p>
                      {event.detail && (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                          {event.detail}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <p className="text-xs font-medium text-slate-600">
                        {formatRelativeDate(event.activity.created_at)}
                      </p>
                      <time className="mt-0.5 block text-[11px] text-slate-400">
                        {formatAbsoluteDate(event.activity.created_at)}
                      </time>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
