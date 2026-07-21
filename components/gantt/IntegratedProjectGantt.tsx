"use client";

import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Crosshair,
  LocateFixed,
  Minus,
  Monitor,
  Pin,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { GanttTaskDetailModal } from "@/components/gantt/GanttTaskDetailModal";
import { normalizeAssemblyVendor } from "@/lib/projects";
import {
  getProjectStatusLabel,
  getTaskStatusLabel,
  isTaskCompleted,
  normalizeProjectStatus,
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
};

export type IntegratedTask = {
  id: number;
  project_id: number;
  project_section_id?: number | null;
  task_order: number | null;
  task_name: string | null;
  task_type: string | null;
  assignee: string | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
};

type GanttSegment = {
  task: IntegratedTask;
  startDate: string;
  dueDate: string;
  lane: number;
};

type ProjectRow = {
  project: IntegratedProject;
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
};

export type GanttTaskDetail = {
  taskId: number;
  projectId: number;
  projectName: string;
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
const PRESENTATION_KEY = "erp-gantt-presentation";
const baseRowHeight = 58;
const laneHeight = 22;
const maxLanes = 3;
const dayFormatter = new Intl.DateTimeFormat("ko-KR", { day: "2-digit" });
const weekdayFormatter = new Intl.DateTimeFormat("ko-KR", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
});
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
  const startTime = parseDate(startDate).getTime();
  const endTime = parseDate(endDate).getTime();

  return Math.round((endTime - startTime) / (1000 * 60 * 60 * 24));
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
  if (isTaskCompleted(task.status) || !task.due_date || task.due_date >= today) {
    return null;
  }

  return getDayDiff(task.due_date, today);
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
}: IntegratedProjectGanttProps) {
  const presentationRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const timelineContentRef = useRef<HTMLDivElement | null>(null);
  const hasInitialTodayScrollRef = useRef(false);
  const columnFocusRef = useRef<HTMLDivElement | null>(null);
  const cellFocusRef = useRef<HTMLDivElement | null>(null);
  const laserRef = useRef<HTMLDivElement | null>(null);
  const spotlightRef = useRef<HTMLDivElement | null>(null);
  const focusedRowElementsRef = useRef<HTMLElement[]>([]);
  const focusLockedRef = useRef(false);
  const pointerFrozenRef = useRef(false);
  const projectRowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<GanttStatusFilter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState("전체");
  const [taskTypeFilter, setTaskTypeFilter] = useState("전체");
  const [assemblyVendorFilter, setAssemblyVendorFilter] = useState("전체");
  const [sortKey, setSortKey] = useState<GanttSortKey>("project_name");
  const [selectedTask, setSelectedTask] = useState<GanttTaskDetail | null>(null);
  const [isPresentation, setIsPresentation] = useState(false);
  const [isPresentationFilterOpen, setIsPresentationFilterOpen] =
    useState(false);
  const [zoom, setZoom] = useState(100);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(
    () => new Set()
  );
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
  }, [currentMonth, projects, tasks, visibleTaskIds]);
  const dateDays = useMemo(() => getDateRange(start, end), [end, start]);
  const visibleDateDays = dateDays;
  const monthGroups = useMemo(() => {
    const groups: Array<{ key: string; count: number }> = [];
    dateDays.forEach((date) => {
      const key = date.slice(0, 7);
      const last = groups[groups.length - 1];
      if (last?.key === key) last.count += 1;
      else groups.push({ key, count: 1 });
    });
    return groups;
  }, [dateDays]);
  const dayWidth = baseDayWidth * (zoom / 100);
  const weekRange = useMemo(() => getWeekRange(today), [today]);

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
    focusLockedRef.current = false;
    pointerFrozenRef.current = false;
    setFocusLocked(false);
    setPointerFrozen(false);
    clearMeetingFocus(true);
    savePresentationState();
    if (document.fullscreenElement) await document.exitFullscreen();
  }

  const availableTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          visibleTaskIds.has(task.id) &&
          (task.start_date || task.due_date) &&
          (task.start_date || task.due_date || "") <= end &&
          (task.due_date || task.start_date || "") >= start
      ),
    [end, start, tasks, visibleTaskIds]
  );

  const assigneeOptions = useMemo(() => {
    const assignees = availableTasks.map((task) => task.assignee || "미배정");

    return ["전체", ...Array.from(new Set(assignees)).sort()];
  }, [availableTasks]);

  const taskTypeOptions = useMemo(() => {
    const taskTypes = availableTasks.map((task) => getTaskTypeLabel(task.task_type));

    return ["전체", ...Array.from(new Set(taskTypes)).sort()];
  }, [availableTasks]);

  const assemblyVendorOptions = useMemo(() => {
    const visibleProjectIds = new Set(
      availableTasks.map((task) => task.project_id)
    );
    const vendors = projects
      .filter((project) => visibleProjectIds.has(project.id))
      .map((project) => normalizeAssemblyVendor(project.assembly_vendor) || "미지정");

    return ["전체", ...Array.from(new Set(vendors)).sort()];
  }, [availableTasks, projects]);

  function resetGanttFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setAssigneeFilter("전체");
    setTaskTypeFilter("전체");
    setAssemblyVendorFilter("전체");
    setSortKey("project_name");
  }

  const rows = useMemo<ProjectRow[]>(() => {
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const tasksByProject = new Map<number, IntegratedTask[]>();
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();

    tasks.forEach((task) => {
      if (!tasksByProject.has(task.project_id)) {
        tasksByProject.set(task.project_id, []);
      }

      tasksByProject.get(task.project_id)?.push(task);
    });

    return Array.from(tasksByProject.entries())
      .map(([projectId, projectTasks]) => {
        const project = projectMap.get(projectId);
        if (!project) return null;

        const assemblyVendor =
          normalizeAssemblyVendor(project.assembly_vendor) || "미지정";
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
            const searchFields = [
              project.project_name,
              project.project_code || "",
              assemblyVendor,
              project.task_manager || "",
              project.salesperson || "",
              task.task_name || "",
              task.task_type || "",
            ].map((value) => value.toLowerCase());
            const matchesSearch =
              normalizedSearchQuery === "" ||
              searchFields.some((value) => value.includes(normalizedSearchQuery));

            return (
              matchesStatus &&
              matchesAssignee &&
              matchesTaskType &&
              matchesSearch
            );
          })
          .sort((a, b) => {
            const orderA = a.task.task_order ?? Number.MAX_SAFE_INTEGER;
            const orderB = b.task.task_order ?? Number.MAX_SAFE_INTEGER;

            if (orderA !== orderB) return orderA - orderB;
            if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
            return (a.task.task_name || "").localeCompare(b.task.task_name || "");
          });

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
          project,
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
          const vendorA = normalizeAssemblyVendor(a.project.assembly_vendor);
          const vendorB = normalizeAssemblyVendor(b.project.assembly_vendor);

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
    sortKey,
    start,
    statusFilter,
    taskTypeFilter,
    tasks,
    today,
    visibleTaskIds,
    weekRange.end,
    weekRange.start,
  ]);

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
    if (!scrollRef.current || visibleDateDays.length === 0) return;

    const todayIndex = visibleDateDays.findIndex((date) => date >= today);
    const targetIndex =
      todayIndex === -1
        ? visibleDateDays.length - 1
        : Math.max(todayIndex, 0);
    const targetLeft =
      targetIndex * dayWidth - scrollRef.current.clientWidth / 2 + dayWidth;

    scrollRef.current.scrollLeft = Math.max(targetLeft, 0);
  }, [dayWidth, today, visibleDateDays]);

  useEffect(() => {
    if (
      hasInitialTodayScrollRef.current ||
      visibleDateDays.length === 0 ||
      rows.length === 0
    ) {
      return;
    }
    hasInitialTodayScrollRef.current = true;
    const frame = window.requestAnimationFrame(scrollToToday);
    return () => window.cancelAnimationFrame(frame);
  }, [rows.length, scrollToToday, visibleDateDays.length]);

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
    const index = Math.floor((clientX - contentRect.left) / dayWidth);
    if (index < 0 || index >= visibleDateDays.length) return;
    const left = index * dayWidth;

    if (columnFocusRef.current) {
      columnFocusRef.current.style.width = `${dayWidth}px`;
      columnFocusRef.current.style.transform = `translateX(${left}px)`;
      columnFocusRef.current.style.opacity = "1";
    }
    if (cellFocusRef.current && rowElement) {
      const rowRect = rowElement.getBoundingClientRect();
      cellFocusRef.current.style.width = `${dayWidth}px`;
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
          ? "relative h-screen overflow-hidden bg-white text-slate-900"
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
        <div className="relative z-50 flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-3 shadow-sm">
          <Button type="button" size="sm" variant="secondary" onClick={scrollToToday}>
            <LocateFixed size={15} /> 오늘
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
          <Button type="button" size="sm" variant="secondary" onClick={() => setIsPresentationFilterOpen((current) => !current)}>
            <SlidersHorizontal size={15} /> 필터
          </Button>
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
          {isPresentationFilterOpen && (
            <div className="absolute right-40 top-12 flex gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
              <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="h-9 rounded-lg border px-2 text-sm">{assigneeOptions.map((value) => <option key={value}>{value}</option>)}</select>
              <select value={taskTypeFilter} onChange={(event) => setTaskTypeFilter(event.target.value)} className="h-9 rounded-lg border px-2 text-sm">{taskTypeOptions.map((value) => <option key={value}>{value}</option>)}</select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as GanttStatusFilter)} className="h-9 rounded-lg border px-2 text-sm">{statusFilterOptions.map((value) => <option key={value.value} value={value.value}>{value.label}</option>)}</select>
            </div>
          )}
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
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={scrollToToday} className="h-9 rounded-2xl px-3.5 text-sm font-medium">오늘로 이동</Button>
          <Button type="button" variant="primary" size="sm" onClick={() => void enterPresentation()} className="h-9 rounded-2xl px-3.5 text-sm font-medium"><Monitor size={15} /> Presentation</Button>
        </div>
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
          className="rounded-2xl bg-slate-50 p-10 text-center text-sm text-slate-500"
        />
      ) : (
        <div data-gantt-focus-surface className={`overflow-y-auto border border-slate-200 ${isPresentation ? "h-[calc(100vh-56px)] rounded-none border-x-0 border-b-0" : "rounded-2xl"}`}>
          <div className="flex min-w-[1080px]">
            <div className="sticky left-0 z-30 w-[340px] shrink-0 border-r border-slate-200 bg-white">
              <div className="sticky top-0 z-20 grid h-[74px] grid-cols-[minmax(0,1fr)_70px] items-end gap-3 border-b border-slate-200 bg-slate-50 px-4 pb-3 text-xs font-semibold text-slate-500">
                <span>프로젝트</span>
                <span>진행률</span>
              </div>

              {rows.map((row) => (
                <div
                  key={row.project.id}
                  data-gantt-row-id={row.project.id}
                  ref={(node) => {
                    if (node) projectRowRefs.current.set(row.project.id, node);
                    else projectRowRefs.current.delete(row.project.id);
                  }}
                  className={`grid grid-cols-[minmax(0,1fr)_70px] items-center gap-3 border-b border-slate-100 px-4 transition-colors last:border-b-0 ${
                    highlightedProjectId === row.project.id
                      ? "bg-amber-100"
                      : "bg-white"
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
                      {normalizeAssemblyVendor(row.project.assembly_vendor) && (
                        <span className="truncate text-xs font-medium text-slate-400">
                          · {normalizeAssemblyVendor(row.project.assembly_vendor)}
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
              ))}
            </div>

            <div
              ref={scrollRef}
              onScroll={(event) => {
                if (!isPresentation) return;
                savePresentationState({
                  scrollLeft: event.currentTarget.scrollLeft,
                  scrollTop: event.currentTarget.scrollTop,
                });
              }}
              className="min-w-0 flex-1 overflow-x-auto scroll-smooth [scrollbar-width:thin]"
            >
              <div
                ref={timelineContentRef}
                className="relative"
                style={{ width: visibleDateDays.length * dayWidth }}
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
                <div className="sticky top-0 z-20 flex h-9 border-b border-slate-200 bg-slate-50">
                  {monthGroups.map((month) => (
                    <button
                      key={month.key}
                      type="button"
                      onClick={() => {
                        setCollapsedMonths((current) => {
                          const next = new Set(current);
                          if (next.has(month.key)) next.delete(month.key);
                          else next.add(month.key);
                          savePresentationState({
                            collapsedMonths: Array.from(next),
                          });
                          return next;
                        });
                      }}
                      style={{ width: month.count * dayWidth }}
                      className="flex shrink-0 items-center justify-center gap-1 border-r border-slate-200 px-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
                    >
                      {collapsedMonths.has(month.key) ? (
                        <ChevronRight size={13} />
                      ) : (
                        <ChevronDown size={13} />
                      )}
                      {monthFormatter.format(parseDate(`${month.key}-01`))}
                    </button>
                  ))}
                </div>

                <div className="sticky top-9 z-20 flex h-[37px] border-b border-slate-200 bg-white">
                  {visibleDateDays.map((date) => (
                    <div
                      key={date}
                      className={`flex shrink-0 flex-col items-center justify-center border-r border-slate-100 text-[11px] ${
                        date === today
                          ? "bg-slate-200 font-bold text-slate-900 ring-1 ring-inset ring-slate-300"
                          : isWeekend(date)
                            ? "bg-slate-50 text-slate-400"
                            : "text-slate-500"
                      }`}
                      style={{ width: dayWidth }}
                    >
                      {!collapsedMonths.has(date.slice(0, 7)) && (
                        <>
                          <span className="font-bold">{dayFormatter.format(parseDate(date))}</span>
                          <span>{weekdayFormatter.format(parseDate(date))}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <div className="relative">
                  {visibleDateDays.map((date, index) => (
                    <div
                      key={date}
                      className={`absolute top-0 h-full border-r ${
                        isWeekend(date)
                            ? "border-slate-100 bg-slate-50/70"
                            : "border-slate-100"
                      }`}
                      style={{
                        left: index * dayWidth,
                        width: dayWidth,
                      }}
                    />
                  ))}

                  {rows.map((row) => (
                    <div
                      key={row.project.id}
                      data-gantt-row-id={row.project.id}
                      className="relative border-b border-slate-100 transition-colors duration-150 last:border-b-0"
                      style={{ height: row.rowHeight }}
                    >
                      {row.segments.map(({ task, startDate, dueDate, lane }) => {
                        const visibleStart = startDate < start ? start : startDate;
                        const visibleDue = dueDate > end ? end : dueDate;
                        const startIndex = Math.max(
                          getDayDiff(start, visibleStart),
                          0
                        );
                        const duration = Math.max(
                          getDayDiff(visibleStart, visibleDue) + 1,
                          1
                        );
                        const left = startIndex * dayWidth + 4;
                        const width = Math.max(
                          duration * dayWidth - 8,
                          28
                        );
                        const delayedDays = getDelayedDays(task, today);
                        const taskTypeColor = getTaskTypeColor(task.task_type);
                        const tooltipParts = [
                          `프로젝트: ${row.project.project_name}`,
                          `업무명: ${task.task_name || "업무명 없음"}`,
                          `업무유형: ${task.task_type || "-"}`,
                          `담당자: ${task.assignee || "미배정"}`,
                          `시작일: ${startDate}`,
                          `종료일: ${dueDate}`,
                          `상태: ${getTaskStatusLabel(task.status)}`,
                          delayedDays !== null ? `지연: ${delayedDays}일` : null,
                        ].filter((value): value is string => value !== null);

                        return (
                          <button
                            type="button"
                            key={task.id}
                            title={tooltipParts.join("\n")}
                            onClick={() =>
                              setSelectedTask({
                                taskId: task.id,
                                projectId: row.project.id,
                                projectName: row.project.project_name,
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
                              })
                            }
                            className={`absolute z-20 h-5 overflow-visible whitespace-nowrap rounded-full px-2 text-left text-[11px] font-semibold leading-5 shadow-sm ring-1 transition duration-150 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 ${taskTypeColor.className} ${getScheduleMarkerClass(
                              task,
                              today
                            )}`}
                            style={{
                              left,
                              top: 16 + lane * laneHeight,
                              width,
                            }}
                          >
                            {task.task_type || "업무"} ·{" "}
                            {task.task_name || "업무명 없음"}
                          </button>
                        );
                      })}
                    </div>
                  ))}
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
          onTaskUpdated={onTaskUpdated}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
