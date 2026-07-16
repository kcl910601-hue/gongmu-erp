"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, FileText, Search, Star, X } from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { supabase } from "@/lib/supabase";
import {
  getProjectStatusLabel,
  isTaskCompleted,
  normalizeProjectStatus,
} from "@/lib/status";
import { getRecentUserScope, readFavoriteProjects } from "@/lib/recent";

type Project = {
  id: number;
  project_code: string | null;
  project_name: string;
  assembly_vendor: string | null;
  task_manager: string | null;
  salesperson: string | null;
  status: string | null;
  updated_at: string | null;
};

type Task = {
  id: number;
  project_id: number;
  status: string | null;
  due_date: string | null;
};

type ProjectFileRow = {
  project_id: number;
};

type BoardStatus = "pending" | "in_progress" | "hold" | "completed";
type SortKey = "project_name" | "assembly_vendor" | "updated_at" | "progress";
type GroupBy = "none" | "salesperson" | "vendor";

type BoardProject = Project & {
  normalizedStatus: BoardStatus;
  progress: number;
  totalTasks: number;
  completedTasks: number;
  delayedTasks: number;
  todayDueTasks: number;
  thisWeekDueTasks: number;
  nextDueDate: string | null;
  hasFiles: boolean;
  isFavorite: boolean;
};

const boardColumns: Array<{ value: BoardStatus; label: string }> = [
  { value: "pending", label: "진행 예정" },
  { value: "in_progress", label: "진행중" },
  { value: "hold", label: "보류" },
  { value: "completed", label: "완료" },
];

const COLLAPSED_COLUMNS_KEY = "gongmu-board-collapsed-columns";
const COLLAPSED_GROUPS_KEY = "gongmu-board-collapsed-groups";
const ALL_LABEL = "전체";
const UNASSIGNED_LABEL = "미지정";

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getThisWeekRange(date: string) {
  const baseDate = new Date(`${date}T00:00:00`);
  const dayOfWeek = baseDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startDate = new Date(baseDate);
  const endDate = new Date(baseDate);

  startDate.setDate(baseDate.getDate() + mondayOffset);
  endDate.setDate(startDate.getDate() + 6);

  return {
    startOfWeek: formatDateInput(startDate),
    endOfWeek: formatDateInput(endDate),
  };
}

function getBoardStatus(status: string | null): BoardStatus {
  const normalizedStatus = normalizeProjectStatus(status);

  if (
    normalizedStatus === "pending" ||
    normalizedStatus === "in_progress" ||
    normalizedStatus === "hold" ||
    normalizedStatus === "completed"
  ) {
    return normalizedStatus;
  }

  return "pending";
}

function getStatusVariant(status: BoardStatus): BadgeVariant {
  if (status === "completed") return "success";
  if (status === "in_progress") return "info";
  if (status === "hold") return "warning";

  return "default";
}

function formatDate(value: string | null) {
  if (!value) return "-";

  return value.slice(0, 10);
}

function getProjectVendor(project: Pick<Project, "assembly_vendor">) {
  return project.assembly_vendor?.trim() || UNASSIGNED_LABEL;
}

function getProjectAssignee(project: Pick<Project, "task_manager" | "salesperson">) {
  return project.task_manager || project.salesperson || UNASSIGNED_LABEL;
}

function getProjectGroupLabel(project: BoardProject, currentGroupBy: GroupBy) {
  if (currentGroupBy === "salesperson") {
    return project.salesperson || UNASSIGNED_LABEL;
  }

  if (currentGroupBy === "vendor") {
    return getProjectVendor(project);
  }

  return "전체 프로젝트";
}

function getProjectGroupKey(project: BoardProject, currentGroupBy: GroupBy) {
  return `${currentGroupBy}:${getProjectGroupLabel(project, currentGroupBy)}`;
}

