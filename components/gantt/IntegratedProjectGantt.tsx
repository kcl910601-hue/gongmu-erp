"use client";

import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Crosshair,
  Download,
  LocateFixed,
  Minus,
  Monitor,
  Pin,
  Plus,
  Search,
  SlidersHorizontal,
  Redo2,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { GanttTaskDetailModal } from "@/components/gantt/GanttTaskDetailModal";
import { GanttMemoModal, type GanttMemoTarget } from "@/components/gantt/GanttMemoModal";
import { GanttAssigneeModal } from "@/components/gantt/GanttAssigneeModal";
import { TaskTagSelector } from "@/components/common/TaskTagSelector";
import { GanttBulkEditModal, type GanttBulkEditKind } from "@/components/gantt/GanttBulkEditModal";
import { GanttDependencyModal, type GanttDependencyItem } from "@/components/gantt/GanttDependencyModal";
import { GanttExcelExportDialog, type GanttExportRange } from "@/components/gantt/GanttExcelExportDialog";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity";
import { TASK_TAGS, getTaskTagDefinition, type TaskTagCode } from "@/lib/task-tags";
import { formatProjectQuantity } from "@/lib/project-quantity";
import { compareTasksBySchedule, persistRecalculatedTaskOrders, recalculateTaskOrders } from "@/lib/task-ordering";
import { withShortEditingLock, withShortEditingLocks } from "@/lib/editing-locks";
import { getDday } from "@/lib/dday";
import { downloadGanttWorkbook, filterGanttTasksForRange, getTemplateFileName, groupGanttTasksByProject, type GanttExcelTask, type GanttExportTemplate } from "@/lib/excel/gantt-export";
import { toast } from "@/lib/toast";
import { getLatestTaskNotes, TASK_NOTES_CHANGED_EVENT, type TaskNotePreview } from "@/lib/task-notes";
import {
  getProjectStatusLabel,
  getTaskStatusLabel,
  isProjectCompleted,
  isTaskCompleted,
  normalizeProjectStatus,
  normalizeTaskStatus,
} from "@/lib/status";

export type IntegratedProject = {
  id: number;
  project_code: string | null;
  project_name: string;
  assembly_vendor: string | null;
  salesperson: string | null;
  task_manager: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  completion_due_date?: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  process_type?: string | null;
};

export type IntegratedTask = {
  id: number;
  project_id: number;
  project_section_id?: number | null;
  project_assembly_vendor_id: number | null;
  project_assembly_vendor?: {
    id: number;
    allocated_quantity: number | null;
    organization: { name: string } | null;
  } | null;
  task_order: number | null;
  task_name: string | null;
  task_type: string | null;
  assignee: string | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
  created_at: string | null;
};

type GanttSegment = {
  task: IntegratedTask;
  startDate: string;
  dueDate: string;
  lane: number;
};

type ProjectScheduleMemo = {
  id: string;
  project_id: number;
  memo_date: string;
  content: string;
};

type TaskScheduleMemo = {
  id: string;
  task_id: number;
  content: string;
};

type TaskTagRow = {
  task_id: number;
  tag: string;
};

type ProjectRow = {
  rowKey: string;
  project: IntegratedProject;
  assemblyVendorId: number | null;
  assemblyVendorName: string;
  allocatedQuantity: number | null;
  progress: number;
  taskCount: number;
  completedCount: number;
  delayedCount: number;
  earliestDueDate: string | null;
  laneCount: number;
  rowHeight: number;
  segments: GanttSegment[];
};

type IntegratedProjectGanttProps = {
  projects: IntegratedProject[];
  tasks: IntegratedTask[];
  visibleTaskIds: Set<number>;
  currentMonth: string;
  today: string;
  onCurrentMonthChange?: (month: string) => void;
  onTaskUpdated: (task: IntegratedTask) => void;
  canEdit: boolean;
  canExport: boolean;
  showCompletedProjects: boolean;
  onShowCompletedProjectsChange: (showCompleted: boolean) => void;
};

type TaskDragState = {
  task: IntegratedTask;
  project: IntegratedProject;
  pointerId: number;
  originClientX: number;
  offsetDays: number;
  startDate: string;
  dueDate: string;
  lane: number;
};

type TaskResizeState = {
  task: IntegratedTask;
  project: IntegratedProject;
  edge: "start" | "end";
  pointerId: number;
  originClientX: number;
  offsetDays: number;
  startDate: string;
  dueDate: string;
  lane: number;
};

type TaskContextMenuState = {
  x: number;
  y: number;
  task: IntegratedTask;
  project: IntegratedProject;
};

type GanttScheduleChange = {
  taskId: number;
  before: { startDate: string; dueDate: string };
  after: { startDate: string; dueDate: string };
  taskName: string;
  projectName: string;
  source: "primary" | "multi-select" | "dependency";
};

type GanttHistoryEntry = {
  id: string;
  action: "move" | "resize";
  changes: GanttScheduleChange[];
  createdAt: number;
};

type PendingDependencyMove = {
  action: "move" | "resize";
  primaryTaskId: number;
  offsetDays: number;
  baseChanges: GanttScheduleChange[];
  dependencyChanges: GanttScheduleChange[];
};

export type GanttTaskDetail = {
  taskId: number;
  projectId: number;
  projectName: string;
  assemblyVendorName: string;
  projectCode: string | null;
  taskName: string | null;
  taskType: string | null;
  assignee: string | null;
  startDate: string;
  dueDate: string;
  status: string | null;
  completedDate: string | null;
  delayedDays: number | null;
  taskTypeClassName: string;
  memo: string | null;
  memoIsImportant: boolean;
  processTypeName?: string | null;
};

type TaskTypeColor = {
  label: string;
  className: string;
  swatchClassName: string;
};

type GanttStatusFilter = "all" | "incomplete" | "delayed" | "today" | "week";
type GanttSortKey =
  | "project_name"
  | "assembly_vendor"
  | "due_date"
  | "delayed"
  | "progress";
const GANTT_VIEW_TYPES = {
  project: "project",
  vendor: "vendor",
  salesperson: "salesperson",
  assignee: "assignee",
  status: "status",
  process: "process",
} as const;
type GanttViewType = typeof GANTT_VIEW_TYPES[keyof typeof GANTT_VIEW_TYPES];
type GanttDisplayItem =
  | { kind: "group"; key: string; label: string; count: number; collapsed: boolean; height: number }
  | { kind: "row"; key: string; row: ProjectRow; height: number };

type PresentationPreferences = {
  scrollLeft: number;
  scrollTop: number;
  zoom: number;
  collapsedMonths: string[];
  rangeOption: "today" | "all";
  meetingFocus: boolean;
  timeline: string;
  searchQuery: string;
  statusFilter: GanttStatusFilter;
  assigneeFilter: string;
  taskTypeFilter: string;
  assemblyVendorFilter: string;
};

const baseDayWidth = 36;
const collapsedMonthWidth = 68;
const groupHeaderHeight = 36;
const PRESENTATION_KEY = "erp-gantt-presentation";
const baseRowHeight = 58;
const laneHeight = 22;
const maxLanes = 3;
const MAX_GANTT_HISTORY = 50;
const dayFormatter = new Intl.DateTimeFormat("ko-KR", { day: "2-digit" });
const weekdayFormatter = new Intl.DateTimeFormat("ko-KR", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
});

function formatGanttMonthLabel(monthKey: string, isCollapsed: boolean) {
  const [year, month] = monthKey.split("-");
  if (isCollapsed) return `${year.slice(-2)}.${month}`;
  return monthFormatter.format(parseDate(`${monthKey}-01`));
}

function buildGroupedView(
  rows: ProjectRow[],
  viewType: GanttViewType,
  collapsedGroups: Set<string>
): GanttDisplayItem[] {
  if (viewType === GANTT_VIEW_TYPES.project) {
    return rows.map((row) => ({ kind: "row", key: row.rowKey, row, height: row.rowHeight }));
  }

  if (viewType !== GANTT_VIEW_TYPES.vendor && viewType !== GANTT_VIEW_TYPES.salesperson) {
    return rows.map((row) => ({ kind: "row", key: row.rowKey, row, height: row.rowHeight }));
  }

  const groupedRows = new Map<string, ProjectRow[]>();
  rows.forEach((row) => {
    const label = viewType === GANTT_VIEW_TYPES.vendor
      ? row.assemblyVendorName || "업체 미지정"
      : row.project.salesperson?.trim() || "영업자 미지정";
    groupedRows.set(label, [...(groupedRows.get(label) ?? []), row]);
  });

  return Array.from(groupedRows.entries())
    .sort(([labelA], [labelB]) => labelA.localeCompare(labelB))
    .flatMap(([label, groupRows]) => {
      const key = `${viewType}:${label}`;
      const collapsed = collapsedGroups.has(key);
      const projectCount = new Set(groupRows.map((row) => row.project.id)).size;
      const header: GanttDisplayItem = {
        kind: "group",
        key,
        label,
        count: projectCount,
        collapsed,
        height: groupHeaderHeight,
      };
      if (collapsed) return [header];
      const sortedRows = [...groupRows].sort((a, b) => {
        const aStart = a.segments[0]?.startDate ?? "9999-12-31";
        const bStart = b.segments[0]?.startDate ?? "9999-12-31";
        return aStart.localeCompare(bStart) || a.project.project_name.localeCompare(b.project.project_name);
      });
      return [
        header,
        ...sortedRows.map((row): GanttDisplayItem => ({ kind: "row", key: row.rowKey, row, height: row.rowHeight })),
      ];
    });
}
const defaultTaskTypeColor: TaskTypeColor = {
  label: "기타",
  className: "bg-[#E2E8F0] text-slate-800 ring-slate-300",
  swatchClassName: "bg-[#E2E8F0] ring-slate-300",
};

const taskTypeColorRules: Array<{
  keywords: string[];
  color: TaskTypeColor;
}> = [
  {
    keywords: ["기획", "설계"],
    color: {
      label: "기획/설계",
      className: "bg-[#A8D8EA] text-slate-800 ring-[#86BFD7]",
      swatchClassName: "bg-[#A8D8EA] ring-[#86BFD7]",
    },
  },
  {
    keywords: ["실측"],
    color: {
      label: "실측",
      className: "bg-[#F8C8DC] text-slate-800 ring-[#DFA9C0]",
      swatchClassName: "bg-[#F8C8DC] ring-[#DFA9C0]",
    },
  },
  {
    keywords: ["발주"],
    color: {
      label: "발주",
      className: "bg-[#FFE5B4] text-slate-800 ring-[#E8C98F]",
      swatchClassName: "bg-[#FFE5B4] ring-[#E8C98F]",
    },
  },
  {
    keywords: ["생산", "제작", "입고"],
    color: {
      label: "생산/제작",
      className: "bg-[#B5EAD7] text-slate-800 ring-[#8FCDB6]",
      swatchClassName: "bg-[#B5EAD7] ring-[#8FCDB6]",
    },
  },
  {
    keywords: ["시공", "현장"],
    color: {
      label: "시공/현장",
      className: "bg-[#FFD3B6] text-slate-800 ring-[#E9B590]",
      swatchClassName: "bg-[#FFD3B6] ring-[#E9B590]",
    },
  },
  {
    keywords: ["검수"],
    color: {
      label: "검수",
      className: "bg-[#D4F0F0] text-slate-800 ring-[#A9D4D4]",
      swatchClassName: "bg-[#D4F0F0] ring-[#A9D4D4]",
    },
  },
  {
    keywords: ["출고"],
    color: {
      label: "출고",
      className: "bg-[#C7CEEA] text-slate-800 ring-[#A5AED2]",
      swatchClassName: "bg-[#C7CEEA] ring-[#A5AED2]",
    },
  },
  {
    keywords: ["AS", "A/S"],
    color: {
      label: "AS",
      className: "bg-[#D4F0F0] text-slate-800 ring-[#A9D4D4]",
      swatchClassName: "bg-[#D4F0F0] ring-[#A9D4D4]",
    },
  },
  {
    keywords: ["완료"],
    color: {
      label: "완료",
      className: "bg-[#D9EAD3] text-slate-800 ring-[#B7D0AE]",
      swatchClassName: "bg-[#D9EAD3] ring-[#B7D0AE]",
    },
  },
  {
    keywords: ["지연"],
    color: {
      label: "지연",
      className: "bg-[#F4CCCC] text-slate-800 ring-[#DCAAAA]",
      swatchClassName: "bg-[#F4CCCC] ring-[#DCAAAA]",
    },
  },
  {
    keywords: ["보류"],
    color: {
      label: "보류",
      className: "bg-[#EAD1DC] text-slate-800 ring-[#CEB2BF]",
      swatchClassName: "bg-[#EAD1DC] ring-[#CEB2BF]",
    },
  },
  {
    keywords: ["기타"],
    color: defaultTaskTypeColor,
  },
];

const statusFilterOptions: Array<{ value: GanttStatusFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "incomplete", label: "미완료" },
  { value: "delayed", label: "지연" },
  { value: "today", label: "오늘" },
  { value: "week", label: "이번 주" },
];
const taskStatusOptions = ["pending", "in_progress", "completed"] as const;

const sortOptions: Array<{ value: GanttSortKey; label: string }> = [
  { value: "project_name", label: "프로젝트명" },
  { value: "assembly_vendor", label: "조립처순" },
  { value: "due_date", label: "종료일 빠른 순" },
  { value: "delayed", label: "지연 업무 많은 순" },
  { value: "progress", label: "진행률 낮은 순" },
];

function parseDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

function getDayDiff(startDate: string, endDate: string) {
  return getDday(endDate, startDate)?.diff ?? 0;
}

function getMonthRange(month: string) {
  const [year, monthValue] = month.split("-").map(Number);
  const startDate = new Date(year, monthValue - 1, 1);
  const endDate = new Date(year, monthValue, 0);

  return {
    start: formatDate(startDate),
    end: formatDate(endDate),
  };
}

function getDateRange(startDate: string, endDate: string) {
  const days: string[] = [];
  let cursor = parseDate(startDate);
  const end = parseDate(endDate);

  while (cursor <= end) {
    days.push(formatDate(cursor));
    cursor = addDays(cursor, 1);
  }

  return days;
}

function isWeekend(date: string) {
  const day = parseDate(date).getDay();

  return day === 0 || day === 6;
}

function getWeekRange(date: string) {
  const baseDate = parseDate(date);
  const mondayIndex = (baseDate.getDay() + 6) % 7;
  const startDate = new Date(baseDate);
  const endDate = new Date(baseDate);

  startDate.setDate(baseDate.getDate() - mondayIndex);
  endDate.setDate(startDate.getDate() + 6);

  return {
    start: formatDate(startDate),
    end: formatDate(endDate),
  };
}

function getProjectStatusVariant(status: string | null): BadgeVariant {
  const statusValue = normalizeProjectStatus(status);

  if (statusValue === "completed") return "success";
  if (statusValue === "in_progress") return "info";
  if (statusValue === "hold") return "warning";
  return "default";
}

function getDelayedDays(task: IntegratedTask, today: string) {
  if (isTaskCompleted(task.status) || !task.due_date) {
    return null;
  }
  const dday = getDday(task.due_date, today);
  return dday?.isExpired ? Math.abs(dday.diff) : null;
}

function getTaskTypeLabel(taskType: string | null) {
  return taskType?.trim() || "미지정";
}

function getTaskTypeColor(taskType: string | null): TaskTypeColor {
  const label = getTaskTypeLabel(taskType);
  const matchedRule = taskTypeColorRules.find((rule) =>
    rule.keywords.some((keyword) => label.includes(keyword))
  );

  if (matchedRule) return matchedRule.color;

  return {
    label,
    className: defaultTaskTypeColor.className,
    swatchClassName: defaultTaskTypeColor.swatchClassName,
  };
}

function getScheduleMarkerClass(task: IntegratedTask, today: string) {
  if (isTaskCompleted(task.status)) {
    return "border border-transparent opacity-60";
  }

  if (getDelayedDays(task, today) !== null) {
    return "border-l-4 border-red-400 ring-2 ring-red-200";
  }

  if (task.due_date === today) {
    return "border-l-4 border-amber-400 ring-2 ring-amber-200";
  }

  return "border border-transparent";
}

function getTaskAssemblyVendorName(task: IntegratedTask) {
  return task.project_assembly_vendor?.organization?.name?.trim() || "업체 미지정";
}