export default function ProjectBoardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectIdsWithFiles, setProjectIdsWithFiles] = useState<Set<number>>(
    () => new Set()
  );
  const [favoriteProjectIds, setFavoriteProjectIds] = useState<Set<number>>(
    () => new Set()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [draggingProjectId, setDraggingProjectId] = useState<number | null>(null);
  const [draggingGroupKey, setDraggingGroupKey] = useState<string | null>(null);
  const [quickViewProjectId, setQuickViewProjectId] = useState<number | null>(
    null
  );
  const [collapsedColumns, setCollapsedColumns] = useState<BoardStatus[]>(() => {
    if (typeof window === "undefined") return [];

    try {
      const rawValue = window.localStorage.getItem(COLLAPSED_COLUMNS_KEY);
      const parsedValue = rawValue ? JSON.parse(rawValue) : [];

      return Array.isArray(parsedValue) ? (parsedValue as BoardStatus[]) : [];
    } catch {
      return [];
    }
  });
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];

    try {
      const rawValue = window.localStorage.getItem(COLLAPSED_GROUPS_KEY);
      const parsedValue = rawValue ? JSON.parse(rawValue) : [];

      return Array.isArray(parsedValue) ? (parsedValue as string[]) : [];
    } catch {
      return [];
    }
  });
  const [assigneeFilter, setAssigneeFilter] = useState("전체");
  const [vendorFilter, setVendorFilter] = useState("전체");
  const [salespersonFilter, setSalespersonFilter] = useState("전체");
  const [statusFilter, setStatusFilter] = useState<"all" | BoardStatus>("all");
  const [favoriteFilter, setFavoriteFilter] = useState("all");
  const [excludeCompleted, setExcludeCompleted] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  const loadBoard = useCallback(async function loadBoard() {
    setIsLoading(true);
    setErrorMessage("");

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select(
        "id, project_code, project_name, assembly_vendor, task_manager, salesperson, status, updated_at"
      )
      .order("updated_at", { ascending: false, nullsFirst: false });

    if (projectError) {
      setErrorMessage(projectError.message);
      setIsLoading(false);
      return;
    }

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select("id, project_id, status, due_date");

    if (taskError) {
      setErrorMessage(taskError.message);
      setIsLoading(false);
      return;
    }

    const { data: fileData, error: fileError } = await supabase
      .from("project_files")
      .select("project_id");

    if (fileError) {
      setErrorMessage(fileError.message);
      setIsLoading(false);
      return;
    }

    const userScope = await getRecentUserScope();
    const favoriteIds = new Set(
      readFavoriteProjects(userScope).map((project) => project.project_id)
    );
    const fileIds = new Set(
      ((fileData || []) as ProjectFileRow[]).map((file) => file.project_id)
    );

    setProjects((projectData || []) as Project[]);
    setTasks((taskData || []) as Task[]);
    setProjectIdsWithFiles(fileIds);
    setFavoriteProjectIds(favoriteIds);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBoard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadBoard]);

  const today = formatDateInput(new Date());
  const { startOfWeek, endOfWeek } = getThisWeekRange(today);

  const boardProjects = useMemo<BoardProject[]>(() => {
    return projects.map((project) => {
      const projectTasks = tasks.filter((task) => task.project_id === project.id);
      const completedTasks = projectTasks.filter((task) =>
        isTaskCompleted(task.status)
      ).length;
      const delayedTasks = projectTasks.filter(
        (task) =>
          !isTaskCompleted(task.status) &&
          task.due_date !== null &&
          task.due_date < today
      ).length;
      const todayDueTasks = projectTasks.filter(
        (task) => !isTaskCompleted(task.status) && task.due_date === today
      ).length;
      const thisWeekDueTasks = projectTasks.filter(
        (task) =>
          !isTaskCompleted(task.status) &&
          task.due_date !== null &&
          task.due_date >= startOfWeek &&
          task.due_date <= endOfWeek
      ).length;
      const nextDueDate =
        projectTasks
          .filter((task) => !isTaskCompleted(task.status) && task.due_date)
          .map((task) => task.due_date || "")
          .sort((a, b) => a.localeCompare(b))[0] || null;
      const progress =
        projectTasks.length > 0
          ? Math.round((completedTasks / projectTasks.length) * 100)
          : 0;

      return {
        ...project,
        normalizedStatus: getBoardStatus(project.status),
        progress,
        totalTasks: projectTasks.length,
        completedTasks,
        delayedTasks,
        todayDueTasks,
        thisWeekDueTasks,
        nextDueDate,
        hasFiles: projectIdsWithFiles.has(project.id),
        isFavorite: favoriteProjectIds.has(project.id),
      };
    });
  }, [
    endOfWeek,
    favoriteProjectIds,
    projectIdsWithFiles,
    projects,
    startOfWeek,
    tasks,
    today,
  ]);

  const assigneeOptions = useMemo(() => {
    const names = projects
      .map((project) => project.task_manager)
      .filter((value): value is string => Boolean(value));

    return [ALL_LABEL, ...Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))];
  }, [projects]);

  const salespersonOptions = useMemo(() => {
    const names = projects
      .map((project) => project.salesperson)
      .filter((value): value is string => Boolean(value));

    return [ALL_LABEL, ...Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))];
  }, [projects]);

  const vendorOptions = useMemo(() => {
    const vendors = projects.map(
      (project) => getProjectVendor(project)
    );

    return [
      ALL_LABEL,
      ...Array.from(new Set(vendors)).sort((a, b) => {
        if (a === UNASSIGNED_LABEL) return 1;
        if (b === UNASSIGNED_LABEL) return -1;
        return a.localeCompare(b);
      }),
    ];
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return boardProjects
      .filter((project) => {
        const assignee = project.task_manager || "";
        const salesperson = project.salesperson || "";
        const vendor = getProjectVendor(project);
        const searchMatched =
          !keyword ||
          project.project_name.toLowerCase().includes(keyword) ||
          (project.project_code || "").toLowerCase().includes(keyword) ||
          vendor.toLowerCase().includes(keyword) ||
          assignee.toLowerCase().includes(keyword) ||
          salesperson.toLowerCase().includes(keyword);
        const assigneeMatched =
          assigneeFilter === ALL_LABEL || assignee === assigneeFilter;
        const salespersonMatched =
          salespersonFilter === ALL_LABEL || salesperson === salespersonFilter;
        const vendorMatched = vendorFilter === ALL_LABEL || vendor === vendorFilter;
        const statusMatched =
          statusFilter === "all" || project.normalizedStatus === statusFilter;
        const favoriteMatched =
          favoriteFilter === "all" || project.isFavorite;
        const completedMatched =
          !excludeCompleted || project.normalizedStatus !== "completed";

        return (
          searchMatched &&
          assigneeMatched &&
          salespersonMatched &&
          vendorMatched &&
          statusMatched &&
          favoriteMatched &&
          completedMatched
        );
      })
      .sort((a, b) => {
        if (sortKey === "project_name") {
          return a.project_name.localeCompare(b.project_name);
        }

        if (sortKey === "assembly_vendor") {
          const vendorA = getProjectVendor(a);
          const vendorB = getProjectVendor(b);

          if (vendorA === UNASSIGNED_LABEL && vendorB !== UNASSIGNED_LABEL) return 1;
          if (vendorB === UNASSIGNED_LABEL && vendorA !== UNASSIGNED_LABEL) return -1;
          return vendorA.localeCompare(vendorB) || a.project_name.localeCompare(b.project_name);
        }

        if (sortKey === "progress") {
          return a.progress - b.progress || a.project_name.localeCompare(b.project_name);
        }

        return (
          (b.updated_at || "").localeCompare(a.updated_at || "") ||
          a.project_name.localeCompare(b.project_name)
        );
      });
  }, [
    assigneeFilter,
    boardProjects,
    excludeCompleted,
    favoriteFilter,
    searchText,
    sortKey,
    salespersonFilter,
    statusFilter,
    vendorFilter,
  ]);

  const quickViewProject =
    quickViewProjectId !== null
      ? boardProjects.find((project) => project.id === quickViewProjectId) || null
      : null;

  const viewKpi = useMemo(() => {
    const projectCount = filteredProjects.length;
    const averageProgress =
      projectCount > 0
        ? Math.round(
            filteredProjects.reduce(
              (total, project) => total + project.progress,
              0
            ) / projectCount
          )
        : 0;

    return {
      projectCount,
      averageProgress,
      delayedCount: filteredProjects.filter((project) => project.delayedTasks > 0)
        .length,
      todayDueCount: filteredProjects.reduce(
        (total, project) => total + project.todayDueTasks,
        0
      ),
    };
  }, [filteredProjects]);

  const boardGroups = useMemo(() => {
    if (groupBy === "none") {
      return [
        {
          key: "none:all",
          label: "전체 프로젝트",
          projects: filteredProjects,
          isUnassigned: false,
        },
      ];
    }

    const groupedProjects = filteredProjects.reduce<
      Record<
        string,
        {
          key: string;
          label: string;
          projects: BoardProject[];
          isUnassigned: boolean;
        }
      >
    >((grouped, project) => {
      const label = getProjectGroupLabel(project, groupBy);
      const key = getProjectGroupKey(project, groupBy);

      if (!grouped[key]) {
        grouped[key] = {
          key,
          label,
          projects: [],
          isUnassigned: label === UNASSIGNED_LABEL,
        };
      }

      grouped[key].projects.push(project);
      return grouped;
    }, {});

    return Object.values(groupedProjects).sort((a, b) => {
      if (groupBy === "vendor" && a.isUnassigned !== b.isUnassigned) {
        return a.isUnassigned ? 1 : -1;
      }

      if (b.projects.length !== a.projects.length) {
        return b.projects.length - a.projects.length;
      }

      return a.label.localeCompare(b.label);
    });
  }, [filteredProjects, groupBy]);

  function toggleColumn(column: BoardStatus) {
    setCollapsedColumns((currentColumns) => {
      const nextColumns = currentColumns.includes(column)
        ? currentColumns.filter((item) => item !== column)
        : [...currentColumns, column];

      window.localStorage.setItem(COLLAPSED_COLUMNS_KEY, JSON.stringify(nextColumns));

      return nextColumns;
    });
  }

  function toggleGroup(groupKey: string) {
    setCollapsedGroups((currentGroups) => {
      const nextGroups = currentGroups.includes(groupKey)
        ? currentGroups.filter((item) => item !== groupKey)
        : [...currentGroups, groupKey];

      window.localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(nextGroups));

      return nextGroups;
    });
  }

  function getGroupStats(groupProjects: BoardProject[]) {
    const projectCount = groupProjects.length;
    const averageProgress =
      projectCount > 0
        ? Math.round(
            groupProjects.reduce((total, project) => total + project.progress, 0) /
              projectCount
          )
        : 0;

    return {
      projectCount,
      averageProgress,
      delayedCount: groupProjects.filter((project) => project.delayedTasks > 0)
        .length,
      thisWeekDueCount: groupProjects.reduce(
        (total, project) => total + project.thisWeekDueTasks,
        0
      ),
    };
  }

  function handleProjectDrop(groupKey: string, nextStatus: BoardStatus) {
    if (draggingProjectId === null) return;

    if (groupBy !== "none" && draggingGroupKey !== groupKey) {
      setDraggingProjectId(null);
      setDraggingGroupKey(null);
      return;
    }

    void moveProject(draggingProjectId, nextStatus);
  }

  async function moveProject(projectId: number, nextStatus: BoardStatus) {
    const targetProject = projects.find((project) => project.id === projectId);

    if (!targetProject || getBoardStatus(targetProject.status) === nextStatus) {
      setDraggingProjectId(null);
      setDraggingGroupKey(null);
      return;
    }

    const previousProjects = projects;
    const nextUpdatedAt = new Date().toISOString();

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId
          ? { ...project, status: nextStatus, updated_at: nextUpdatedAt }
          : project
      )
    );
    setDraggingProjectId(null);
    setDraggingGroupKey(null);

    const { error } = await supabase
      .from("projects")
      .update({ status: nextStatus })
      .eq("id", projectId);

    if (error) {
      setProjects(previousProjects);
      setErrorMessage(error.message);
    }
  }

  function renderProjectCard(project: BoardProject, groupKey: string) {
    return (
      <article
        key={project.id}
        draggable
        onDragStart={() => {
          setDraggingProjectId(project.id);
          setDraggingGroupKey(groupKey);
        }}
        onDragEnd={() => {
          setDraggingProjectId(null);
          setDraggingGroupKey(null);
        }}
        onClick={() => {
          if (draggingProjectId !== null) return;

          setQuickViewProjectId(project.id);
        }}
        className={`group cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm transition hover:border-blue-200 hover:bg-white hover:shadow-md ${
          draggingProjectId === project.id ? "opacity-50" : ""
        }`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-slate-950">
              {project.project_name}
            </h3>
            <p className="mt-1 truncate text-xs text-slate-500">
              {project.project_code || "코드 없음"} · 조립처{" "}
              {getProjectVendor(project)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge
              variant={getStatusVariant(project.normalizedStatus)}
              className="px-2 py-0.5"
            >
              {getProjectStatusLabel(project.normalizedStatus)}
            </Badge>
            {project.isFavorite && (
              <Star size={14} className="fill-amber-400 text-amber-400" />
            )}
          </div>
        </div>

        <div className="space-y-2 text-xs text-slate-500">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate">담당 {getProjectAssignee(project)}</span>
            <span className="font-semibold text-slate-700">
              {project.progress}%
            </span>
          </div>
          <ProgressBar percent={project.progress} className="h-2 w-full" />
          <div className="flex items-center justify-between gap-3">
            <span>
              업무 {project.completedTasks}/{project.totalTasks}
            </span>
            <span className="text-red-600">지연 {project.delayedTasks}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {project.todayDueTasks > 0 && (
              <Badge variant="warning" className="px-2 py-0.5">
                오늘 마감
              </Badge>
            )}
            {project.delayedTasks > 0 && (
              <Badge variant="danger" className="px-2 py-0.5">
                지연
              </Badge>
            )}
            {project.isFavorite && (
              <Badge variant="warning" className="px-2 py-0.5">
                즐겨찾기
              </Badge>
            )}
            {project.hasFiles && (
              <Badge variant="info" className="px-2 py-0.5">
                <span className="inline-flex items-center gap-1">
                  <FileText size={12} />
                  파일
                </span>
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <CalendarClock size={13} />
            <span>마감 예정 {project.nextDueDate || "-"}</span>
          </div>
        </div>

        <div className="mt-3 hidden rounded-xl bg-white px-3 py-2 text-xs text-slate-500 group-hover:block">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate">영업 {project.salesperson || "-"}</span>
            <span className="shrink-0">이번 주 {project.thisWeekDueTasks}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="truncate">조립처 {getProjectVendor(project)}</span>
            <span className="shrink-0">
              최근 수정 {formatDate(project.updated_at)}
            </span>
          </div>
          {project.delayedTasks > 0 && (
            <div className="mt-1 inline-flex items-center gap-1 text-red-600">
              <AlertTriangle size={12} />
              지연 업무
            </div>
          )}
        </div>
      </article>
    );
  }

  function renderBoardColumn(
    column: (typeof boardColumns)[number],
    groupProjects: BoardProject[],
    groupKey: string
  ) {
    const columnProjects = groupProjects.filter(
      (project) => project.normalizedStatus === column.value
    );
    const isCollapsed = collapsedColumns.includes(column.value);
    const averageProgress =
      columnProjects.length > 0
        ? Math.round(
            columnProjects.reduce((total, project) => total + project.progress, 0) /
              columnProjects.length
          )
        : 0;

    return (
      <section
        key={`${groupKey}:${column.value}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => handleProjectDrop(groupKey, column.value)}
        className="min-h-[520px] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
      >
        <button
          type="button"
          onClick={() => toggleColumn(column.value)}
          className="mb-3 flex w-full items-center justify-between gap-3 rounded-2xl px-1 py-1 text-left transition hover:bg-slate-50"
        >
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">{column.label}</h2>
            <p className="mt-1 text-xs text-slate-400">
              {columnProjects.length}개 · 평균 {averageProgress}%
            </p>
          </div>
          <Badge variant={getStatusVariant(column.value)}>
            {isCollapsed ? "접힘" : columnProjects.length}
          </Badge>
        </button>

        {isCollapsed ? (
          <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-400">
            접힌 컬럼입니다.
          </div>
        ) : columnProjects.length > 0 ? (
          <div className="space-y-3">
            {columnProjects.map((project) => renderProjectCard(project, groupKey))}
          </div>
        ) : (
          <EmptyState
            message="프로젝트가 없습니다."
            className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500"
          />
        )}
      </section>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-7 text-slate-900 lg:px-8">
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-slate-400">
              Project Board
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              프로젝트 보드
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              프로젝트 상태를 칸반 보드로 보고 드래그로 빠르게 변경합니다.
            </p>
          </div>
          <div className="space-y-3 xl:min-w-[780px]">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Projects</p>
                <p className="mt-1 text-lg font-bold text-slate-950">
                  {viewKpi.projectCount}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">평균</p>
                <p className="mt-1 text-lg font-bold text-blue-600">
                  {viewKpi.averageProgress}%
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">지연</p>
                <p className="mt-1 text-lg font-bold text-red-600">
                  {viewKpi.delayedCount}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">오늘</p>
                <p className="mt-1 text-lg font-bold text-orange-600">
                  {viewKpi.todayDueCount}
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <select
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value as GroupBy)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
              >
                <option value="none">Group By 없음</option>
                <option value="salesperson">Group By 영업자 ⭐</option>
                <option value="vendor">Group By 조립처 ⭐</option>
              </select>
            <select
              value={assigneeFilter}
              onChange={(event) => setAssigneeFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
            >
              {assigneeOptions.map((assignee) => (
                <option key={assignee} value={assignee}>
                  담당자 {assignee}
                </option>
              ))}
            </select>
            <select
              value={salespersonFilter}
              onChange={(event) => setSalespersonFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
            >
              {salespersonOptions.map((salesperson) => (
                <option key={salesperson} value={salesperson}>
                  영업자 {salesperson}
                </option>
              ))}
            </select>
            <select
              value={vendorFilter}
              onChange={(event) => setVendorFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
            >
              {vendorOptions.map((vendor) => (
                <option key={vendor} value={vendor}>
                  조립처 {vendor}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | BoardStatus)
              }
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
            >
              <option value="all">상태 전체</option>
              {boardColumns.map((column) => (
                <option key={column.value} value={column.value}>
                  {column.label}
                </option>
              ))}
            </select>
            <select
              value={favoriteFilter}
              onChange={(event) => setFavoriteFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
            >
              <option value="all">즐겨찾기 전체</option>
              <option value="favorite">즐겨찾기만</option>
            </select>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
            >
              <option value="updated_at">최근 수정</option>
              <option value="project_name">프로젝트명</option>
              <option value="assembly_vendor">조립처</option>
              <option value="progress">진행률</option>
            </select>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={excludeCompleted}
                onChange={(event) => setExcludeCompleted(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              완료 제외
            </label>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Search size={18} className="text-slate-400" />
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="프로젝트명, 코드, 조립처, 담당자 검색"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-4">
          {boardColumns.map((column) => (
            <section
              key={column.value}
              className="min-h-[520px] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="mb-3 h-10 rounded-2xl bg-slate-100" />
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="h-4 w-2/3 rounded bg-slate-200" />
                    <div className="mt-3 h-3 w-1/2 rounded bg-slate-200" />
                    <div className="mt-4 h-2 rounded-full bg-slate-200" />
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="h-3 rounded bg-slate-200" />
                      <div className="h-3 rounded bg-slate-200" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : groupBy === "none" ? (
        <div className="grid gap-4 xl:grid-cols-4">
          {boardColumns.map((column) => {
            const columnProjects = filteredProjects.filter(
              (project) => project.normalizedStatus === column.value
            );
            const isCollapsed = collapsedColumns.includes(column.value);
            const averageProgress =
              columnProjects.length > 0
                ? Math.round(
                    columnProjects.reduce(
                      (total, project) => total + project.progress,
                      0
                    ) / columnProjects.length
                  )
                : 0;

            return (
              <section
                key={column.value}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggingProjectId !== null) {
                    void moveProject(draggingProjectId, column.value);
                  }
                }}
                className="min-h-[520px] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggleColumn(column.value)}
                  className="mb-3 flex w-full items-center justify-between gap-3 rounded-2xl px-1 py-1 text-left transition hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900">
                      {column.label}
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">
                      {columnProjects.length}개 · 평균 {averageProgress}%
                    </p>
                  </div>
                  <Badge variant={getStatusVariant(column.value)}>
                    {isCollapsed ? "접힘" : columnProjects.length}
                  </Badge>
                </button>

                {isCollapsed ? (
                  <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-400">
                    접힌 컬럼입니다.
                  </div>
                ) : columnProjects.length > 0 ? (
                  <div className="space-y-3">
                    {columnProjects.map((project) => (
                      <article
                        key={project.id}
                        draggable
                        onDragStart={() => setDraggingProjectId(project.id)}
                        onDragEnd={() => setDraggingProjectId(null)}
                        onClick={() => {
                          if (draggingProjectId !== null) return;

                          setQuickViewProjectId(project.id);
                        }}
                        className={`group cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm transition hover:border-blue-200 hover:bg-white hover:shadow-md ${
                          draggingProjectId === project.id ? "opacity-50" : ""
                        }`}
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-bold text-slate-950">
                              {project.project_name}
                            </h3>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {project.project_code || "코드 없음"} · 조립처{" "}
                              {project.assembly_vendor || "미지정"}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge
                              variant={getStatusVariant(project.normalizedStatus)}
                              className="px-2 py-0.5"
                            >
                              {getProjectStatusLabel(project.normalizedStatus)}
                            </Badge>
                            {project.isFavorite && (
                              <Star
                                size={14}
                                className="fill-amber-400 text-amber-400"
                              />
                            )}
                          </div>
                        </div>

                        <div className="space-y-2 text-xs text-slate-500">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate">
                              담당 {project.task_manager || project.salesperson || "-"}
                            </span>
                            <span className="font-semibold text-slate-700">
                              {project.progress}%
                            </span>
                          </div>
                          <ProgressBar
                            percent={project.progress}
                            className="h-2 w-full"
                          />
                          <div className="flex items-center justify-between gap-3">
                            <span>
                              업무 {project.completedTasks}/{project.totalTasks}
                            </span>
                            <span className="text-red-600">
                              지연 {project.delayedTasks}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {project.todayDueTasks > 0 && (
                              <Badge variant="warning" className="px-2 py-0.5">
                                오늘 마감
                              </Badge>
                            )}
                            {project.delayedTasks > 0 && (
                              <Badge variant="danger" className="px-2 py-0.5">
                                지연
                              </Badge>
                            )}
                            {project.isFavorite && (
                              <Badge variant="warning" className="px-2 py-0.5">
                                즐겨찾기
                              </Badge>
                            )}
                            {project.hasFiles && (
                              <Badge variant="info" className="px-2 py-0.5">
                                <span className="inline-flex items-center gap-1">
                                  <FileText size={12} />
                                  파일
                                </span>
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-slate-500">
                            <CalendarClock size={13} />
                            <span>마감 예정 {project.nextDueDate || "-"}</span>
                          </div>
                        </div>

                        <div className="mt-3 hidden rounded-xl bg-white px-3 py-2 text-xs text-slate-500 group-hover:block">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate">
                              조립처 {project.assembly_vendor || "미지정"}
                            </span>
                            <span className="shrink-0">
                              이번 주 {project.thisWeekDueTasks}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-3">
                            <span className="truncate">
                              최근 수정 {formatDate(project.updated_at)}
                            </span>
                            {project.delayedTasks > 0 && (
                              <span className="inline-flex items-center gap-1 text-red-600">
                                <AlertTriangle size={12} />
                                지연 업무
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    message="프로젝트가 없습니다."
                    className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500"
                  />
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-5">
          {boardGroups.map((group) => {
            const isGroupCollapsed = collapsedGroups.includes(group.key);
            const groupStats = getGroupStats(group.projects);

            return (
              <section
                key={group.key}
                className="rounded-2xl border border-slate-200 bg-slate-100/70 p-3 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="mb-3 flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      {groupBy === "salesperson" ? "영업자" : "조립처"}
                    </p>
                    <h2 className="mt-1 truncate text-lg font-bold text-slate-950">
                      {group.label}
                    </h2>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <span className="rounded-xl bg-slate-50 px-3 py-2 text-slate-600">
                      <b className="text-slate-950">{groupStats.projectCount}</b>{" "}
                      Projects
                    </span>
                    <span className="rounded-xl bg-blue-50 px-3 py-2 text-blue-700">
                      평균 <b>{groupStats.averageProgress}%</b>
                    </span>
                    <span className="rounded-xl bg-red-50 px-3 py-2 text-red-700">
                      지연 <b>{groupStats.delayedCount}</b>
                    </span>
                    <span className="rounded-xl bg-orange-50 px-3 py-2 text-orange-700">
                      이번주 <b>{groupStats.thisWeekDueCount}</b>
                    </span>
                  </div>
                  <Badge variant="default" className="shrink-0">
                    {isGroupCollapsed ? "접힘" : "펼침"}
                  </Badge>
                </button>

                {isGroupCollapsed ? (
                  <div className="rounded-2xl bg-white/70 p-6 text-center text-sm text-slate-400">
                    접힌 그룹입니다.
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-4">
                    {boardColumns.map((column) =>
                      renderBoardColumn(column, group.projects, group.key)
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {boardGroups.length === 0 && (
            <EmptyState
              message="프로젝트가 없습니다."
              className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm"
            />
          )}
        </div>
      )}

      {quickViewProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4"
          onMouseDown={() => setQuickViewProjectId(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-slate-400">
                  Project Quick View
                </p>
                <h2 className="mt-1 truncate text-xl font-bold text-slate-950">
                  {quickViewProject.project_name}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {quickViewProject.project_code || "코드 없음"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickViewProjectId(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Quick View 닫기"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["조립처", quickViewProject.assembly_vendor || "미지정"],
                [
                  "담당",
                  quickViewProject.task_manager ||
                    quickViewProject.salesperson ||
                    "-",
                ],
                ["오늘 마감", `${quickViewProject.todayDueTasks}건`],
                ["이번 주 마감", `${quickViewProject.thisWeekDueTasks}건`],
                ["지연 업무", `${quickViewProject.delayedTasks}건`],
                ["최근 수정", formatDate(quickViewProject.updated_at)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                >
                  <p className="text-xs font-medium text-slate-500">{label}</p>
                  <p className="mt-1 truncate text-sm font-bold text-slate-900">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">진행률</span>
                <span className="font-bold text-blue-600">
                  {quickViewProject.progress}%
                </span>
              </div>
              <ProgressBar percent={quickViewProject.progress} className="h-2" />
              <p className="mt-2 text-xs text-slate-500">
                업무 {quickViewProject.completedTasks}/{quickViewProject.totalTasks}
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setQuickViewProjectId(null)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => router.push(`/projects/${quickViewProject.id}`)}
                className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                프로젝트 보기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