function getTaskStatusPresentation(task: IntegratedTask, today: string) {
  const delayedDays = getDelayedDays(task, today);
  if (delayedDays !== null) {
    return { icon: "⚠", label: `지연 ${delayedDays}일` };
  }
  const status = normalizeTaskStatus(task.status) || "pending";
  if (status === "completed") return { icon: "✔", label: getTaskStatusLabel(status) };
  if (status === "in_progress") return { icon: "▶", label: getTaskStatusLabel(status) };
  return { icon: "⏸", label: getTaskStatusLabel(status) };
}

function assignSegmentLanes(
  segments: Array<Omit<GanttSegment, "lane">>
): { segments: GanttSegment[]; laneCount: number } {
  const laneEndDates: string[] = [];
  const assignedSegments = segments.map((segment) => {
    let lane = laneEndDates.findIndex((endDate) => endDate < segment.startDate);

    if (lane === -1) {
      lane = Math.min(laneEndDates.length, maxLanes - 1);
    }

    laneEndDates[lane] = segment.dueDate;

    return {
      ...segment,
      lane,
    };
  });

  return {
    segments: assignedSegments,
    laneCount: Math.max(1, Math.min(laneEndDates.length, maxLanes)),
  };
}

export function IntegratedProjectGantt({
  projects,
  tasks,
  visibleTaskIds,
  currentMonth,
  today,
  onCurrentMonthChange,
  onTaskUpdated,
  canEdit,
  canExport,
  showCompletedProjects,
  onShowCompletedProjectsChange,
}: IntegratedProjectGanttProps) {
  const presentationRef = useRef<HTMLDivElement | null>(null);
  const ganttSurfaceRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineContentRef = useRef<HTMLDivElement | null>(null);
  const hasInitialTodayScrollRef = useRef(false);
  const hasInitializedMonthLayoutRef = useRef(false);
  const columnFocusRef = useRef<HTMLDivElement | null>(null);
  const cellFocusRef = useRef<HTMLDivElement | null>(null);
  const laserRef = useRef<HTMLDivElement | null>(null);
  const spotlightRef = useRef<HTMLDivElement | null>(null);
  const focusedRowElementsRef = useRef<HTMLElement[]>([]);
  const focusLockedRef = useRef(false);
  const suppressTaskClickUntilRef = useRef(0);
  const taskClickTimerRef = useRef<number | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const pointerFrozenRef = useRef(false);
  const projectRowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<GanttStatusFilter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState("전체");
  const [taskTypeFilter, setTaskTypeFilter] = useState("전체");
  const [assemblyVendorFilter, setAssemblyVendorFilter] = useState("전체");
  const [sortKey, setSortKey] = useState<GanttSortKey>("project_name");
  const [viewType, setViewType] = useState<GanttViewType>(GANTT_VIEW_TYPES.project);
  const [collapsedViewGroups, setCollapsedViewGroups] = useState<Set<string>>(() => new Set());
  const [selectedTask, setSelectedTask] = useState<GanttTaskDetail | null>(null);
  const [memoTarget, setMemoTarget] = useState<GanttMemoTarget | null>(null);
  const [projectMemos, setProjectMemos] = useState<ProjectScheduleMemo[]>([]);
  const [taskMemos, setTaskMemos] = useState<TaskScheduleMemo[]>([]);
  const [taskNotePreviews, setTaskNotePreviews] = useState<Map<number, TaskNotePreview>>(new Map());
  const [taskDrag, setTaskDrag] = useState<TaskDragState | null>(null);
  const [taskResize, setTaskResize] = useState<TaskResizeState | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<number | null>(null);
  const [taskContextMenu, setTaskContextMenu] = useState<TaskContextMenuState | null>(null);
  const [assigneeTask, setAssigneeTask] = useState<{ task: IntegratedTask; project: IntegratedProject } | null>(null);
  const [tagTask, setTagTask] = useState<{ task: IntegratedTask; project: IntegratedProject } | null>(null);
  const [dependencyTask, setDependencyTask] = useState<{ task: IntegratedTask; project: IntegratedProject } | null>(null);
  const [dependencies, setDependencies] = useState<GanttDependencyItem[]>([]);
  const [dependencyLoadState, setDependencyLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [pendingDependencyMove, setPendingDependencyMove] = useState<PendingDependencyMove | null>(null);
  const [taskTags, setTaskTags] = useState<TaskTagRow[]>([]);
  const [selectedTagFilters, setSelectedTagFilters] = useState<Set<TaskTagCode>>(() => new Set());
  const [undoStack, setUndoStack] = useState<GanttHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<GanttHistoryEntry[]>([]);
  const [isHistoryApplying, setIsHistoryApplying] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(() => new Set());
  const [selectionAnchorTaskId, setSelectionAnchorTaskId] = useState<number | null>(null);
  const [bulkEditKind, setBulkEditKind] = useState<GanttBulkEditKind | null>(null);
  const [isBulkApplying, setIsBulkApplying] = useState(false);
  const [isExcelDialogOpen, setIsExcelDialogOpen] = useState(false);
  const [isExcelExporting, setIsExcelExporting] = useState(false);
  const [isPresentation, setIsPresentation] = useState(false);
  const [isPresentationFilterOpen, setIsPresentationFilterOpen] =
    useState(false);
  const [zoom, setZoom] = useState(100);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(
    () => new Set()
  );
  const [isInitialMonthLayoutReady, setIsInitialMonthLayoutReady] = useState(false);
  const [meetingFocus, setMeetingFocus] = useState(false);
  const [laserEnabled, setLaserEnabled] = useState(false);
  const [spotlightEnabled, setSpotlightEnabled] = useState(false);
  const [pointerFrozen, setPointerFrozen] = useState(false);
  const [focusLocked, setFocusLocked] = useState(false);
  const [highlightedProjectId, setHighlightedProjectId] = useState<
    number | null
  >(null);
  const { start, end } = useMemo(() => {
    const fallback = getMonthRange(currentMonth);
    const visibleTasks = tasks.filter((task) => visibleTaskIds.has(task.id));
    const visibleProjectIds = new Set(
      visibleTasks.map((task) => task.project_id)
    );
    const startDates = [
      today,
      ...visibleTasks.flatMap((task) =>
        [task.start_date, task.due_date].filter(
          (date): date is string => Boolean(date)
        )
      ),
      ...projects
        .filter((project) => visibleProjectIds.has(project.id))
        .flatMap((project) =>
          [project.start_date].filter(
            (date): date is string => Boolean(date)
          )
        ),
    ].sort();
    const endDates = [
      today,
      ...visibleTasks.flatMap((task) =>
        [task.due_date, task.completed_date, task.start_date].filter(
          (date): date is string => Boolean(date)
        )
      ),
      ...projects
        .filter((project) => visibleProjectIds.has(project.id))
        .flatMap((project) =>
          [
            project.end_date,
            project.completion_due_date,
            project.start_date,
          ].filter((date): date is string => Boolean(date))
        ),
    ].sort();

    return {
      start: startDates[0] || fallback.start,
      end: endDates[endDates.length - 1] || fallback.end,
    };
  }, [currentMonth, projects, tasks, today, visibleTaskIds]);
  const dateDays = useMemo(() => getDateRange(start, end), [end, start]);

  useEffect(() => {
    if (hasInitializedMonthLayoutRef.current || dateDays.length === 0 || tasks.length === 0) return;
    const currentMonthKey = today.slice(0, 7);
    const previousMonthDate = parseDate(`${currentMonthKey}-01`);
    previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
    const previousMonthKey = formatDate(previousMonthDate).slice(0, 7);
    const visibleProjectIds = new Set(
      projects
        .filter((project) => showCompletedProjects || !isProjectCompleted(project.status))
        .map((project) => project.id)
    );
    const lastTaskMonth = tasks
      .filter((task) => visibleTaskIds.has(task.id) && visibleProjectIds.has(task.project_id))
      .flatMap((task) => [task.start_date, task.due_date].filter((date): date is string => Boolean(date)))
      .sort()
      .at(-1)
      ?.slice(0, 7) ?? currentMonthKey;
    const lastExpandedMonth = lastTaskMonth > currentMonthKey ? lastTaskMonth : currentMonthKey;
    setCollapsedMonths(new Set(
      dateDays
        .map((date) => date.slice(0, 7))
        .filter((month, index, months) => months.indexOf(month) === index)
        .filter((month) => month < previousMonthKey || month > lastExpandedMonth)
    ));
    hasInitializedMonthLayoutRef.current = true;
    setIsInitialMonthLayoutReady(true);
  }, [dateDays, projects, showCompletedProjects, tasks, today, visibleTaskIds]);
  const dayWidth = baseDayWidth * (zoom / 100);
  const timelineColumns = useMemo(() => {
    const columns: Array<{ key: string; monthKey: string; date: string | null; width: number }> = [];
    const handledCollapsedMonths = new Set<string>();
    dateDays.forEach((date) => {
      const monthKey = date.slice(0, 7);
      if (collapsedMonths.has(monthKey)) {
        if (!handledCollapsedMonths.has(monthKey)) {
          columns.push({ key: `collapsed-${monthKey}`, monthKey, date: null, width: collapsedMonthWidth });
          handledCollapsedMonths.add(monthKey);
        }
        return;
      }
      columns.push({ key: date, monthKey, date, width: dayWidth });
    });
    return columns;
  }, [collapsedMonths, dateDays, dayWidth]);
  const visibleDateDays = useMemo(
    () => timelineColumns.flatMap((column) => column.date ? [column.date] : []),
    [timelineColumns]
  );
  const timelineWidth = useMemo(
    () => timelineColumns.reduce((total, column) => total + column.width, 0),
    [timelineColumns]
  );
  const timelineColumnLefts = useMemo(() => {
    let left = 0;
    return timelineColumns.map((column) => {
      const currentLeft = left;
      left += column.width;
      return currentLeft;
    });
  }, [timelineColumns]);
  const monthGroups = useMemo(() => {
    const groups: Array<{ key: string; width: number; collapsed: boolean }> = [];
    timelineColumns.forEach((column) => {
      const last = groups[groups.length - 1];
      if (last?.key === column.monthKey) last.width += column.width;
      else groups.push({ key: column.monthKey, width: column.width, collapsed: column.date === null });
    });
    return groups;
  }, [timelineColumns]);
  const dateLeftByValue = useMemo(() => new Map(
    timelineColumns.flatMap((column, index) => column.date ? [[column.date, timelineColumnLefts[index]] as const] : [])
  ), [timelineColumnLefts, timelineColumns]);

  const getVisibleRangeGeometry = useCallback((rangeStart: string, rangeEnd: string) => {
    const visibleIndexes = timelineColumns.flatMap((column, index) =>
      column.date && column.date >= rangeStart && column.date <= rangeEnd ? [index] : []
    );
    if (visibleIndexes.length === 0) return null;
    const firstIndex = visibleIndexes[0];
    const lastIndex = visibleIndexes[visibleIndexes.length - 1];
    const left = timelineColumnLefts[firstIndex];
    const right = timelineColumnLefts[lastIndex] + timelineColumns[lastIndex].width;
    return { left, width: Math.max(right - left, 28) };
  }, [timelineColumnLefts, timelineColumns]);

  function getTimelineColumnAtOffset(offset: number) {
    const index = timelineColumns.findIndex(
      (column, columnIndex) => offset < timelineColumnLefts[columnIndex] + column.width
    );
    return index >= 0 ? { column: timelineColumns[index], left: timelineColumnLefts[index] } : null;
  }

  function getCalendarOffsetForVisibleStep(anchorDate: string, visibleStep: number) {
    if (visibleStep === 0 || visibleDateDays.length === 0) return 0;
    let anchorIndex = visibleDateDays.findIndex((date) => date >= anchorDate);
    if (anchorIndex === -1) anchorIndex = visibleDateDays.length - 1;
    const targetIndex = Math.max(0, Math.min(anchorIndex + visibleStep, visibleDateDays.length - 1));
    return getDayDiff(anchorDate, visibleDateDays[targetIndex]);
  }

  function syncHorizontalScroll(scrollLeft: number, source: "top" | "header" | "body") {
    if (source !== "top" && topScrollRef.current && topScrollRef.current.scrollLeft !== scrollLeft) {
      topScrollRef.current.scrollLeft = scrollLeft;
    }
    if (source !== "header" && headerScrollRef.current && headerScrollRef.current.scrollLeft !== scrollLeft) {
      headerScrollRef.current.scrollLeft = scrollLeft;
    }
    if (source !== "body" && scrollRef.current && scrollRef.current.scrollLeft !== scrollLeft) {
      scrollRef.current.scrollLeft = scrollLeft;
    }
  }

  const weekRange = useMemo(() => getWeekRange(today), [today]);
  const projectIdsKey = useMemo(() => projects.map((project) => project.id).sort((a, b) => a - b).join(","), [projects]);
  const taskIdsKey = useMemo(() => tasks.map((task) => task.id).sort((a, b) => a - b).join(","), [tasks]);

  useEffect(() => {
    let isActive = true;

    async function loadMemos() {
      const projectIds = projectIdsKey ? projectIdsKey.split(",").map(Number) : [];
      const taskIds = taskIdsKey ? taskIdsKey.split(",").map(Number) : [];
      const [projectResult, taskResult, taskNoteResult] = await Promise.all([
        projectIds.length
          ? supabase.from("project_schedule_memos").select("id, project_id, memo_date, content").in("project_id", projectIds)
          : Promise.resolve({ data: [], error: null }),
        taskIds.length
          ? supabase.from("task_schedule_memos").select("id, task_id, content").in("task_id", taskIds)
          : Promise.resolve({ data: [], error: null }),
        taskIds.length
          ? supabase.from("task_notes").select("id, task_id, note, is_important, check_date, created_at, created_by_name").in("task_id", taskIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (!isActive) return;
      if (projectResult.error || taskResult.error || taskNoteResult.error) {
        console.error("Gantt memo load error:", projectResult.error || taskResult.error || taskNoteResult.error);
        return;
      }
      setProjectMemos((projectResult.data || []) as ProjectScheduleMemo[]);
      setTaskMemos((taskResult.data || []) as TaskScheduleMemo[]);
      setTaskNotePreviews(getLatestTaskNotes((taskNoteResult.data || []).map((note) => ({ id: String(note.id), taskId: Number(note.task_id), note: String(note.note), isImportant: Boolean(note.is_important), checkDate: note.check_date ? String(note.check_date) : null, createdAt: String(note.created_at), createdByName: note.created_by_name ? String(note.created_by_name) : null }))));
    }

    void loadMemos();
    window.addEventListener(TASK_NOTES_CHANGED_EVENT, loadMemos);
    return () => { isActive = false; window.removeEventListener(TASK_NOTES_CHANGED_EVENT, loadMemos); };
  }, [projectIdsKey, taskIdsKey]);

  useEffect(() => {
    if (!taskContextMenu) return;
    function closeOnPointerDown(event: PointerEvent) {
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      setTaskContextMenu(null);
    }
    function closeMenu() {
      setTaskContextMenu(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [taskContextMenu]);

  useEffect(() => {
    let isActive = true;
    async function loadTaskTags() {
      const taskIds = taskIdsKey ? taskIdsKey.split(",").map(Number) : [];
      if (taskIds.length === 0) {
        setTaskTags([]);
        return;
      }
      const { data, error } = await supabase
        .from("task_tags")
        .select("task_id, tag")
        .in("task_id", taskIds);
      if (!isActive) return;
      if (error) {
        console.error("Gantt task tag load error:", error);
        return;
      }
      setTaskTags((data || []) as TaskTagRow[]);
    }
    void loadTaskTags();
    return () => { isActive = false; };
  }, [taskIdsKey]);

  useEffect(() => {
    let isActive = true;
    async function loadDependencies() {
      setDependencyLoadState("loading");
      const taskIds = taskIdsKey ? taskIdsKey.split(",").map(Number) : [];
      if (taskIds.length === 0) {
        setDependencies([]);
        setDependencyLoadState("ready");
        return;
      }
      const { data, error } = await supabase
        .from("task_dependencies")
        .select("id, predecessor_task_id, successor_task_id, dependency_type")
        .in("successor_task_id", taskIds);
      if (!isActive) return;
      if (error) {
        console.error("Gantt dependency load error:", error);
        setDependencyLoadState("error");
        return;
      }
      setDependencies((data || []) as GanttDependencyItem[]);
      setDependencyLoadState("ready");
    }
    void loadDependencies();
    return () => { isActive = false; };
  }, [taskIdsKey]);

  function openProjectMemo(project: IntegratedProject, memoDate: string) {
    const memo = projectMemos.find((item) => item.project_id === project.id && item.memo_date === memoDate);
    setMemoTarget({
      type: "project",
      projectId: project.id,
      projectName: project.project_name,
      date: memoDate,
      taskId: null,
      taskName: null,
      memoId: memo?.id || null,
      content: memo?.content || "",
    });
  }

  function openTaskMemo(project: IntegratedProject, task: IntegratedTask) {
    const memo = taskMemos.find((item) => item.task_id === task.id);
    setMemoTarget({
      type: "task",
      projectId: project.id,
      projectName: project.project_name,
      date: null,
      taskId: task.id,
      taskName: task.task_name,
      memoId: memo?.id || null,
      content: memo?.content || "",
    });
  }

  async function saveMemo(content: string) {
    if (!memoTarget) return;

    if (memoTarget.type === "project" && memoTarget.date) {
      const { data, error } = await supabase.from("project_schedule_memos").upsert({
        project_id: memoTarget.projectId,
        memo_date: memoTarget.date,
        content,
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id,memo_date" }).select("id, project_id, memo_date, content").single();
      if (error) throw error;
      const saved = data as ProjectScheduleMemo;
      setProjectMemos((current) => [...current.filter((item) => !(item.project_id === saved.project_id && item.memo_date === saved.memo_date)), saved]);
    } else if (memoTarget.taskId !== null) {
      const { data, error } = await supabase.from("task_schedule_memos").upsert({
        task_id: memoTarget.taskId,
        content,
        updated_at: new Date().toISOString(),
      }, { onConflict: "task_id" }).select("id, task_id, content").single();
      if (error) throw error;
      const saved = data as TaskScheduleMemo;
      setTaskMemos((current) => [...current.filter((item) => item.task_id !== saved.task_id), saved]);
    }
    setMemoTarget(null);
  }

  async function deleteMemo() {
    if (!memoTarget?.memoId) return;
    const table = memoTarget.type === "project" ? "project_schedule_memos" : "task_schedule_memos";
    const { error } = await supabase.from(table).delete().eq("id", memoTarget.memoId);
    if (error) throw error;
    if (memoTarget.type === "project") {
      setProjectMemos((current) => current.filter((item) => item.id !== memoTarget.memoId));
    } else {
      setTaskMemos((current) => current.filter((item) => item.id !== memoTarget.memoId));
    }
    setMemoTarget(null);
  }

  async function createDependency(successorTask: IntegratedTask, predecessorTaskId: number) {
    const predecessor = tasks.find((task) => task.id === predecessorTaskId);
    if (!predecessor || predecessor.project_id !== successorTask.project_id) throw new Error("같은 프로젝트의 업무만 연결할 수 있습니다.");
    if (predecessor.project_assembly_vendor_id !== successorTask.project_assembly_vendor_id) throw new Error("같은 조립업체의 업무만 연결할 수 있습니다.");
    const { data, error } = await supabase.rpc("create_task_dependency", {
      p_predecessor_task_id: predecessorTaskId,
      p_successor_task_id: successorTask.id,
    });
    if (error) throw error;
    const saved = data as GanttDependencyItem;
    setDependencies((current) => [...current.filter((item) => item.id !== saved.id), saved]);
    void logActivity({
      type: "task_update",
      title: "선후관계 생성",
      description: `${predecessor.task_name || "업무"}\n↓\n${successorTask.task_name || "업무"}\nFS`,
      projectId: successorTask.project_id,
      targetType: "task",
      targetId: successorTask.id,
      metadata: { dependencyId: saved.id, predecessorTaskId, successorTaskId: successorTask.id, dependencyType: "FS" },
    });
  }

  async function deleteDependency(dependency: GanttDependencyItem) {
    const { error } = await supabase.from("task_dependencies").delete().eq("id", dependency.id);
    if (error) throw error;
    setDependencies((current) => current.filter((item) => item.id !== dependency.id));
    const predecessor = tasks.find((task) => task.id === dependency.predecessor_task_id);
    const successor = tasks.find((task) => task.id === dependency.successor_task_id);
    void logActivity({
      type: "task_update",
      title: "선후관계 삭제",
      description: `${predecessor?.task_name || "업무"}\n↓\n${successor?.task_name || "업무"}\nFS`,
      projectId: successor?.project_id || predecessor?.project_id,
      targetType: "task",
      targetId: successor?.id,
      metadata: { dependencyId: dependency.id, predecessorTaskId: dependency.predecessor_task_id, successorTaskId: dependency.successor_task_id, dependencyType: "FS" },
    });
  }

  function shiftDate(date: string, offsetDays: number) {
    return formatDate(addDays(parseDate(date), offsetDays));
  }

  function registerScheduleHistory(entry: Omit<GanttHistoryEntry, "id" | "createdAt">) {
    const historyEntry: GanttHistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    setUndoStack((current) => [...current, historyEntry].slice(-MAX_GANTT_HISTORY));
    setRedoStack([]);
  }

  const persistAndPublishTaskOrders = useCallback(async (nextTasks: IntegratedTask[]) => {
    const normalized = recalculateTaskOrders(nextTasks);
    const changed = normalized.filter((task) => nextTasks.find((current) => current.id === task.id)?.task_order !== task.task_order);
    let orderResult;
    try {
      orderResult = await withShortEditingLocks(changed.map((task) => ({ resourceType: "task" as const, resourceId: task.id })), () => persistRecalculatedTaskOrders(nextTasks));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "업무 순서를 저장하지 못했습니다.");
      return false;
    }
    if (orderResult.error) {
      window.alert(`업무 순서를 저장하지 못했습니다.\n${orderResult.error.message}`);
      return false;
    }
    orderResult.data.forEach((task) => onTaskUpdated(task));
    return true;
  }, [onTaskUpdated]);

  function getDescendantTaskIds(predecessorTaskId: number) {
    const result: number[] = [];
    const visited = new Set<number>([predecessorTaskId]);
    const queue = [predecessorTaskId];
    while (queue.length > 0) {
      const currentTaskId = queue.shift();
      if (currentTaskId === undefined) break;
      dependencies
        .filter((dependency) => dependency.predecessor_task_id === currentTaskId)
        .forEach((dependency) => {
          if (visited.has(dependency.successor_task_id)) return;
          visited.add(dependency.successor_task_id);
          result.push(dependency.successor_task_id);
          queue.push(dependency.successor_task_id);
        });
    }
    return result;
  }

  function createMoveChange(task: IntegratedTask, offsetDays: number, source: GanttScheduleChange["source"]): GanttScheduleChange | null {
    if (!task.start_date && !task.due_date) return null;
    const startDate = task.start_date || task.due_date || "";
    const dueDate = task.due_date || task.start_date || "";
    return {
      taskId: task.id,
      before: { startDate, dueDate },
      after: { startDate: shiftDate(startDate, offsetDays), dueDate: shiftDate(dueDate, offsetDays) },
      taskName: task.task_name || "업무",
      projectName: projects.find((project) => project.id === task.project_id)?.project_name || "프로젝트",
      source,
    };
  }

  async function saveScheduleBatch(operation: PendingDependencyMove, includeDependencies: boolean) {
    const changesByTaskId = new Map<number, GanttScheduleChange>();
    operation.baseChanges.forEach((change) => changesByTaskId.set(change.taskId, change));
    if (includeDependencies) operation.dependencyChanges.forEach((change) => {
      if (!changesByTaskId.has(change.taskId)) changesByTaskId.set(change.taskId, change);
    });
    const changes = Array.from(changesByTaskId.values());
    if (changes.length === 0) return false;

    setSavingTaskId(operation.primaryTaskId);
    changes.forEach((change) => {
      const task = tasks.find((item) => item.id === change.taskId);
      if (task) onTaskUpdated({ ...task, start_date: change.after.startDate, due_date: change.after.dueDate });
    });
    let results;
    try {
      results = await withShortEditingLocks(changes.map((change) => ({ resourceType: "task" as const, resourceId: change.taskId })), () => Promise.all(changes.map((change) =>
        supabase.from("tasks").update({ start_date: change.after.startDate, due_date: change.after.dueDate }).eq("id", change.taskId)
      )));
    } catch (error) {
      changes.forEach((change) => { const task = tasks.find((item) => item.id === change.taskId); if (task) onTaskUpdated(task); });
      setSavingTaskId(null);
      window.alert(error instanceof Error ? error.message : "업무 일정을 변경하지 못했습니다.");
      return false;
    }
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      console.error("Gantt schedule batch update error:", { changes, error: failed.error });
      changes.forEach((change) => {
        const task = tasks.find((item) => item.id === change.taskId);
        if (task) onTaskUpdated(task);
      });
      await Promise.all(results.map((result, index) => result.error
        ? Promise.resolve()
        : supabase.from("tasks").update({ start_date: changes[index].before.startDate, due_date: changes[index].before.dueDate }).eq("id", changes[index].taskId)));
      setSavingTaskId(null);
      window.alert(`업무 일정을 저장하지 못했습니다. 모든 변경을 원복했습니다.\n${failed.error.message}`);
      return false;
    }

    const savedScheduleByTaskId = new Map(changes.map((change) => [change.taskId, change.after]));
    await persistAndPublishTaskOrders(tasks.map((task) => {
      const schedule = savedScheduleByTaskId.get(task.id);
      return schedule ? { ...task, start_date: schedule.startDate, due_date: schedule.dueDate } : task;
    }));

    registerScheduleHistory({ action: operation.action, changes });
    const primary = changes.find((change) => change.taskId === operation.primaryTaskId) || changes[0];
    const multiCount = changes.filter((change) => change.source === "multi-select").length;
    const dependencyCount = changes.filter((change) => change.source === "dependency").length;
    void logActivity({
      type: "task_update",
      title: operation.action === "move" ? "간트 일정 일괄 이동" : "간트 업무 기간 변경",
      description: `기준 업무: ${primary.taskName}\n이동: ${operation.offsetDays > 0 ? "+" : ""}${operation.offsetDays}일\n다중 선택: ${multiCount}건\n후행 업무: ${dependencyCount}건`,
      projectId: tasks.find((task) => task.id === operation.primaryTaskId)?.project_id,
      targetType: "task",
      targetId: operation.primaryTaskId,
      metadata: { action: operation.action, offsetDays: operation.offsetDays, changes },
    });
    setSavingTaskId(null);
    return true;
  }

  function requestScheduleBatch(operation: PendingDependencyMove) {
    if (operation.dependencyChanges.length === 0) {
      void saveScheduleBatch(operation, false);
      return;
    }
    setPendingDependencyMove(operation);
  }

  async function resolveDependencyMove(choice: "include" | "exclude" | "cancel") {
    const operation = pendingDependencyMove;
    setPendingDependencyMove(null);
    if (!operation || choice === "cancel") return;
    const saved = await saveScheduleBatch(operation, choice === "include");
    if (!saved || choice === "include") return;
    const primaryAfter = operation.baseChanges.find((change) => change.taskId === operation.primaryTaskId)?.after;
    const hasViolation = primaryAfter && dependencies
      .filter((dependency) => dependency.predecessor_task_id === operation.primaryTaskId)
      .some((dependency) => {
        const successor = tasks.find((task) => task.id === dependency.successor_task_id);
        const successorStart = successor?.start_date || successor?.due_date;
        return successorStart ? primaryAfter.dueDate >= successorStart : false;
      });
    if (hasViolation) window.alert("후행 작업 일정이 선행 작업 종료일보다 빠릅니다.");
  }

  function startTaskDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    project: IntegratedProject,
    task: IntegratedTask,
    startDate: string,
    dueDate: string,
    lane: number
  ) {
    if (!canEdit || savingTaskId !== null || isHistoryApplying || isBulkApplying || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (dependencyLoadState !== "ready") {
      window.alert(dependencyLoadState === "error" ? "선후관계 데이터를 불러오지 못해 일정을 이동할 수 없습니다." : "선후관계 데이터를 불러오는 중입니다.");
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setTaskDrag({
      task,
      project,
      pointerId: event.pointerId,
      originClientX: event.clientX,
      offsetDays: 0,
      startDate,
      dueDate,
      lane,
    });
  }

  function moveTaskDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (!taskDrag || taskDrag.pointerId !== event.pointerId) return;
    const pixelOffset = event.clientX - taskDrag.originClientX;
    const visibleStep = Math.abs(pixelOffset) < dayWidth / 2
      ? 0
      : Math.round(pixelOffset / dayWidth);
    const nextOffset = getCalendarOffsetForVisibleStep(taskDrag.startDate, visibleStep);
    if (nextOffset !== taskDrag.offsetDays) {
      if (nextOffset !== 0 && taskClickTimerRef.current !== null) {
        window.clearTimeout(taskClickTimerRef.current);
        taskClickTimerRef.current = null;
      }
      setTaskDrag((current) => current ? { ...current, offsetDays: nextOffset } : null);
    }
  }

  function finishTaskDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (!taskDrag || taskDrag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const completedDrag = taskDrag;
    setTaskDrag(null);
    if (completedDrag.offsetDays === 0) return;

    suppressTaskClickUntilRef.current = Date.now() + 500;
    const selectedIds = selectedTaskIds.has(completedDrag.task.id) && selectedTaskIds.size > 1
      ? selectedTaskIds
      : new Set([completedDrag.task.id]);
    const baseChanges = tasks.flatMap((task) => {
      if (!selectedIds.has(task.id)) return [];
      const change = createMoveChange(task, completedDrag.offsetDays, task.id === completedDrag.task.id ? "primary" : "multi-select");
      return change ? [change] : [];
    });
    const baseIds = new Set(baseChanges.map((change) => change.taskId));
    const dependencyChanges = getDescendantTaskIds(completedDrag.task.id).flatMap((taskId) => {
      if (baseIds.has(taskId)) return [];
      const task = tasks.find((item) => item.id === taskId);
      const change = task ? createMoveChange(task, completedDrag.offsetDays, "dependency") : null;
      return change ? [change] : [];
    });
    requestScheduleBatch({ action: "move", primaryTaskId: completedDrag.task.id, offsetDays: completedDrag.offsetDays, baseChanges, dependencyChanges });
  }

  function cancelTaskDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (taskDrag?.pointerId !== event.pointerId) return;
    setTaskDrag(null);
  }

  function startTaskResize(
    event: React.PointerEvent<HTMLSpanElement>,
    edge: "start" | "end",
    project: IntegratedProject,
    task: IntegratedTask,
    startDate: string,
    dueDate: string,
    lane: number
  ) {
    event.stopPropagation();
    if (!canEdit || savingTaskId !== null || isHistoryApplying || isBulkApplying || event.button !== 0) return;
    if (dependencyLoadState !== "ready") {
      window.alert(dependencyLoadState === "error" ? "선후관계 데이터를 불러오지 못해 기간을 조절할 수 없습니다." : "선후관계 데이터를 불러오는 중입니다.");
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setTaskResize({
      task,
      project,
      edge,
      pointerId: event.pointerId,
      originClientX: event.clientX,
      offsetDays: 0,
      startDate,
      dueDate,
      lane,
    });
  }

  function moveTaskResize(event: React.PointerEvent<HTMLSpanElement>) {
    event.stopPropagation();
    if (!taskResize || taskResize.pointerId !== event.pointerId) return;
    const pixelOffset = event.clientX - taskResize.originClientX;
    const visibleStep = Math.abs(pixelOffset) < dayWidth / 2
      ? 0
      : Math.round(pixelOffset / dayWidth);
    const anchorDate = taskResize.edge === "start" ? taskResize.startDate : taskResize.dueDate;
    const snappedOffset = getCalendarOffsetForVisibleStep(anchorDate, visibleStep);
    const maximumShrink = getDayDiff(taskResize.startDate, taskResize.dueDate);
    const nextOffset = taskResize.edge === "start"
      ? Math.min(snappedOffset, maximumShrink)
      : Math.max(snappedOffset, -maximumShrink);
    if (nextOffset !== taskResize.offsetDays) {
      setTaskResize((current) => current ? { ...current, offsetDays: nextOffset } : null);
    }
  }

  function finishTaskResize(event: React.PointerEvent<HTMLSpanElement>) {
    event.stopPropagation();
    if (!taskResize || taskResize.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const completedResize = taskResize;
    setTaskResize(null);
    if (completedResize.offsetDays === 0) return;

    suppressTaskClickUntilRef.current = Date.now() + 500;
    const nextStartDate = completedResize.edge === "start"
      ? shiftDate(completedResize.startDate, completedResize.offsetDays)
      : completedResize.startDate;
    const nextDueDate = completedResize.edge === "end"
      ? shiftDate(completedResize.dueDate, completedResize.offsetDays)
      : completedResize.dueDate;
    const primaryChange: GanttScheduleChange = {
      taskId: completedResize.task.id,
      before: { startDate: completedResize.startDate, dueDate: completedResize.dueDate },
      after: { startDate: nextStartDate, dueDate: nextDueDate },
      taskName: completedResize.task.task_name || "업무",
      projectName: completedResize.project.project_name,
      source: "primary",
    };
    const dependencyChanges = completedResize.edge === "end"
      ? getDescendantTaskIds(completedResize.task.id).flatMap((taskId) => {
          const task = tasks.find((item) => item.id === taskId);
          const change = task ? createMoveChange(task, completedResize.offsetDays, "dependency") : null;
          return change ? [change] : [];
        })
      : [];
    requestScheduleBatch({ action: "resize", primaryTaskId: completedResize.task.id, offsetDays: completedResize.offsetDays, baseChanges: [primaryChange], dependencyChanges });
  }

  function cancelTaskResize(event: React.PointerEvent<HTMLSpanElement>) {
    event.stopPropagation();
    if (taskResize?.pointerId !== event.pointerId) return;
    setTaskResize(null);
  }

  async function saveTaskAssignee(task: IntegratedTask, project: IntegratedProject, assignee: string | null) {
    const previousAssignee = task.assignee || null;
    if (previousAssignee === assignee) {
      setAssigneeTask(null);
      return;
    }

    const optimisticTask = { ...task, assignee };
    onTaskUpdated(optimisticTask);
    let error: { message: string } | null = null;
    try {
      const result = await withShortEditingLock("task", task.id, () => supabase.from("tasks").update({ assignee }).eq("id", task.id));
      error = result.error;
    } catch (cause) {
      error = { message: cause instanceof Error ? cause.message : "담당자를 변경하지 못했습니다." };
    }

    if (error) {
      console.error("Gantt task assignee update error:", {
        taskId: task.id,
        previousAssignee,
        nextAssignee: assignee,
        error,
      });
      onTaskUpdated(task);
      throw error;
    }

    void logActivity({
      type: "task_assignee_change",
      title: "업무 담당자 변경",
      description: `프로젝트: ${project.project_name}\n업무: ${task.task_name || "업무"}\n기존 담당자: ${previousAssignee || "미지정"}\n변경 담당자: ${assignee || "미지정"}`,
      projectId: task.project_id,
      targetType: "task",
      targetId: task.id,
      metadata: {
        previousAssignee,
        nextAssignee: assignee,
      },
    });
    setAssigneeTask(null);
  }

  async function saveTaskStatus(task: IntegratedTask, nextStatus: string) {
    const previousStatus = normalizeTaskStatus(task.status) || "pending";
    if (previousStatus === nextStatus || savingTaskId !== null) {
      setTaskContextMenu(null);
      return;
    }

    const nextCompletedDate = isTaskCompleted(nextStatus) ? today : null;
    const optimisticTask = {
      ...task,
      status: nextStatus,
      completed_date: nextCompletedDate,
    };
    setTaskContextMenu(null);
    setSavingTaskId(task.id);
    onTaskUpdated(optimisticTask);

    let error: { message: string } | null = null;
    try {
      const result = await withShortEditingLock("task", task.id, () => supabase.from("tasks").update({ status: nextStatus, completed_date: nextCompletedDate }).eq("id", task.id));
      error = result.error;
    } catch (cause) {
      error = { message: cause instanceof Error ? cause.message : "업무 상태를 변경하지 못했습니다." };
    }

    if (error) {
      console.error("Gantt task status update error:", {
        taskId: task.id,
        previousStatus,
        nextStatus,
        previousCompletedDate: task.completed_date,
        nextCompletedDate,
        error,
      });
      onTaskUpdated(task);
      setSavingTaskId(null);
      window.alert(`업무 상태를 저장하지 못했습니다.\n${error.message}`);
      return;
    }

    void logActivity({
      type: isTaskCompleted(nextStatus) ? "task_complete" : "task_status_change",
      title: isTaskCompleted(nextStatus) ? "업무 완료" : "업무 상태 변경",
      description: `${task.task_name || "업무"}\n${getTaskStatusLabel(previousStatus)} → ${getTaskStatusLabel(nextStatus)}`,
      projectId: task.project_id,
      targetType: "task",
      targetId: task.id,
      metadata: {
        previousStatus,
        nextStatus,
        previousCompletedDate: task.completed_date,
        nextCompletedDate,
      },
    });
    setSavingTaskId(null);
  }

  async function saveTaskTags(task: IntegratedTask, nextTags: TaskTagCode[]) {
    const previousTags = taskTags.filter((item) => item.task_id === task.id).map((item) => item.tag);
    const nextRows = nextTags.map((tag) => ({ task_id: task.id, tag }));
    setTaskTags((current) => [...current.filter((item) => item.task_id !== task.id), ...nextRows]);

    const { data, error } = await supabase.rpc("set_task_tags", {
      p_task_id: task.id,
      p_tags: nextTags,
    });
    if (error) {
      console.error("Gantt task tag update error:", { taskId: task.id, previousTags, nextTags, error });
      setTaskTags((current) => [
        ...current.filter((item) => item.task_id !== task.id),
        ...previousTags.map((tag) => ({ task_id: task.id, tag })),
      ]);
      throw error;
    }

    const savedRows = (data || []) as TaskTagRow[];
    setTaskTags((current) => [...current.filter((item) => item.task_id !== task.id), ...savedRows]);
    const addedTags = nextTags.filter((tag) => !previousTags.includes(tag));
    const removedTags = previousTags.filter((tag) => !nextTags.includes(tag as TaskTagCode));
    const describeTags = (tags: string[]) => tags
      .map((tag) => getTaskTagDefinition(tag))
      .filter((tag) => tag !== undefined)
      .map((tag) => `${tag.icon} ${tag.label}`)
      .join(", ");
    void logActivity({
      type: "task_update",
      title: "업무 Tag 변경",
      description: `${task.task_name || "업무"}\n추가: ${describeTags(addedTags) || "-"}\n삭제: ${describeTags(removedTags) || "-"}`,
      projectId: task.project_id,
      targetType: "task",
      targetId: task.id,
      metadata: { addedTags, removedTags },
    });
    setTagTask(null);
  }

  const applyScheduleHistory = useCallback(async (direction: "undo" | "redo") => {
    if (!canEdit || isHistoryApplying || savingTaskId !== null) return;
    const sourceStack = direction === "undo" ? undoStack : redoStack;
    const entry = sourceStack[sourceStack.length - 1];
    if (!entry) return;

    const currentItems = entry.changes.map((change) => ({ change, task: tasks.find((task) => task.id === change.taskId) }));
    if (currentItems.some((item) => !item.task)) {
      if (direction === "undo") setUndoStack((current) => current.slice(0, -1));
      else setRedoStack((current) => current.slice(0, -1));
      window.alert("이력에 포함된 업무가 현재 데이터에 없어 이력을 제거했습니다.");
      return;
    }

    const scheduleItems = currentItems.map(({ change, task }) => {
      const existingTask = task as IntegratedTask;
      return {
        change,
        task: existingTask,
        current: { startDate: existingTask.start_date || existingTask.due_date || "", dueDate: existingTask.due_date || existingTask.start_date || "" },
        expected: direction === "undo" ? change.after : change.before,
        target: direction === "undo" ? change.before : change.after,
      };
    });
    if (scheduleItems.some((item) => item.current.startDate !== item.expected.startDate || item.current.dueDate !== item.expected.dueDate) &&
      !window.confirm("이 업무 일정이 다른 곳에서 변경되었을 수 있습니다. 계속하시겠습니까?")
    ) return;

    setIsHistoryApplying(true);
    setSavingTaskId(scheduleItems[0]?.task.id || null);
    scheduleItems.forEach((item) => onTaskUpdated({ ...item.task, start_date: item.target.startDate, due_date: item.target.dueDate }));
    let results;
    try {
      results = await withShortEditingLocks(scheduleItems.map((item) => ({ resourceType: "task" as const, resourceId: item.task.id })), () => Promise.all(scheduleItems.map((item) =>
        supabase.from("tasks").update({ start_date: item.target.startDate, due_date: item.target.dueDate }).eq("id", item.task.id)
      )));
    } catch (error) {
      scheduleItems.forEach((item) => onTaskUpdated(item.task));
      setSavingTaskId(null);
      setIsHistoryApplying(false);
      window.alert(error instanceof Error ? error.message : "업무 일정을 변경하지 못했습니다.");
      return;
    }
    const failedResult = results.find((result) => result.error);

    if (failedResult?.error) {
      console.error(`Gantt schedule ${direction} error:`, { entry, error: failedResult.error });
      scheduleItems.forEach((item) => onTaskUpdated(item.task));
      await Promise.all(results.map((result, index) => result.error
        ? Promise.resolve()
        : supabase.from("tasks").update({ start_date: scheduleItems[index].current.startDate, due_date: scheduleItems[index].current.dueDate }).eq("id", scheduleItems[index].task.id)));
      setSavingTaskId(null);
      setIsHistoryApplying(false);
      window.alert(`업무 일정 ${direction === "undo" ? "실행 취소" : "다시 실행"}에 실패했습니다.\n${failedResult.error.message}`);
      return;
    }

    const historyScheduleByTaskId = new Map(scheduleItems.map((item) => [item.task.id, item.target]));
    await persistAndPublishTaskOrders(tasks.map((task) => {
      const schedule = historyScheduleByTaskId.get(task.id);
      return schedule ? { ...task, start_date: schedule.startDate, due_date: schedule.dueDate } : task;
    }));

    if (direction === "undo") {
      setUndoStack((current) => current.slice(0, -1));
      setRedoStack((current) => [...current, entry].slice(-MAX_GANTT_HISTORY));
    } else {
      setRedoStack((current) => current.slice(0, -1));
      setUndoStack((current) => [...current, entry].slice(-MAX_GANTT_HISTORY));
    }

    void logActivity({
      type: "task_update",
      title: direction === "undo" ? "간트 일정 변경 실행 취소" : "간트 일정 변경 다시 실행",
      description: `${entry.changes.length}개 업무 일정 ${direction === "undo" ? "복구" : "재적용"}`,
      projectId: scheduleItems[0].task.project_id,
      targetType: "task",
      targetId: scheduleItems[0].task.id,
      metadata: { direction, action: entry.action, changes: entry.changes },
    });
    setSavingTaskId(null);
    setIsHistoryApplying(false);
  }, [canEdit, isHistoryApplying, onTaskUpdated, persistAndPublishTaskOrders, redoStack, savingTaskId, tasks, undoStack]);

  useEffect(() => {
    function handleHistoryShortcut(event: KeyboardEvent) {
      if (!canEdit || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) return;

      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        void applyScheduleHistory("redo");
      } else if (key === "z") {
        event.preventDefault();
        void applyScheduleHistory("undo");
      } else if (key === "y") {
        event.preventDefault();
        void applyScheduleHistory("redo");
      }
    }
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [applyScheduleHistory, canEdit]);

  const savePresentationState = useCallback(
    (patch: Partial<PresentationPreferences> = {}) => {
      const scroll = scrollRef.current;
      const preferences: PresentationPreferences = {
        scrollLeft: scroll?.scrollLeft ?? 0,
        scrollTop: scroll?.scrollTop ?? 0,
        zoom,
        collapsedMonths: Array.from(collapsedMonths),
        rangeOption: "today",
        meetingFocus,
        timeline: currentMonth,
        searchQuery,
        statusFilter,
        assigneeFilter,
        taskTypeFilter,
        assemblyVendorFilter,
        ...patch,
      };
      window.localStorage.setItem(
        PRESENTATION_KEY,
        JSON.stringify(preferences)
      );
    },
    [
      assemblyVendorFilter,
      assigneeFilter,
      collapsedMonths,
      currentMonth,
      meetingFocus,
      searchQuery,
      statusFilter,
      taskTypeFilter,
      zoom,
    ]
  );

  useEffect(() => {
    function handleFullscreenChange() {
      const active = document.fullscreenElement === presentationRef.current;
      setIsPresentation(active);
      if (!active) {
        savePresentationState();
        focusLockedRef.current = false;
        pointerFrozenRef.current = false;
        setFocusLocked(false);
        setPointerFrozen(false);
        clearMeetingFocus(true);
        return;
      }
      window.setTimeout(() => {
        try {
          const stored = JSON.parse(
            window.localStorage.getItem(PRESENTATION_KEY) || "{}"
          ) as Partial<PresentationPreferences>;
          scrollRef.current?.scrollTo(
            typeof stored.scrollLeft === "number" ? stored.scrollLeft : 0,
            typeof stored.scrollTop === "number" ? stored.scrollTop : 0
          );
        } catch {
          window.localStorage.removeItem(PRESENTATION_KEY);
        }
      }, 0);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [savePresentationState]);

  useEffect(() => {
    if (!isPresentation) return;
    function handlePresenterShortcut(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        setLaserEnabled((current) => !current);
      }
      if (event.code === "Space") {
        event.preventDefault();
        const next = !pointerFrozenRef.current;
        pointerFrozenRef.current = next;
        setPointerFrozen(next);
      }
    }
    window.addEventListener("keydown", handlePresenterShortcut);
    return () =>
      window.removeEventListener("keydown", handlePresenterShortcut);
  }, [isPresentation]);

  async function enterPresentation() {
    setTaskContextMenu(null);
    setAssigneeTask(null);
    setTagTask(null);
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(PRESENTATION_KEY) || "{}"
      ) as Partial<PresentationPreferences>;
      if (
        typeof stored.zoom === "number" &&
        [75, 100, 125, 150, 200].includes(stored.zoom)
      ) {
        setZoom(stored.zoom);
      }
      if (Array.isArray(stored.collapsedMonths)) {
        setCollapsedMonths(
          new Set(
            stored.collapsedMonths.filter(
              (month): month is string => typeof month === "string"
            )
          )
        );
      }
      if (typeof stored.meetingFocus === "boolean") {
        setMeetingFocus(stored.meetingFocus);
      }
      if (typeof stored.timeline === "string") {
        onCurrentMonthChange?.(stored.timeline);
      }
      if (typeof stored.searchQuery === "string") {
        setSearchQuery(stored.searchQuery);
      }
      if (
        stored.statusFilter &&
        statusFilterOptions.some(
          (option) => option.value === stored.statusFilter
        )
      ) {
        setStatusFilter(stored.statusFilter);
      }
      if (typeof stored.assigneeFilter === "string") {
        setAssigneeFilter(stored.assigneeFilter);
      }
      if (typeof stored.taskTypeFilter === "string") {
        setTaskTypeFilter(stored.taskTypeFilter);
      }
      if (typeof stored.assemblyVendorFilter === "string") {
        setAssemblyVendorFilter(stored.assemblyVendorFilter);
      }
    } catch {
      window.localStorage.removeItem(PRESENTATION_KEY);
    }
    await presentationRef.current?.requestFullscreen();
  }

  async function exitPresentation() {
    setTaskContextMenu(null);
    setAssigneeTask(null);
    setTagTask(null);
    focusLockedRef.current = false;
    pointerFrozenRef.current = false;
    setFocusLocked(false);
    setPointerFrozen(false);
    clearMeetingFocus(true);
    savePresentationState();
    if (document.fullscreenElement) await document.exitFullscreen();
  }

  const availableTasks = useMemo(
    () => {
      const visibleProjectIds = new Set(
        projects
          .filter((project) => showCompletedProjects || !isProjectCompleted(project.status))
          .map((project) => project.id)
      );
      return tasks.filter(
        (task) =>
          visibleTaskIds.has(task.id) &&
          visibleProjectIds.has(task.project_id) &&
          (task.start_date || task.due_date) &&
          (task.start_date || task.due_date || "") <= end &&
          (task.due_date || task.start_date || "") >= start
      );
    },
    [end, projects, showCompletedProjects, start, tasks, visibleTaskIds]
  );

  function toggleMonthCollapse(monthKey: string) {
    const previousScrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const previousScrollTop = ganttSurfaceRef.current?.scrollTop ?? 0;
    setCollapsedMonths((current) => {
      const next = new Set(current);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      savePresentationState({ collapsedMonths: Array.from(next) });
      return next;
    });
    window.requestAnimationFrame(() => {
      syncHorizontalScroll(previousScrollLeft, "body");
      if (scrollRef.current) scrollRef.current.scrollLeft = previousScrollLeft;
      if (ganttSurfaceRef.current) ganttSurfaceRef.current.scrollTop = previousScrollTop;
    });
  }

  function toggleCompletedVisibility() {
    const scrollPosition = {
      left: scrollRef.current?.scrollLeft ?? 0,
      top: ganttSurfaceRef.current?.scrollTop ?? 0,
    };
    onShowCompletedProjectsChange(!showCompletedProjects);
    window.requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ left: scrollPosition.left });
      ganttSurfaceRef.current?.scrollTo({ top: scrollPosition.top });
    });
  }

  const assigneeOptions = useMemo(() => {
    const assignees = availableTasks.map((task) => task.assignee || "미배정");

    return ["전체", ...Array.from(new Set(assignees)).sort()];
  }, [availableTasks]);

  const taskTypeOptions = useMemo(() => {
    const taskTypes = availableTasks.map((task) => getTaskTypeLabel(task.task_type));

    return ["전체", ...Array.from(new Set(taskTypes)).sort()];
  }, [availableTasks]);

  const assemblyVendorOptions = useMemo(() => {
    const vendors = availableTasks.map((task) => getTaskAssemblyVendorName(task));

    return ["전체", ...Array.from(new Set(vendors)).sort()];
  }, [availableTasks]);

  function resetGanttFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setAssigneeFilter("전체");
    setTaskTypeFilter("전체");
    setAssemblyVendorFilter("전체");
    setSortKey("project_name");
    setViewType(GANTT_VIEW_TYPES.project);
    setSelectedTagFilters(new Set());
  }

  const rows = useMemo<ProjectRow[]>(() => {
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const tasksByScope = new Map<string, IntegratedTask[]>();
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();

    tasks.forEach((task) => {
      const scopeKey = `${task.project_id}:${task.project_assembly_vendor_id ?? "legacy"}`;
      if (!tasksByScope.has(scopeKey)) {
        tasksByScope.set(scopeKey, []);
      }

      tasksByScope.get(scopeKey)?.push(task);
    });

    return Array.from(tasksByScope.entries())
      .map(([rowKey, projectTasks]) => {
        const firstTask = projectTasks[0];
        if (!firstTask) return null;
        const project = projectMap.get(firstTask.project_id);
        if (!project) return null;
        if (!showCompletedProjects && isProjectCompleted(project.status)) return null;

        const assemblyVendorId = firstTask.project_assembly_vendor_id;
        const assemblyVendor = getTaskAssemblyVendorName(firstTask);
        const allocatedQuantity = firstTask.project_assembly_vendor?.allocated_quantity ?? null;
        const matchesAssemblyVendor =
          assemblyVendorFilter === "전체" ||
          assemblyVendor === assemblyVendorFilter;

        if (!matchesAssemblyVendor) return null;

        const visibleTasks = projectTasks
          .filter((task) => visibleTaskIds.has(task.id))
          .filter((task) => task.start_date || task.due_date)
          .map((task) => {
            const dueDate = task.due_date || task.start_date || "";
            const startDate = task.start_date || dueDate;

            return {
              task,
              startDate,
              dueDate,
            };
          })
          .filter((segment) => segment.startDate <= end && segment.dueDate >= start)
          .filter(({ task }) => {
            const dueDate = task.due_date;
            const matchesStatus =
              statusFilter === "all" ||
              (statusFilter === "incomplete" && !isTaskCompleted(task.status)) ||
              (statusFilter === "delayed" && getDelayedDays(task, today) !== null) ||
              (statusFilter === "today" &&
                !isTaskCompleted(task.status) &&
                dueDate === today) ||
              (statusFilter === "week" &&
                !isTaskCompleted(task.status) &&
                dueDate !== null &&
                dueDate >= weekRange.start &&
                dueDate <= weekRange.end);
            const matchesAssignee =
              assigneeFilter === "전체" ||
              (task.assignee || "미배정") === assigneeFilter;
            const matchesTaskType =
              taskTypeFilter === "전체" ||
              getTaskTypeLabel(task.task_type) === taskTypeFilter;
            const tagsForTask = taskTags
              .filter((item) => item.task_id === task.id)
              .map((item) => item.tag);
            const matchesTags =
              selectedTagFilters.size === 0 ||
              Array.from(selectedTagFilters).some((tag) => tagsForTask.includes(tag));
            const searchFields = [
              project.project_name,
              project.project_code || "",
              assemblyVendor,
              project.task_manager || "",
              project.salesperson || "",
              task.task_name || "",
              task.task_type || "",
              getTaskAssemblyVendorName(task),
            ].map((value) => value.toLowerCase());
            const matchesSearch =
              normalizedSearchQuery === "" ||
              searchFields.some((value) => value.includes(normalizedSearchQuery));

            return (
              matchesStatus &&
              matchesAssignee &&
              matchesTaskType &&
              matchesTags &&
              matchesSearch
            );
          })
          .sort((a, b) => compareTasksBySchedule(a.task, b.task));

        if (visibleTasks.length === 0) return null;

        const { segments, laneCount } = assignSegmentLanes(visibleTasks);
        const rowHeight = baseRowHeight + laneCount * laneHeight;
        const completedCount = projectTasks.filter((task) =>
          isTaskCompleted(task.status)
        ).length;
        const delayedCount = segments.filter(
          ({ task }) => getDelayedDays(task, today) !== null
        ).length;
        const earliestDueDate =
          segments
            .map(({ dueDate }) => dueDate)
            .sort((a, b) => a.localeCompare(b))[0] || null;
        const progress =
          projectTasks.length > 0
            ? Math.round((completedCount / projectTasks.length) * 100)
            : 0;

        return {
          rowKey,
          project,
          assemblyVendorId,
          assemblyVendorName: assemblyVendor,
          allocatedQuantity,
          progress,
          taskCount: projectTasks.length,
          completedCount,
          delayedCount,
          earliestDueDate,
          laneCount,
          rowHeight,
          segments,
        };
      })
      .filter((row): row is ProjectRow => row !== null)
      .sort((a, b) => {
        if (sortKey === "due_date") {
          const aDate = a.earliestDueDate || "9999-12-31";
          const bDate = b.earliestDueDate || "9999-12-31";
          const dateCompare = aDate.localeCompare(bDate);

          if (dateCompare !== 0) return dateCompare;
        }

        if (sortKey === "delayed") {
          const delayedCompare = b.delayedCount - a.delayedCount;

          if (delayedCompare !== 0) return delayedCompare;
        }

        if (sortKey === "progress") {
          const progressCompare = a.progress - b.progress;

          if (progressCompare !== 0) return progressCompare;
        }

        if (sortKey === "assembly_vendor") {
          const vendorA = a.assemblyVendorName;
          const vendorB = b.assemblyVendorName;

          if (vendorA && !vendorB) return -1;
          if (!vendorA && vendorB) return 1;
          if (vendorA && vendorB) {
            const vendorCompare = vendorA.localeCompare(vendorB);
            if (vendorCompare !== 0) return vendorCompare;
          }
        }

        return a.project.project_name.localeCompare(b.project.project_name);
      });
  }, [
    assemblyVendorFilter,
    assigneeFilter,
    end,
    projects,
    searchQuery,
    selectedTagFilters,
    showCompletedProjects,
    sortKey,
    start,
    statusFilter,
    taskTypeFilter,
    taskTags,
    tasks,
    today,
    visibleTaskIds,
    weekRange.end,
    weekRange.start,
  ]);

  const displayItems = useMemo(
    () => buildGroupedView(rows, viewType, collapsedViewGroups),
    [collapsedViewGroups, rows, viewType]
  );

  const ganttExcelRows = useMemo<GanttExcelTask[]>(() => displayItems.flatMap((item) => item.kind === "row" ? item.row.segments
    .map(({ task, startDate, dueDate }, displayOrder) => ({
      projectCode: item.row.project.project_code,
      projectName: item.row.project.project_name,
      orderer: item.row.project.assembly_vendor,
      projectStartDate: item.row.project.start_date,
      projectEndDate: item.row.project.end_date ?? item.row.project.completion_due_date ?? null,
      taskName: task.task_name,
      taskTypeName: getTaskTypeLabel(task.task_type),
      assignee: task.assignee,
      statusLabel: getTaskStatusPresentation(task, today).label,
      status: normalizeTaskStatus(task.status),
      startDate,
      endDate: dueDate,
      progress: item.row.progress,
      delayed: getDelayedDays(task, today) !== null,
      displayOrder,
      memo: taskNotePreviews.get(task.id)?.note ?? null,
      memoIsImportant: taskNotePreviews.get(task.id)?.isImportant ?? false,
      memoCheckDate: taskNotePreviews.get(task.id)?.checkDate ?? null,
    })) : []), [displayItems, taskNotePreviews, today]);

  const ganttExportProjects = useMemo(() => groupGanttTasksByProject(ganttExcelRows).map((project) => ({ key: project.key, name: project.projectName })), [ganttExcelRows]);

  async function exportGanttExcel(template: GanttExportTemplate, _range: GanttExportRange, exportStart: string, exportEnd: string, projectKey: string) {
    if (isExcelExporting) return;
    const rangedRows = filterGanttTasksForRange(ganttExcelRows, exportStart, exportEnd);
    const exportRows = template === "project" && projectKey !== "all"
      ? rangedRows.filter((task) => JSON.stringify([task.projectCode ?? "", task.projectName]) === projectKey)
      : rangedRows;
    if (exportRows.length === 0) {
      toast.info("선택한 기간에 내보낼 Gantt 업무가 없습니다.");
      return;
    }
    setIsExcelExporting(true);
    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      const activeFilters = [
        searchQuery.trim() ? `검색: ${searchQuery.trim()}` : null,
        statusFilter !== "all" ? `상태: ${statusFilterOptions.find((option) => option.value === statusFilter)?.label}` : null,
        assigneeFilter !== "전체" ? `담당자: ${assigneeFilter}` : null,
        taskTypeFilter !== "전체" ? `업무유형: ${taskTypeFilter}` : null,
        assemblyVendorFilter !== "전체" ? `조립처: ${assemblyVendorFilter}` : null,
        selectedTagFilters.size ? `태그: ${Array.from(selectedTagFilters).join(", ")}` : null,
      ].filter((value): value is string => Boolean(value));
      const projectNames = Array.from(new Set(exportRows.map((task) => task.projectName)));
      downloadGanttWorkbook({ tasks: exportRows, startDate: exportStart, endDate: exportEnd, today, generatedAt: new Date(), filterSummary: activeFilters.join(" · ") }, getTemplateFileName(template, today, projectNames.length === 1 ? projectNames[0] : undefined), template);
      setIsExcelDialogOpen(false);
      toast.success(`${exportRows.length}건의 Gantt 업무를 Excel로 저장했습니다.`);
    } catch (error) {
      console.error("Gantt Excel export error", error);
      toast.error("Gantt Excel 파일을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsExcelExporting(false);
    }
  }
  const projectRowBackgrounds = useMemo(() => {
    const backgrounds = new Map<string, string>();
    let projectIndex = 0;

    displayItems.forEach((item) => {
      if (item.kind !== "row") return;
      backgrounds.set(item.row.rowKey, projectIndex % 2 === 0 ? "bg-[#FAFAFA]" : "bg-white");
      projectIndex += 1;
    });

    return backgrounds;
  }, [displayItems]);

  function changeViewType(nextViewType: GanttViewType) {
    if (
      nextViewType === GANTT_VIEW_TYPES.assignee ||
      nextViewType === GANTT_VIEW_TYPES.status ||
      nextViewType === GANTT_VIEW_TYPES.process
    ) return;
    const scrollPosition = {
      left: scrollRef.current?.scrollLeft ?? 0,
      top: ganttSurfaceRef.current?.scrollTop ?? 0,
    };
    setViewType(nextViewType);
    window.requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ left: scrollPosition.left });
      ganttSurfaceRef.current?.scrollTo({ top: scrollPosition.top });
    });
  }

  function toggleViewGroup(groupKey: string) {
    setCollapsedViewGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  const visibleTaskOrder = useMemo(
    () => rows.flatMap((row) => row.segments.map((segment) => segment.task.id)),
    [rows]
  );
  const dependencyLines = useMemo(() => {
    const positions = new Map<number, { startX: number; endX: number; y: number; taskName: string }>();
    let rowTop = 0;
    displayItems.forEach((item) => {
      if (item.kind === "group") {
        rowTop += item.height;
        return;
      }
      const row = item.row;
      row.segments.forEach((segment) => {
        const geometry = getVisibleRangeGeometry(segment.startDate, segment.dueDate);
        if (!geometry) return;
        const startX = geometry.left + 4;
        const width = Math.max(geometry.width - 8, 28);
        positions.set(segment.task.id, {
          startX,
          endX: startX + width,
          y: rowTop + 16 + segment.lane * laneHeight + 10,
          taskName: segment.task.task_name || "업무",
        });
      });
      rowTop += row.rowHeight;
    });
    return dependencies.flatMap((dependency) => {
      const predecessor = positions.get(dependency.predecessor_task_id);
      const successor = positions.get(dependency.successor_task_id);
      if (!predecessor || !successor) return [];
      const elbowX = Math.max(predecessor.endX + 8, successor.startX - 12);
      return [{
        ...dependency,
        path: `M ${predecessor.endX} ${predecessor.y} H ${elbowX} V ${successor.y} H ${successor.startX}`,
        title: `${predecessor.taskName} → ${successor.taskName} · FS`,
      }];
    });
  }, [dependencies, displayItems, getVisibleRangeGeometry]);

  useEffect(() => {
    function handleSelectionShortcut(event: KeyboardEvent) {
      const target = event.target;
      const isInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
      if (event.key === "Escape") {
        setSelectedTaskIds(new Set());
        setSelectionAnchorTaskId(null);
        return;
      }
      if (!canEdit || isInput || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "a") return;
      event.preventDefault();
      setSelectedTaskIds(new Set(visibleTaskOrder));
      setSelectionAnchorTaskId(visibleTaskOrder[0] ?? null);
    }
    window.addEventListener("keydown", handleSelectionShortcut);
    return () => window.removeEventListener("keydown", handleSelectionShortcut);
  }, [canEdit, visibleTaskOrder]);

  function selectTask(event: React.MouseEvent<HTMLButtonElement>, taskId: number) {
    if (!canEdit || !(event.ctrlKey || event.metaKey || event.shiftKey)) return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey && selectionAnchorTaskId !== null) {
      const anchorIndex = visibleTaskOrder.indexOf(selectionAnchorTaskId);
      const taskIndex = visibleTaskOrder.indexOf(taskId);
      if (anchorIndex !== -1 && taskIndex !== -1) {
        const [from, to] = anchorIndex <= taskIndex ? [anchorIndex, taskIndex] : [taskIndex, anchorIndex];
        setSelectedTaskIds((current) => new Set([...current, ...visibleTaskOrder.slice(from, to + 1)]));
        return true;
      }
    }
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
    setSelectionAnchorTaskId(taskId);
    return true;
  }

  async function applyBulkEdit(value: string | null | TaskTagCode[]) {
    const selectedTasks = tasks.filter((task) => selectedTaskIds.has(task.id));
    if (!bulkEditKind || selectedTasks.length === 0 || isBulkApplying || isHistoryApplying || savingTaskId !== null) return;
    setIsBulkApplying(true);
    try {
      if (bulkEditKind === "assignee") {
        const results = await Promise.allSettled(selectedTasks.map((task) => {
          const project = projects.find((item) => item.id === task.project_id);
          if (!project) return Promise.resolve();
          return saveTaskAssignee(task, project, typeof value === "string" || value === null ? value : null);
        }));
        const failures = results.filter((result) => result.status === "rejected");
        if (failures.length > 0) throw new Error(`${failures.length}개 업무의 담당자를 저장하지 못했습니다.`);
      } else if (bulkEditKind === "tags") {
        const tags = Array.isArray(value) ? value : [];
        const results = await Promise.allSettled(selectedTasks.map((task) => saveTaskTags(task, tags)));
        const failures = results.filter((result) => result.status === "rejected");
        if (failures.length > 0) throw new Error(`${failures.length}개 업무의 태그를 저장하지 못했습니다.`);
      } else {
        const nextStatus = typeof value === "string" ? value : "";
        const results = await Promise.allSettled(selectedTasks.map(async (task) => {
          const previousStatus = normalizeTaskStatus(task.status) || "pending";
          if (!nextStatus || previousStatus === nextStatus) return;
          const nextCompletedDate = isTaskCompleted(nextStatus) ? today : null;
          const optimisticTask = { ...task, status: nextStatus, completed_date: nextCompletedDate };
          onTaskUpdated(optimisticTask);
          const { error } = await withShortEditingLock("task", task.id, () => supabase.from("tasks").update({ status: nextStatus, completed_date: nextCompletedDate }).eq("id", task.id));
          if (error) {
            onTaskUpdated(task);
            console.error("Gantt bulk task status update error:", { taskId: task.id, previousStatus, nextStatus, error });
            throw error;
          }
          void logActivity({ type: isTaskCompleted(nextStatus) ? "task_complete" : "task_status_change", title: "업무 상태 일괄 변경", description: `${task.task_name || "업무"}\n${getTaskStatusLabel(previousStatus)} → ${getTaskStatusLabel(nextStatus)}`, projectId: task.project_id, targetType: "task", targetId: task.id, metadata: { previousStatus, nextStatus } });
        }));
        const failures = results.filter((result) => result.status === "rejected");
        if (failures.length > 0) throw new Error(`${failures.length}개 업무의 상태를 저장하지 못했습니다.`);
      }
      setBulkEditKind(null);
    } finally {
      setIsBulkApplying(false);
    }
  }

  const taskTypeLegendItems = useMemo(() => {
    const legendMap = new Map<string, TaskTypeColor>();

    rows.forEach((row) => {
      row.segments.forEach(({ task }) => {
        const label = getTaskTypeLabel(task.task_type);
        const color = getTaskTypeColor(task.task_type);

        if (!legendMap.has(label)) {
          legendMap.set(label, { ...color, label });
        }
      });
    });

    return Array.from(legendMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [rows]);

  const scrollToToday = useCallback(() => {
    if (!scrollRef.current) return;
    const todayMonth = today.slice(0, 7);
    if (collapsedMonths.has(todayMonth)) {
      setCollapsedMonths((current) => {
        const next = new Set(current);
        next.delete(todayMonth);
        savePresentationState({ collapsedMonths: Array.from(next) });
        return next;
      });
      window.requestAnimationFrame(() => window.requestAnimationFrame(scrollToToday));
      return;
    }
    const todayLeft = dateLeftByValue.get(today);
    if (todayLeft === undefined) return;
    const targetLeft = todayLeft - scrollRef.current.clientWidth / 2 + dayWidth / 2;

    scrollRef.current.scrollLeft = Math.max(targetLeft, 0);
  }, [collapsedMonths, dateLeftByValue, dayWidth, savePresentationState, today]);

  useEffect(() => {
    if (
      hasInitialTodayScrollRef.current ||
      !isInitialMonthLayoutReady ||
      visibleDateDays.length === 0 ||
      rows.length === 0
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      scrollToToday();
      hasInitialTodayScrollRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isInitialMonthLayoutReady, rows.length, scrollToToday, visibleDateDays.length]);

  function clearMeetingFocus(force = false) {
    if (focusLockedRef.current && !force) return;
    focusedRowElementsRef.current.forEach((element) => {
      element.classList.remove("bg-blue-50", "ring-1", "ring-inset", "ring-blue-200");
      element.style.backgroundColor = "";
    });
    focusedRowElementsRef.current = [];
    if (columnFocusRef.current) columnFocusRef.current.style.opacity = "0";
    if (cellFocusRef.current) cellFocusRef.current.style.opacity = "0";
  }

  function updateMeetingFocus(
    clientX: number,
    target: EventTarget | null
  ) {
    if (
      !isPresentation ||
      !meetingFocus ||
      focusLockedRef.current ||
      !(target instanceof Element)
    ) {
      return;
    }

    if (!target.closest("[data-gantt-focus-surface]")) {
      clearMeetingFocus(true);
      return;
    }
    const rowElement = target.closest<HTMLElement>("[data-gantt-row-id]");
    const rowId = rowElement?.dataset.ganttRowId;
    clearMeetingFocus(true);

    if (rowId && presentationRef.current) {
      const rowElements = Array.from(
        presentationRef.current.querySelectorAll<HTMLElement>(
          `[data-gantt-row-id="${rowId}"]`
        )
      );
      rowElements.forEach((element) => {
        element.style.backgroundColor = "rgb(239 246 255)";
        element.classList.add(
          "bg-blue-50",
          "ring-1",
          "ring-inset",
          "ring-blue-200"
        );
      });
      focusedRowElementsRef.current = rowElements;
    }

    const content = timelineContentRef.current;
    if (!content || clientX < content.getBoundingClientRect().left) return;
    const contentRect = content.getBoundingClientRect();
    const targetColumn = getTimelineColumnAtOffset(clientX - contentRect.left);
    if (!targetColumn?.column.date) return;
    const left = targetColumn.left;

    if (columnFocusRef.current) {
      columnFocusRef.current.style.width = `${targetColumn.column.width}px`;
      columnFocusRef.current.style.transform = `translateX(${left}px)`;
      columnFocusRef.current.style.opacity = "1";
    }
    if (cellFocusRef.current && rowElement) {
      const rowRect = rowElement.getBoundingClientRect();
      cellFocusRef.current.style.width = `${targetColumn.column.width}px`;
      cellFocusRef.current.style.height = `${rowRect.height}px`;
      cellFocusRef.current.style.transform = `translate(${left}px, ${
        rowRect.top - contentRect.top
      }px)`;
      cellFocusRef.current.style.opacity = "1";
    }
  }

  return (
    <div
      ref={presentationRef}
      onPointerMove={(event) => {
        if (!isPresentation || pointerFrozenRef.current) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (laserEnabled && laserRef.current) {
          laserRef.current.style.transform = `translate(${
            event.clientX - bounds.left - 9
          }px, ${event.clientY - bounds.top - 9}px)`;
        }
        if (spotlightEnabled && spotlightRef.current) {
          spotlightRef.current.style.background = `radial-gradient(circle 120px at ${
            event.clientX - bounds.left
          }px ${event.clientY - bounds.top}px, transparent 0, transparent 55%, rgba(15, 23, 42, 0.26) 100%)`;
        }
        updateMeetingFocus(event.clientX, event.target);
      }}
      onPointerDown={(event) => {
        if (!isPresentation || !meetingFocus || event.pointerType !== "touch") {
          return;
        }
        focusLockedRef.current = false;
        updateMeetingFocus(event.clientX, event.target);
        focusLockedRef.current = true;
        setFocusLocked(true);
      }}
      onPointerLeave={() => clearMeetingFocus()}
      className={
        isPresentation
          ? "relative flex h-dvh flex-col overflow-hidden bg-white text-slate-900"
          : "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      }
    >
      {isPresentation && spotlightEnabled && (
        <div
          ref={spotlightRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[90] bg-slate-950/25"
        />
      )}
      {isPresentation && laserEnabled && (
        <div
          ref={laserRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-[100] h-[18px] w-[18px] rounded-full bg-red-500/80 shadow-[0_0_22px_rgba(239,68,68,0.95)]"
        />
      )}
      {isPresentation && (
        <div className="relative z-50 flex min-h-14 shrink-0 flex-wrap items-center gap-2 overflow-visible border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
          <Button type="button" size="sm" variant="secondary" onClick={scrollToToday}>
            <LocateFixed size={15} /> 오늘
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={!canEdit || undoStack.length === 0 || isHistoryApplying || savingTaskId !== null} title={undoStack.length ? `실행 취소: ${undoStack[undoStack.length - 1].changes[0]?.taskName || "업무"}` : "실행 취소할 일정 변경이 없습니다."} onClick={() => void applyScheduleHistory("undo")}>
            <Undo2 size={15} /> Undo
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={!canEdit || redoStack.length === 0 || isHistoryApplying || savingTaskId !== null} title={redoStack.length ? `다시 실행: ${redoStack[redoStack.length - 1].changes[0]?.taskName || "업무"}` : "다시 실행할 일정 변경이 없습니다."} onClick={() => void applyScheduleHistory("redo")}>
            <Redo2 size={15} /> Redo
          </Button>
          <div className="relative min-w-56 flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
            <input
              value={searchQuery}
              onChange={(event) => {
                const value = event.target.value;
                setSearchQuery(value);
                const normalized = value.trim().toLocaleLowerCase("ko-KR");
                if (!normalized) return;
                const matchedRow = rows.find((row) =>
                  row.project.project_name
                    .toLocaleLowerCase("ko-KR")
                    .includes(normalized)
                );
                if (!matchedRow) return;
                setHighlightedProjectId(matchedRow.project.id);
                window.setTimeout(
                  () => setHighlightedProjectId(null),
                  1600
                );
                window.setTimeout(
                  () =>
                    projectRowRefs.current
                      .get(matchedRow.project.id)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" }),
                  0
                );
              }}
              placeholder="프로젝트 검색"
              className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <Popover
            open={isPresentationFilterOpen}
            onOpenChange={setIsPresentationFilterOpen}
          >
            <PopoverTrigger asChild>
              <Button type="button" size="sm" variant="secondary">
                <SlidersHorizontal size={15} /> 필터
              </Button>
            </PopoverTrigger>
            <PopoverContent
              portalContainer={presentationRef.current}
              align="end"
              side="bottom"
              sideOffset={8}
              collisionPadding={12}
              avoidCollisions
              className="z-[110] flex max-h-[calc(100vh-24px)] max-w-[calc(100vw-24px)] flex-wrap gap-2 overflow-y-auto rounded-xl"
            >
              <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="h-9 rounded-lg border px-2 text-sm">{assigneeOptions.map((value) => <option key={value}>{value}</option>)}</select>
              <select value={taskTypeFilter} onChange={(event) => setTaskTypeFilter(event.target.value)} className="h-9 rounded-lg border px-2 text-sm">{taskTypeOptions.map((value) => <option key={value}>{value}</option>)}</select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as GanttStatusFilter)} className="h-9 rounded-lg border px-2 text-sm">{statusFilterOptions.map((value) => <option key={value.value} value={value.value}>{value.label}</option>)}</select>
            </PopoverContent>
          </Popover>
          <Button type="button" size="sm" variant={meetingFocus ? "primary" : "secondary"} onClick={() => {
            const next = !meetingFocus;
            setMeetingFocus(next);
            savePresentationState({ meetingFocus: next });
            if (!next) {
              focusLockedRef.current = false;
              setFocusLocked(false);
              clearMeetingFocus(true);
            }
          }}>
            <Crosshair size={15} /> Meeting Focus
          </Button>
          {meetingFocus && (
            <Button
              type="button"
              size="sm"
              variant={focusLocked ? "primary" : "secondary"}
              onClick={() => {
                const next = !focusLockedRef.current;
                focusLockedRef.current = next;
                setFocusLocked(next);
                if (!next) clearMeetingFocus(true);
              }}
            >
              <Pin size={15} /> Focus Lock
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setZoom(75);
              setCollapsedMonths(new Set());
              scrollRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
              savePresentationState({
                zoom: 75,
                collapsedMonths: [],
                rangeOption: "all",
              });
            }}
          >
            전체보기
          </Button>
          <Button type="button" size="sm" variant={laserEnabled ? "danger" : "secondary"} onClick={() => setLaserEnabled((current) => !current)}>
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Laser
          </Button>
          <Button type="button" size="sm" variant={spotlightEnabled ? "primary" : "secondary"} onClick={() => setSpotlightEnabled((current) => !current)}>
            💡 Spotlight
          </Button>
          <Button
            type="button"
            size="sm"
            variant={pointerFrozen ? "primary" : "secondary"}
            onClick={() => {
              const next = !pointerFrozenRef.current;
              pointerFrozenRef.current = next;
              setPointerFrozen(next);
            }}
          >
            <Pin size={15} /> Freeze
          </Button>
          <Button type="button" size="sm" variant="secondary" aria-label="축소" onClick={() => {
            const values = [75, 100, 125, 150, 200];
            const next = values[Math.max(0, values.indexOf(zoom) - 1)];
            setZoom(next);
            savePresentationState({ zoom: next });
          }}><Minus size={15} /></Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => {
            setZoom(100);
            savePresentationState({ zoom: 100 });
          }}>{zoom}%</Button>
          <Button type="button" size="sm" variant="secondary" aria-label="확대" onClick={() => {
            const values = [75, 100, 125, 150, 200];
            const next = values[Math.min(values.length - 1, values.indexOf(zoom) + 1)];
            setZoom(next);
            savePresentationState({ zoom: next });
          }}><Plus size={15} /></Button>
          <Button type="button" size="sm" variant="danger" onClick={() => void exitPresentation()}>
            <X size={15} /> 종료
          </Button>
        </div>
      )}
      {!isPresentation && (
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-950">
            프로젝트 간트
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            현장별 업무 일정을 선택 월 기준으로 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex h-9 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600">
            <span>보기</span>
            <select
              aria-label="간트 보기 기준"
              value={viewType}
              onChange={(event) => changeViewType(event.target.value as GanttViewType)}
              className="bg-transparent text-sm font-semibold text-slate-800 outline-none"
            >
              <option value="project">현장별</option>
              <option value="vendor">업체별</option>
              <option value="salesperson">영업자별</option>
              <option disabled>──────────</option>
              <option value="assignee" disabled>담당자별 (준비중)</option>
              <option value="status" disabled>상태별 (준비중)</option>
              <option value="process" disabled>공정별 (준비중)</option>
            </select>
          </label>
          <Button type="button" variant={showCompletedProjects ? "secondary" : "primary"} size="sm" onClick={toggleCompletedVisibility} className="h-9 rounded-2xl px-3.5 text-sm font-medium">
            {showCompletedProjects ? "완료 현장 숨기기" : "완료 현장 보기"}
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={!canEdit || undoStack.length === 0 || isHistoryApplying || savingTaskId !== null} title={undoStack.length ? `실행 취소: ${undoStack[undoStack.length - 1].changes[0]?.taskName || "업무"}` : "실행 취소할 일정 변경이 없습니다."} onClick={() => void applyScheduleHistory("undo")} className="h-9 rounded-2xl px-3.5 text-sm font-medium"><Undo2 size={15} /> Undo</Button>
          <Button type="button" variant="secondary" size="sm" disabled={!canEdit || redoStack.length === 0 || isHistoryApplying || savingTaskId !== null} title={redoStack.length ? `다시 실행: ${redoStack[redoStack.length - 1].changes[0]?.taskName || "업무"}` : "다시 실행할 일정 변경이 없습니다."} onClick={() => void applyScheduleHistory("redo")} className="h-9 rounded-2xl px-3.5 text-sm font-medium"><Redo2 size={15} /> Redo</Button>
          <Button type="button" variant="secondary" size="sm" onClick={scrollToToday} className="h-9 rounded-2xl px-3.5 text-sm font-medium">오늘로 이동</Button>
          {canExport && <Button type="button" variant="secondary" size="sm" disabled={isExcelExporting} onClick={() => setIsExcelDialogOpen(true)} className="h-9 rounded-2xl px-3.5 text-sm font-medium"><Download size={15} /> Excel 다운로드</Button>}
          <Button type="button" variant="primary" size="sm" onClick={() => void enterPresentation()} className="h-9 rounded-2xl px-3.5 text-sm font-medium"><Monitor size={15} /> Presentation</Button>
        </div>
      </div>
      )}

      {canEdit && selectedTaskIds.size > 0 && (
        <div className="relative z-40 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-3 shadow-sm">
          <strong className="mr-2 text-sm text-blue-900">{selectedTaskIds.size}개 선택됨</strong>
          <Button type="button" size="sm" variant="secondary" disabled={isBulkApplying || isHistoryApplying || savingTaskId !== null} onClick={() => setBulkEditKind("assignee")}>담당자 변경</Button>
          <Button type="button" size="sm" variant="secondary" disabled={isBulkApplying || isHistoryApplying || savingTaskId !== null} onClick={() => setBulkEditKind("status")}>상태 변경</Button>
          <Button type="button" size="sm" variant="secondary" disabled={isBulkApplying || isHistoryApplying || savingTaskId !== null} onClick={() => setBulkEditKind("tags")}>태그</Button>
          <Button type="button" size="sm" variant="ghost" disabled={isBulkApplying} onClick={() => { setSelectedTaskIds(new Set()); setSelectionAnchorTaskId(null); }}>선택 해제</Button>
        </div>
      )}

      {!isPresentation && (
      <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">
                현장 검색
              </span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="프로젝트, 담당자, 업무 검색"
                className="h-9 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-500">
                담당자
              </span>
              <select
                value={assigneeFilter}
                onChange={(event) => setAssigneeFilter(event.target.value)}
                className="h-9 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              >
                {assigneeOptions.map((assignee) => (
                  <option key={assignee} value={assignee}>
                    {assignee}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-500">
                업무유형
              </span>
              <select
                value={taskTypeFilter}
                onChange={(event) => setTaskTypeFilter(event.target.value)}
                className="h-9 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              >
                {taskTypeOptions.map((taskType) => (
                  <option key={taskType} value={taskType}>
                    {taskType}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-500">
                조립처
              </span>
              <select
                value={assemblyVendorFilter}
                onChange={(event) => setAssemblyVendorFilter(event.target.value)}
                className="h-9 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              >
                {assemblyVendorOptions.map((vendor) => (
                  <option key={vendor} value={vendor}>
                    {vendor}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-500">
                정렬
              </span>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as GanttSortKey)}
                className="h-9 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetGanttFilters}
              className="h-9 rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              초기화
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {statusFilterOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={statusFilter === option.value ? "primary" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter(option.value)}
                className={`h-8 rounded-2xl px-3 text-xs font-semibold transition-colors ${
                  statusFilter === option.value
                    ? "shadow-sm ring-1 ring-blue-100"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-slate-500">Tag</span>
            <Button
              type="button"
              variant={selectedTagFilters.size === 0 ? "primary" : "ghost"}
              size="sm"
              onClick={() => setSelectedTagFilters(new Set())}
              className="h-8 rounded-2xl px-3 text-xs font-semibold"
            >
              전체
            </Button>
            {TASK_TAGS.map((tag) => {
              const selected = selectedTagFilters.has(tag.code);
              return (
                <Button
                  key={tag.code}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedTagFilters((current) => {
                    const next = new Set(current);
                    if (next.has(tag.code)) next.delete(tag.code); else next.add(tag.code);
                    return next;
                  })}
                  className={`h-8 rounded-2xl px-3 text-xs font-semibold ring-1 ${selected ? tag.colorClassName : "bg-white text-slate-500 ring-slate-200"}`}
                >
                  {tag.icon} {tag.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
      )}

      {!isPresentation && taskTypeLegendItems.length > 0 && (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1">
                <span className="h-3 w-7 rounded bg-[#A8D8EA] ring-1 ring-[#86BFD7]" />
                Task 일정
              </span>
              <span className="mr-1 font-semibold text-slate-700">
                색상: 업무유형
              </span>
              {taskTypeLegendItems.map((item) => (
                <span
                  key={item.label}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1"
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ring-1 ${item.swatchClassName}`}
                  />
                  {item.label}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-1 rounded-full bg-red-400" />
                빨간 표시선: 지연
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-1 rounded-full bg-amber-400" />
                노란 표시선: 오늘 마감
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-6 rounded-full bg-slate-300 opacity-60" />
                낮은 대비: 완료
              </span>
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          message="조건에 맞는 프로젝트 일정이 없습니다."
          className={`rounded-2xl bg-slate-50 p-10 text-center text-sm text-slate-500 ${isPresentation ? "min-h-0 flex-1" : ""}`}
        />
      ) : (
        <div className={isPresentation ? "flex min-h-0 flex-1 flex-col" : ""}>
          <div className={`flex w-full min-w-0 shrink-0 items-end border-x border-t border-slate-200 bg-white transition-[height] ${isPresentationFilterOpen ? "h-16" : "h-4"}`}>
            <div className="w-[430px] shrink-0 border-r border-slate-200" />
            <div
              ref={topScrollRef}
              aria-label="간트 상단 가로 스크롤"
              onScroll={(event) => syncHorizontalScroll(event.currentTarget.scrollLeft, "top")}
              className="h-4 min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
            >
              <div aria-hidden="true" className="h-3" style={{ width: timelineWidth }} />
            </div>
          </div>
        <div ref={ganttSurfaceRef} data-gantt-focus-surface className={`overflow-x-hidden overflow-y-auto border border-slate-200 ${isPresentation ? "min-h-0 flex-1 rounded-none border-x-0 border-b-0" : "max-h-[calc(100vh-220px)] rounded-b-2xl"}`}>
          <div className="sticky top-0 z-50 flex w-full min-w-0 bg-white shadow-sm">
            <div className="grid h-[74px] w-[430px] shrink-0 grid-cols-[minmax(0,1fr)_90px_70px] items-end gap-3 border-r border-b border-slate-200 bg-slate-50 px-4 pb-3 text-xs font-semibold text-slate-500">
              <span>프로젝트</span><span>수량</span><span>진행률</span>
            </div>
            <div ref={headerScrollRef} className="min-w-0 flex-1 overflow-hidden">
              <div style={{ width: timelineWidth }}>
                <div className="flex h-9 border-b border-slate-200 bg-slate-50">
                  {monthGroups.map((month) => (
                    <button key={month.key} type="button" aria-expanded={!month.collapsed} aria-label={`${monthFormatter.format(parseDate(`${month.key}-01`))} ${month.collapsed ? "펼치기" : "접기"}`} onClick={() => toggleMonthCollapse(month.key)} style={{ width: month.width }} className="flex shrink-0 items-center justify-center gap-1 border-r border-slate-200 px-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
                      {month.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      <span className="shrink-0 whitespace-nowrap">{formatGanttMonthLabel(month.key, month.collapsed)}</span>
                    </button>
                  ))}
                </div>
                <div className="flex h-[37px] border-b border-slate-200 bg-white">
                  {timelineColumns.map((column) => column.date ? (
                    <div key={column.key} className={`flex shrink-0 flex-col items-center justify-center border-r border-slate-100 text-[11px] ${column.date === today ? "bg-slate-200 font-bold text-slate-900 ring-1 ring-inset ring-slate-300" : isWeekend(column.date) ? "bg-slate-50 text-slate-400" : "text-slate-500"}`} style={{ width: column.width }}>
                      <span className="font-bold">{dayFormatter.format(parseDate(column.date))}</span><span>{weekdayFormatter.format(parseDate(column.date))}</span>
                    </div>
                  ) : <div key={column.key} aria-hidden="true" className="flex shrink-0 items-center justify-center border-r border-slate-200 bg-slate-100 text-[10px] text-slate-400" style={{ width: column.width }}>접힘</div>)}
                </div>
              </div>
            </div>
          </div>
          <div className="flex w-full min-w-0">
            <div className="sticky left-0 z-30 w-[430px] shrink-0 border-r border-slate-200 bg-white">
              {displayItems.map((item) => item.kind === "group" ? (
                <button
                  key={item.key}
                  type="button"
                  aria-expanded={!item.collapsed}
                  aria-label={`${item.label} 그룹 ${item.collapsed ? "펼치기" : "접기"}`}
                  onClick={() => toggleViewGroup(item.key)}
                  className="flex w-full items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 text-left text-xs font-bold text-slate-700 hover:bg-slate-200"
                  style={{ height: item.height }}
                >
                  {item.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span>{item.label} ({item.count})</span>
                </button>
              ) : (() => {
                const row = item.row;
                return (
                <div
                  key={row.rowKey}
                  data-gantt-row-id={row.project.id}
                  ref={(node) => {
                    if (node) projectRowRefs.current.set(row.project.id, node);
                    else projectRowRefs.current.delete(row.project.id);
                  }}
                  className={`grid grid-cols-[minmax(0,1fr)_90px_70px] items-center gap-3 border-b border-t-2 border-b-slate-200 border-t-slate-300 px-4 transition-colors ${
                    highlightedProjectId === row.project.id
                      ? "bg-amber-100"
                      : projectRowBackgrounds.get(row.rowKey)
                  }`}
                  style={{ height: row.rowHeight }}
                >
                  <div className="min-w-0">
                    <Link
                      href={`/projects/${row.project.id}`}
                      title={row.project.project_name}
                      className="block truncate text-sm font-semibold text-slate-950 transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                    >
                      {row.project.project_name}
                    </Link>
                    {!(isPresentation && meetingFocus) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-slate-400">
                        {row.project.project_code || "코드 없음"}
                      </span>
                      {row.assemblyVendorName && (
                        <span className="truncate text-xs font-medium text-slate-400">
                          · {row.assemblyVendorName}
                        </span>
                      )}
                      <Badge
                        variant={getProjectStatusVariant(row.project.status)}
                        className="px-2 py-0.5 text-[11px] font-semibold"
                      >
                        {getProjectStatusLabel(row.project.status)}
                      </Badge>
                    </div>
                    )}
                    <div className="mt-1 truncate text-xs text-slate-500">
                      담당 {row.project.task_manager || row.project.salesperson || "미지정"}
                    </div>
                    {row.delayedCount > 0 &&
                      !(isPresentation && meetingFocus) && (
                      <div className="mt-1 text-[11px] font-semibold text-red-600">
                        지연 {row.delayedCount}건
                      </div>
                    )}
                  </div>

                  <div className="truncate whitespace-nowrap text-sm font-semibold text-slate-700" title={formatProjectQuantity(row.allocatedQuantity, row.project.quantity_unit)}>
                    {formatProjectQuantity(row.allocatedQuantity, row.project.quantity_unit)}
                  </div>

                  <div>
                    <div className="text-right text-sm font-bold text-blue-600">
                      {row.progress}%
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${row.progress}%` }}
                      />
                    </div>
                    <div className="mt-1 text-right text-[11px] text-slate-400">
                      {row.completedCount}/{row.taskCount}
                    </div>
                  </div>
                </div>
                );
              })())}
            </div>

            <div
              ref={scrollRef}
              onScroll={(event) => {
                syncHorizontalScroll(event.currentTarget.scrollLeft, "body");
                if (isPresentation) {
                  savePresentationState({
                    scrollLeft: event.currentTarget.scrollLeft,
                    scrollTop: event.currentTarget.scrollTop,
                  });
                }
              }}
              className="min-w-0 flex-1 overflow-x-auto scroll-smooth [scrollbar-width:thin]"
            >
              <div
                ref={timelineContentRef}
                className="relative"
                style={{ width: timelineWidth }}
              >
                <div
                  ref={columnFocusRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 left-0 top-0 z-[25] border-x border-blue-300 bg-blue-200/25 opacity-0 transition-opacity duration-150"
                />
                <div
                  ref={cellFocusRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-0 z-30 border-2 border-blue-500 bg-blue-300/20 opacity-0 transition-opacity duration-150"
                />
                <div className="hidden">
                  {monthGroups.map((month) => (
                    <button
                      key={month.key}
                      type="button"
                      aria-expanded={!month.collapsed}
                      aria-label={`${monthFormatter.format(parseDate(`${month.key}-01`))} ${month.collapsed ? "펼치기" : "접기"}`}
                      onClick={() => {
                        const previousScrollLeft = scrollRef.current?.scrollLeft ?? 0;
                        const previousScrollTop = ganttSurfaceRef.current?.scrollTop ?? 0;
                        setCollapsedMonths((current) => {
                          const next = new Set(current);
                          if (next.has(month.key)) next.delete(month.key);
                          else next.add(month.key);
                          savePresentationState({
                            collapsedMonths: Array.from(next),
                          });
                          return next;
                        });
                        window.requestAnimationFrame(() => {
                          if (scrollRef.current) scrollRef.current.scrollLeft = previousScrollLeft;
                          if (ganttSurfaceRef.current) ganttSurfaceRef.current.scrollTop = previousScrollTop;
                        });
                      }}
                      style={{ width: month.width }}
                      className="flex shrink-0 items-center justify-center gap-1 border-r border-slate-200 px-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
                    >
                      {month.collapsed ? (
                        <ChevronRight size={13} />
                      ) : (
                        <ChevronDown size={13} />
                      )}
                      <span className="shrink-0 whitespace-nowrap">
                        {formatGanttMonthLabel(month.key, month.collapsed)}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="hidden">
                  {timelineColumns.map((column) => column.date ? (
                    <div
                      key={column.key}
                      className={`flex shrink-0 flex-col items-center justify-center border-r border-slate-100 text-[11px] ${
                        column.date === today
                          ? "bg-slate-200 font-bold text-slate-900 ring-1 ring-inset ring-slate-300"
                          : isWeekend(column.date)
                            ? "bg-slate-50 text-slate-400"
                            : "text-slate-500"
                      }`}
                      style={{ width: column.width }}
                    >
                      <span className="font-bold">{dayFormatter.format(parseDate(column.date))}</span>
                      <span>{weekdayFormatter.format(parseDate(column.date))}</span>
                    </div>
                  ) : (
                    <div key={column.key} aria-hidden="true" className="flex shrink-0 items-center justify-center border-r border-slate-200 bg-slate-100 text-[10px] text-slate-400" style={{ width: column.width }}>접힘</div>
                  ))}
                </div>

                <div className="relative">
                  {timelineColumns.map((column, index) => (
                    <div
                      key={column.key}
                      className={`pointer-events-none absolute top-0 z-[1] h-full border-r ${
                        column.date === null
                          ? "border-slate-200 bg-slate-100/80"
                          : column.date === today
                            ? "border-l-2 border-l-blue-500 border-r-slate-100 bg-blue-50/20"
                          : isWeekend(column.date)
                            ? "border-slate-200 bg-[#F5F9FF]/80"
                            : "border-slate-100"
                      }`}
                      style={{
                        left: timelineColumnLefts[index],
                        width: column.width,
                      }}
                    />
                  ))}

                  <svg aria-label="업무 선후관계" className="pointer-events-none absolute inset-0 z-[15] h-full w-full overflow-visible">
                    <defs>
                      <marker id="gantt-dependency-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" className="fill-slate-500" />
                      </marker>
                    </defs>
                    {dependencyLines.map((line) => (
                      <path key={line.id} d={line.path} fill="none" stroke="rgb(100 116 139)" strokeWidth="1.5" markerEnd="url(#gantt-dependency-arrow)" className="pointer-events-auto">
                        <title>{line.title}</title>
                      </path>
                    ))}
                  </svg>

                  {displayItems.map((item) => item.kind === "group" ? (
                    <div
                      key={item.key}
                      className="relative border-b border-slate-200 bg-slate-100/80"
                      style={{ height: item.height }}
                    />
                  ) : (() => {
                    const row = item.row;
                    return (
                    <div
                      key={row.rowKey}
                      data-gantt-row-id={row.project.id}
                      onDoubleClick={(event) => {
                        const bounds = event.currentTarget.getBoundingClientRect();
                        const memoDate = getTimelineColumnAtOffset(event.clientX - bounds.left)?.column.date;
                        if (memoDate) openProjectMemo(row.project, memoDate);
                      }}
                      className={`relative border-b border-t-2 border-b-slate-200 border-t-slate-300 transition-colors duration-150 ${projectRowBackgrounds.get(row.rowKey)}`}
                      style={{ height: row.rowHeight }}
                    >
                      {projectMemos
                        .filter((memo) => memo.project_id === row.project.id && memo.memo_date >= start && memo.memo_date <= end)
                        .flatMap((memo) => {
                          const memoLeft = dateLeftByValue.get(memo.memo_date);
                          if (memoLeft === undefined) return [];
                          return [(
                          <button
                            key={memo.id}
                            type="button"
                            title={memo.content}
                            aria-label={`${memo.memo_date} 프로젝트 메모`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openProjectMemo(row.project, memo.memo_date);
                            }}
                            onDoubleClick={(event) => event.stopPropagation()}
                            className="absolute top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-[10px] text-amber-700 shadow-sm ring-1 ring-amber-300 hover:bg-amber-200"
                            style={{ left: memoLeft + dayWidth / 2 - 8 }}
                          >
                            ●
                          </button>
                          )];
                        })}
                      {row.segments.map(({ task, startDate, dueDate, lane }) => {
                        const geometry = getVisibleRangeGeometry(startDate, dueDate);
                        if (!geometry) return null;
                        const left = geometry.left + 4;
                        const width = Math.max(geometry.width - 8, 28);
                        const delayedDays = getDelayedDays(task, today);
                        const statusPresentation = getTaskStatusPresentation(task, today);
                        const assemblyVendorName = getTaskAssemblyVendorName(task);
                        const taskTypeColor = getTaskTypeColor(task.task_type);
                        const taskMemo = taskMemos.find((memo) => memo.task_id === task.id);
                        const taskNote = taskNotePreviews.get(task.id);
                        const tagDefinitions = taskTags
                          .filter((item) => item.task_id === task.id)
                          .map((item) => getTaskTagDefinition(item.tag))
                          .filter((tag) => tag !== undefined);
                        const tooltipParts = [
                          `${statusPresentation.icon} ${statusPresentation.label}`,
                          `프로젝트: ${row.project.project_name}`,
                          `조립업체: ${assemblyVendorName}`,
                          `업무명: ${task.task_name || "업무명 없음"}`,
                          `업무유형: ${task.task_type || "-"}`,
                          `담당자: ${task.assignee || "미배정"}`,
                          `시작일: ${startDate}`,
                          `종료일: ${dueDate}`,
                          delayedDays !== null ? `지연: ${delayedDays}일` : null,
                          taskMemo ? `메모: ${taskMemo.content}` : null,
                          taskNote ? `${taskNote.isImportant ? "중요 메모" : "메모"}: ${taskNote.note}` : null,
                          ...tagDefinitions.map((tag) => `${tag.icon} ${tag.label}`),
                        ].filter((value): value is string => value !== null);

                        return (
                          <button
                            type="button"
                            key={task.id}
                            title={tooltipParts.join("\n")}
                            onPointerDown={(event) => startTaskDrag(event, row.project, task, startDate, dueDate, lane)}
                            onPointerMove={moveTaskDrag}
                            onPointerUp={(event) => void finishTaskDrag(event)}
                            onPointerCancel={cancelTaskDrag}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (!canEdit || savingTaskId !== null) return;
                              if (taskClickTimerRef.current !== null) {
                                window.clearTimeout(taskClickTimerRef.current);
                                taskClickTimerRef.current = null;
                              }
                              const menuWidth = 192;
                              const menuHeight = 304;
                              setTaskContextMenu({
                                x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
                                y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
                                task,
                                project: row.project,
                              });
                            }}
                            onClick={(event) => {
                              if (selectTask(event, task.id)) return;
                              if (Date.now() < suppressTaskClickUntilRef.current) {
                                event.preventDefault();
                                event.stopPropagation();
                                return;
                              }
                              if (taskClickTimerRef.current !== null) window.clearTimeout(taskClickTimerRef.current);
                              taskClickTimerRef.current = window.setTimeout(() => {
                                setSelectedTask({
                                  taskId: task.id,
                                  projectId: row.project.id,
                                  projectName: row.project.project_name,
                                  assemblyVendorName,
                                  projectCode: row.project.project_code,
                                  taskName: task.task_name,
                                  taskType: task.task_type,
                                  assignee: task.assignee,
                                  startDate,
                                  dueDate,
                                  status: task.status,
                                  completedDate: task.completed_date,
                                  delayedDays,
                                  taskTypeClassName: taskTypeColor.className,
                                  memo: taskNote?.note ?? null,
                                  memoIsImportant: taskNote?.isImportant ?? false,
                                });
                                taskClickTimerRef.current = null;
                              }, 220);
                            }}
                            onDoubleClick={(event) => {
                              if (Date.now() < suppressTaskClickUntilRef.current) return;
                              event.stopPropagation();
                              if (taskClickTimerRef.current !== null) {
                                window.clearTimeout(taskClickTimerRef.current);
                                taskClickTimerRef.current = null;
                              }
                              setSelectedTask(null);
                              openTaskMemo(row.project, task);
                            }}
                            aria-label={`${assemblyVendorName}, ${task.task_name || "업무"}, 드래그하여 일정 이동`}
                            className={`group absolute z-20 h-5 touch-none overflow-visible whitespace-nowrap rounded-full px-2 text-left text-[11px] font-semibold leading-5 shadow-sm ring-1 transition duration-150 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 ${selectedTaskIds.has(task.id) ? "!ring-2 !ring-blue-600 shadow-md brightness-105" : ""} ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default"} ${savingTaskId === task.id ? "cursor-wait animate-pulse" : ""} ${taskDrag?.task.id === task.id || taskResize?.task.id === task.id ? "opacity-35" : ""} ${taskTypeColor.className} ${getScheduleMarkerClass(
                              task,
                              today
                            )}`}
                            style={{
                              left,
                              top: 16 + lane * laneHeight,
                              width,
                            }}
                          >
                            {canEdit && (
                              <>
                                <span
                                  role="separator"
                                  aria-label="시작일 조절"
                                  className="absolute inset-y-0 left-0 z-30 w-2 cursor-ew-resize rounded-l-full border-l-2 border-blue-600 bg-white/70 opacity-0 transition-opacity group-hover:opacity-100"
                                  onPointerDown={(event) => startTaskResize(event, "start", row.project, task, startDate, dueDate, lane)}
                                  onPointerMove={moveTaskResize}
                                  onPointerUp={(event) => void finishTaskResize(event)}
                                  onPointerCancel={cancelTaskResize}
                                  onClick={(event) => event.stopPropagation()}
                                  onDoubleClick={(event) => event.stopPropagation()}
                                />
                                <span
                                  role="separator"
                                  aria-label="마감일 조절"
                                  className="absolute inset-y-0 right-0 z-30 w-2 cursor-ew-resize rounded-r-full border-r-2 border-blue-600 bg-white/70 opacity-0 transition-opacity group-hover:opacity-100"
                                  onPointerDown={(event) => startTaskResize(event, "end", row.project, task, startDate, dueDate, lane)}
                                  onPointerMove={moveTaskResize}
                                  onPointerUp={(event) => void finishTaskResize(event)}
                                  onPointerCancel={cancelTaskResize}
                                  onClick={(event) => event.stopPropagation()}
                                  onDoubleClick={(event) => event.stopPropagation()}
                                />
                              </>
                            )}
                            <span className="mr-1 inline-flex font-bold" aria-label={statusPresentation.label}>
                              {statusPresentation.icon}
                            </span>
                            {taskNote && <span className="mr-1 inline-flex shrink-0" aria-label={taskNote.isImportant ? "중요 메모 있음" : "메모 있음"} title={`${taskNote.isImportant ? "중요 메모" : "메모"}\n${taskNote.note}`}>{taskNote.isImportant ? "⚠" : "📝"}</span>}
                            {taskMemo && (
                              <span
                                role="button"
                                tabIndex={0}
                                className="mr-1 inline-flex cursor-pointer text-amber-700"
                                aria-label="메모 열기"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openTaskMemo(row.project, task);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    openTaskMemo(row.project, task);
                                  }
                                }}
                              >
                                ●
                              </span>
                            )}
                            {tagDefinitions.length > 0 && (
                              <span
                                className="mr-1 inline-flex items-center gap-0.5"
                                title={tagDefinitions.map((tag) => `${tag.icon} ${tag.label}`).join("\n")}
                              >
                                {tagDefinitions.slice(0, 3).map((tag) => (
                                  <span key={tag.code} aria-label={tag.label}>{tag.icon}</span>
                                ))}
                                {tagDefinitions.length > 3 && (
                                  <span className="text-[10px] font-bold">+{tagDefinitions.length - 3}</span>
                                )}
                              </span>
                            )}
                            <span className="mr-1 font-bold">{assemblyVendorName}</span>·{" "}
                            {task.task_type || "업무"} ·{" "}
                            {task.task_name || "업무명 없음"}
                          </button>
                        );
                      })}
                      {taskDrag?.project.id === row.project.id && taskDrag.task.project_assembly_vendor_id === row.assemblyVendorId && taskDrag.offsetDays !== 0 && (() => {
                        const previewStart = shiftDate(taskDrag.startDate, taskDrag.offsetDays);
                        const previewDue = shiftDate(taskDrag.dueDate, taskDrag.offsetDays);
                        const previewGeometry = getVisibleRangeGeometry(previewStart, previewDue);
                        if (!previewGeometry) return null;
                        const previewLeft = previewGeometry.left + 4;
                        const previewWidth = Math.max(previewGeometry.width - 8, 28);
                        return (
                          <div
                            className="pointer-events-none absolute z-40 min-h-12 rounded-xl border-2 border-blue-500 bg-blue-50 px-2 py-1 text-[11px] font-semibold leading-4 text-blue-950 shadow-lg"
                            style={{
                              left: previewLeft,
                              top: 12 + taskDrag.lane * laneHeight,
                              width: Math.max(previewWidth, 170),
                            }}
                          >
                            <div className="truncate">{taskDrag.task.task_name || "업무"}</div>
                            <div className="whitespace-nowrap">{previewStart} ~ {previewDue}</div>
                            <div>{taskDrag.offsetDays > 0 ? "+" : ""}{taskDrag.offsetDays}일 이동</div>
                          </div>
                        );
                      })()}
                      {taskResize?.project.id === row.project.id && taskResize.task.project_assembly_vendor_id === row.assemblyVendorId && taskResize.offsetDays !== 0 && (() => {
                        const previewStart = taskResize.edge === "start"
                          ? shiftDate(taskResize.startDate, taskResize.offsetDays)
                          : taskResize.startDate;
                        const previewDue = taskResize.edge === "end"
                          ? shiftDate(taskResize.dueDate, taskResize.offsetDays)
                          : taskResize.dueDate;
                        const durationDays = getDayDiff(previewStart, previewDue) + 1;
                        const previewGeometry = getVisibleRangeGeometry(previewStart, previewDue);
                        if (!previewGeometry) return null;
                        const previewLeft = previewGeometry.left + 4;
                        const previewWidth = Math.max(previewGeometry.width - 8, 28);
                        return (
                          <div
                            className="pointer-events-none absolute z-40 min-h-12 rounded-xl border-2 border-violet-500 bg-violet-50 px-2 py-1 text-[11px] font-semibold leading-4 text-violet-950 shadow-lg"
                            style={{
                              left: previewLeft,
                              top: 12 + taskResize.lane * laneHeight,
                              width: Math.max(previewWidth, 170),
                            }}
                          >
                            <div className="truncate">{taskResize.task.task_name || "업무"}</div>
                            <div className="whitespace-nowrap">{previewStart} ~ {previewDue}</div>
                            <div>기간 {durationDays}일</div>
                          </div>
                        );
                      })()}
                    </div>
                    );
                  })())}
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      {selectedTask && (
        <GanttTaskDetailModal
          task={selectedTask}
          today={today}
          onTaskUpdated={(updatedTask) => {
            onTaskUpdated(updatedTask);
            void persistAndPublishTaskOrders(
              tasks.map((task) => task.id === updatedTask.id ? updatedTask : task)
            );
          }}
          canEdit={canEdit}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {memoTarget && (
        <GanttMemoModal
          target={memoTarget}
          onClose={() => setMemoTarget(null)}
          onSave={saveMemo}
          onDelete={deleteMemo}
        />
      )}

      {pendingDependencyMove && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onClick={() => void resolveDependencyMove("cancel")}>
          <div role="dialog" aria-modal="true" aria-labelledby="dependency-move-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h2 id="dependency-move-title" className="text-lg font-bold text-slate-950">후행 작업 일정 이동</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              이 업무와 연결된 후행 작업 {pendingDependencyMove.dependencyChanges.length}건도 함께 이동하시겠습니까?
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => void resolveDependencyMove("cancel")}>취소</Button>
              <Button type="button" variant="secondary" onClick={() => void resolveDependencyMove("exclude")}>현재 업무만 이동</Button>
              <Button type="button" variant="primary" onClick={() => void resolveDependencyMove("include")}>함께 이동</Button>
            </div>
          </div>
        </div>
      )}

      {taskContextMenu && (
        <div
          ref={contextMenuRef}
          role="menu"
          className="fixed z-[60] w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
          style={{ left: taskContextMenu.x, top: taskContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="flex h-9 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
            onClick={() => {
              setAssigneeTask({ task: taskContextMenu.task, project: taskContextMenu.project });
              setTaskContextMenu(null);
            }}
          >
            담당자 변경
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex h-9 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
            onClick={() => {
              setTagTask({ task: taskContextMenu.task, project: taskContextMenu.project });
              setTaskContextMenu(null);
            }}
          >
            <span>태그</span>
            <span className="text-xs text-slate-400">{taskTags.filter((item) => item.task_id === taskContextMenu.task.id).length}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex h-9 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
            onClick={() => {
              setDependencyTask({ task: taskContextMenu.task, project: taskContextMenu.project });
              setTaskContextMenu(null);
            }}
          >
            선후관계
          </button>
          <div className="my-1 border-t border-slate-100" />
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-400">상태 변경</div>
          {taskStatusOptions.map((status) => {
            const isCurrent = (normalizeTaskStatus(taskContextMenu.task.status) || "pending") === status;
            return (
              <button
                key={status}
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent}
                className={`flex h-9 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 ${isCurrent ? "bg-slate-100 text-slate-950" : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"}`}
                onClick={() => void saveTaskStatus(taskContextMenu.task, status)}
              >
                <span>{getTaskStatusLabel(status)}</span>
                {isCurrent && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {assigneeTask && (
        <GanttAssigneeModal
          project={assigneeTask.project}
          task={assigneeTask.task}
          onClose={() => setAssigneeTask(null)}
          onSave={(assignee) => saveTaskAssignee(assigneeTask.task, assigneeTask.project, assignee)}
        />
      )}

      {tagTask && (
        <TaskTagSelector
          projectName={tagTask.project.project_name}
          taskName={tagTask.task.task_name || "업무명 없음"}
          value={taskTags
            .filter((item) => item.task_id === tagTask.task.id)
            .map((item) => item.tag)
            .filter((tag): tag is TaskTagCode => TASK_TAGS.some((definition) => definition.code === tag))}
          disabled={!canEdit}
          onClose={() => setTagTask(null)}
          onSave={(tags) => saveTaskTags(tagTask.task, tags)}
        />
      )}

      {dependencyTask && (
        <GanttDependencyModal
          task={dependencyTask.task}
          projectName={dependencyTask.project.project_name}
          projectTasks={tasks.filter((task) =>
            task.project_id === dependencyTask.project.id
            && task.project_assembly_vendor_id === dependencyTask.task.project_assembly_vendor_id
          )}
          dependencies={dependencies}
          canEdit={canEdit}
          onCreate={(predecessorTaskId) => createDependency(dependencyTask.task, predecessorTaskId)}
          onDelete={deleteDependency}
          onClose={() => setDependencyTask(null)}
        />
      )}

      {bulkEditKind && (
        <GanttBulkEditModal
          kind={bulkEditKind}
          taskCount={selectedTaskIds.size}
          initialTags={TASK_TAGS
            .filter((tag) => Array.from(selectedTaskIds).every((taskId) => taskTags.some((item) => item.task_id === taskId && item.tag === tag.code)))
            .map((tag) => tag.code)}
          onClose={() => setBulkEditKind(null)}
          onSave={applyBulkEdit}
        />
      )}
      {isExcelDialogOpen && <GanttExcelExportDialog
        open={isExcelDialogOpen}
        currentStart={start}
        currentEnd={end}
        monthStart={getMonthRange(currentMonth).start}
        monthEnd={getMonthRange(currentMonth).end}
        projects={ganttExportProjects}
        loading={isExcelExporting}
        onClose={() => { if (!isExcelExporting) setIsExcelDialogOpen(false); }}
        onDownload={(template, range, exportStart, exportEnd, projectKey) => void exportGanttExcel(template, range, exportStart, exportEnd, projectKey)}
      />}
    </div>
  );
}
