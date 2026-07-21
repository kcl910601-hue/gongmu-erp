"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FolderOpen,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { addActivity } from "@/lib/activity";
import { toast } from "@/lib/toast";
import {
  getProjects,
  type ProjectListItem,
} from "@/lib/projects";
import { ProjectCreateForm } from "@/components/projects/ProjectCreateForm";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableViewControls } from "@/components/ui/TableViewControls";
import { ErrorState } from "@/components/ui/ErrorState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  paginateRows,
  type SortDirection,
} from "@/lib/table-view";
import {
  addFavoriteProject,
  getRecentUserScope,
  hydrateFavoriteProjectsFromDatabase,
  readFavoriteProjects,
  removeFavoriteProject,
} from "@/lib/recent";
import {
  getProjectStatusLabel,
  getProjectStatusOrder,
  isProjectCompleted,
  isProjectInProgress,
  normalizeProjectStatus,
} from "@/lib/status";

type ProjectSortKey =
  | "created_at"
  | "project_code"
  | "project_name"
  | "client_name"
  | "assembly_vendor"
  | "salesperson"
  | "process_type"
  | "task_manager"
  | "status"
  | "start_date"
  | "end_date";

const DEFAULT_SORT_KEY: ProjectSortKey = "created_at";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";
const koreanNaturalCollator = new Intl.Collator("ko-KR", {
  numeric: true,
  sensitivity: "base",
});

function compareNullable<T>(
  left: T | null | undefined,
  right: T | null | undefined,
  direction: SortDirection,
  compare: (leftValue: T, rightValue: T) => number
) {
  const leftEmpty = left === null || left === undefined || left === "";
  const rightEmpty = right === null || right === undefined || right === "";

  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  const result = compare(left as T, right as T);
  return direction === "asc" ? result : -result;
}

function getProjectSortValue(project: ProjectListItem, key: ProjectSortKey) {
  if (key === "end_date") {
    return project.end_date || project.completion_due_date;
  }

  return project[key];
}

function sortProjects(
  projects: ProjectListItem[],
  key: ProjectSortKey,
  direction: SortDirection
) {
  return [...projects].sort((left, right) => {
    if (key === "status") {
      return compareNullable(
        getProjectStatusOrder(left.status),
        getProjectStatusOrder(right.status),
        direction,
        (leftValue, rightValue) => leftValue - rightValue
      );
    }

    const leftValue = getProjectSortValue(left, key);
    const rightValue = getProjectSortValue(right, key);

    if (key === "start_date" || key === "end_date" || key === "created_at") {
      const leftTimestamp = leftValue ? Date.parse(String(leftValue)) : null;
      const rightTimestamp = rightValue ? Date.parse(String(rightValue)) : null;

      return compareNullable(
        leftTimestamp,
        rightTimestamp,
        direction,
        (leftDate, rightDate) => leftDate - rightDate
      );
    }

    return compareNullable(
      leftValue,
      rightValue,
      direction,
      (leftText, rightText) =>
        koreanNaturalCollator.compare(String(leftText), String(rightText))
    );
  });
}

type SortableProjectHeaderProps = {
  label: string;
  sortKey: ProjectSortKey;
  activeSortKey: ProjectSortKey;
  direction: SortDirection;
  onSort: (key: ProjectSortKey) => void;
};

function SortableProjectHeader({
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
}: SortableProjectHeaderProps) {
  const isActive = activeSortKey === sortKey && sortKey !== DEFAULT_SORT_KEY;
  const ariaSort = isActive
    ? direction === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <th className="px-3 py-3 text-left" aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex w-full cursor-pointer items-center gap-1.5 rounded-md text-left transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span>{label}</span>
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp size={13} aria-hidden="true" />
          ) : (
            <ArrowDown size={13} aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown
            size={13}
            className="text-slate-300"
            aria-hidden="true"
          />
        )}
      </button>
    </th>
  );
}

function getProjectStatusFromQuery() {
  const status = new URLSearchParams(window.location.search).get("status");

  if (!status) return null;
  if (status === "in_progress") return "진행중";
  if (status === "completed") return "완료";
  if (status === "delayed") return "지연";
  return "전체";
}

function isProjectDelayed(project: ProjectListItem) {
  if (isProjectCompleted(project.status)) return false;

  const endDate = project.end_date || project.completion_due_date;
  if (!endDate) return false;

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;
  return endDate < today;
}

export default function ProjectsPage() {
  const [showModal, setShowModal] = useState(false);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [projectPendingDelete, setProjectPendingDelete] =
    useState<ProjectListItem | null>(null);
  const [search, setSearch] = usePersistentState("erp:table:projects:search", "");
  const [statusFilter, setStatusFilter] = usePersistentState(
    "erp:table:projects:status",
    "전체"
  );
  const [processFilter, setProcessFilter] = usePersistentState(
    "erp:table:projects:process",
    "전체"
  );
  const [sortKey, setSortKey] = usePersistentState<ProjectSortKey>(
    "erp:table:projects:sort-key",
    DEFAULT_SORT_KEY
  );
  const [sortDirection, setSortDirection] =
    usePersistentState<SortDirection>(
      "erp:table:projects:sort-direction",
      DEFAULT_SORT_DIRECTION
    );
  const [pageSize, setPageSize] = usePersistentState(
    "erp:table:projects:page-size",
    20
  );
  const [currentPage, setCurrentPage] = usePersistentState(
    "erp:table:projects:page",
    1
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [favoriteUserScope, setFavoriteUserScope] = useState<string | null>(null);
  const [favoriteProjectIds, setFavoriteProjectIds] = useState<Set<number>>(
    () => new Set()
  );

  const processList = ["MH", "SH", "AS", "본납-문틀", "본납-도어"];

  const fetchProjects = useCallback(async function fetchProjects() {
    setIsLoading(true);
    setErrorMessage("");
    const { data, error } = await getProjects();

    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    setProjects(data);
    setIsLoading(false);
  }, []);

const loadRole = useCallback(async function loadRole() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.email) return;

  const { data, error } = await supabase
    .from("employees")
    .select("role")
    .eq("email", session.user.email)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return;
  }

  setIsAdmin(data?.role === "admin");
}, []);


  useEffect(() => {
    const timer = window.setTimeout(() => {
      const queryStatus = getProjectStatusFromQuery();
      if (queryStatus) setStatusFilter(queryStatus);
      void fetchProjects();
      void loadRole();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchProjects, loadRole, setStatusFilter]);

  useEffect(() => {
    let isMounted = true;

    async function loadFavorites() {
      const scope = await getRecentUserScope();
      if (!isMounted) return;

      setFavoriteUserScope(scope);
      const favorites = await hydrateFavoriteProjectsFromDatabase(scope);
      if (!isMounted) return;
      setFavoriteProjectIds(
        new Set(favorites.map((project) => project.project_id))
      );
    }

    function handleFavoritesUpdated() {
      setFavoriteProjectIds(
        new Set(
          readFavoriteProjects(favoriteUserScope).map(
            (project) => project.project_id
          )
        )
      );
    }

    void loadFavorites();
    window.addEventListener("gongmu-recent-updated", handleFavoritesUpdated);
    return () => {
      isMounted = false;
      window.removeEventListener(
        "gongmu-recent-updated",
        handleFavoritesUpdated
      );
    };
  }, [favoriteUserScope]);

  function toggleFavorite(project: ProjectListItem) {
    if (!favoriteUserScope) return;

    if (favoriteProjectIds.has(project.id)) {
      removeFavoriteProject(favoriteUserScope, project.id);
    } else {
      addFavoriteProject(favoriteUserScope, {
        project_id: project.id,
        project_name: project.project_name,
        project_code: project.project_code,
        assembly_vendor: project.assembly_vendor,
        status: project.status,
      });
    }

    setFavoriteProjectIds(
      new Set(
        readFavoriteProjects(favoriteUserScope).map(
          (favorite) => favorite.project_id
        )
      )
    );
  }

  async function deleteProject(projectId: number) {
    const targetProject = projects.find((project) => project.id === projectId);

    const { error: shipmentError } = await supabase
      .from("shipments")
      .delete()
      .eq("project_id", projectId);

    if (shipmentError) {
      toast.error(shipmentError.message);
      return;
    }

    const { error: taskError } = await supabase
      .from("tasks")
      .delete()
      .eq("project_id", projectId);

    if (taskError) {
      toast.error(taskError.message);
      return;
    }

    const { error: sectionError } = await supabase
      .from("project_sections")
      .delete()
      .eq("project_id", projectId);

    if (sectionError) {
      toast.error(sectionError.message);
      return;
    }

    const { error: projectError } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId);

    if (projectError) {
      toast.error(projectError.message);
      return;
    }

    await addActivity({
      type: "project_delete",
      title: "프로젝트 삭제",
      description: `${targetProject?.project_name || "프로젝트"}을(를) 삭제했습니다.`,
      projectId: null,
      targetType: "project",
      targetId: projectId,
      metadata: {
        projectId,
        deletedProjectName: targetProject?.project_name ?? null,
        deletedProjectCode: targetProject?.project_code ?? null,
        deletedProjectStatus: targetProject?.status ?? null,
      },
    });

    void fetchProjects();
    setProjectPendingDelete(null);
    toast.success("프로젝트가 삭제되었습니다.");
  }

  function getStatusBadgeVariant(status: string | null): BadgeVariant {
    const statusValue = normalizeProjectStatus(status);

    if (statusValue === "completed") {
      return "success";
    }

    if (statusValue === "in_progress") {
      return "info";
    }

    if (statusValue === "hold") {
      return "warning";
    }

    if (statusValue === "pending") {
      return "default";
    }

    return "default";
  }

  function formatDate(date: string | null) {
    return date ? date.slice(0, 10) : "-";
  }

  const totalProjects = projects.length;

  const activeProjects = projects.filter(
    (project) => isProjectInProgress(project.status)
  ).length;

  const completedProjects = projects.filter(
    (project) => isProjectCompleted(project.status)
  ).length;

  const delayedProjects = projects.filter(
    (project) => normalizeProjectStatus(project.status) === "hold"
  ).length;

  const filteredProjects = projects.filter((project) => {
    const keyword = search.trim().toLowerCase();

    const searchMatched =
      keyword === "" ||
      project.project_name.toLowerCase().includes(keyword) ||
      (project.project_code || "").toLowerCase().includes(keyword) ||
      (project.client_name || "").toLowerCase().includes(keyword) ||
      (project.assembly_vendor || "").toLowerCase().includes(keyword) ||
      project.process_type.toLowerCase().includes(keyword) ||
      (project.salesperson || "").toLowerCase().includes(keyword) ||
      (project.task_manager || "").toLowerCase().includes(keyword);

    const statusMatched =
      statusFilter === "전체" ||
      (statusFilter === "지연"
        ? isProjectDelayed(project)
        : normalizeProjectStatus(project.status) ===
          normalizeProjectStatus(statusFilter));

    const processMatched =
      processFilter === "전체" || project.process_type === processFilter;

    return searchMatched && statusMatched && processMatched;
  });
  const sortedProjects = sortProjects(
    filteredProjects,
    sortKey,
    sortDirection
  );
  const projectPage = paginateRows(sortedProjects, currentPage, pageSize);

  function handleHeaderSort(nextSortKey: ProjectSortKey) {
    if (sortKey !== nextSortKey || sortKey === DEFAULT_SORT_KEY) {
      setSortKey(nextSortKey);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else {
      setSortKey(DEFAULT_SORT_KEY);
      setSortDirection(DEFAULT_SORT_DIRECTION);
    }

    setCurrentPage(1);
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-7 text-slate-900 lg:px-8">
      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">프로젝트 관리</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            프로젝트 등록, 진행상태, 담당자를 통합 관리합니다.
          </p>
        </div>

        <Button
          onClick={() => setShowModal(true)}
          variant="primary"
          className="flex shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus size={16} />
          프로젝트 등록
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">전체 프로젝트</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            {totalProjects}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">진행중</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-blue-600">
            {activeProjects}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">완료</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-emerald-600">
            {completedProjects}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">지연</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-red-600">
            {delayedProjects}
          </p>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(160px,0.45fr)_minmax(160px,0.45fr)]">
          <div className="min-w-0">
            <label className="mb-1.5 block text-xs font-medium text-slate-500">검색</label>
            <div className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 transition-colors focus-within:border-blue-300 focus-within:bg-white">
              <Search size={16} className="shrink-0 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="프로젝트명, 코드, 공정, 담당자 검색"
                className="h-full w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">상태</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:bg-white"
            >
              <option value="전체">전체</option>
              <option value="진행중">진행중</option>
              <option value="완료">완료</option>
              <option value="지연">지연</option>
              <option value="대기">대기</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">공정</label>
            <select
              value={processFilter}
              onChange={(e) => setProcessFilter(e.target.value)}
              className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:bg-white"
            >
              <option value="전체">전체</option>
              {processList.map((process) => (
                <option key={process} value={process}>
                  {process}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">프로젝트 목록</h2>
            <p className="mt-1 text-sm text-slate-500">
              검색 및 필터 조건에 맞는 프로젝트를 표시합니다.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {filteredProjects.length}건
          </span>
        </div>
        {errorMessage ? (
          <ErrorState
            message={errorMessage}
            onRetry={() => void fetchProjects()}
          />
        ) : isLoading ? (
          <TableSkeleton rows={7} columns={11} />
        ) : (
        <>
        <TableViewControls
          sortKey={sortKey}
          sortDirection={sortDirection}
          sortOptions={[
            { value: "created_at", label: "등록일" },
            { value: "project_code", label: "프로젝트 코드" },
            { value: "project_name", label: "프로젝트명" },
            { value: "client_name", label: "발주처" },
            { value: "assembly_vendor", label: "조립처" },
            { value: "salesperson", label: "영업자" },
            { value: "process_type", label: "공정유형" },
            { value: "task_manager", label: "업무담당자" },
            { value: "status", label: "상태" },
            { value: "start_date", label: "시작일" },
            { value: "end_date", label: "종료일" },
          ]}
          pageSize={pageSize}
          page={projectPage.page}
          totalPages={projectPage.totalPages}
          totalItems={filteredProjects.length}
          onSortKeyChange={(value) => {
            setSortKey(value as ProjectSortKey);
            setSortDirection(
              value === DEFAULT_SORT_KEY ? DEFAULT_SORT_DIRECTION : "asc"
            );
            setCurrentPage(1);
          }}
          onSortDirectionChange={(value) => {
            setSortDirection(value);
            setCurrentPage(1);
          }}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setCurrentPage(1);
          }}
          onPageChange={setCurrentPage}
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1480px]">
            <colgroup>
              <col className="w-[11%]" />
              <col className="w-[18%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <SortableProjectHeader
                  label="프로젝트 코드"
                  sortKey="project_code"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleHeaderSort}
                />
                <SortableProjectHeader
                  label="프로젝트명"
                  sortKey="project_name"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleHeaderSort}
                />
                <SortableProjectHeader
                  label="발주처"
                  sortKey="client_name"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleHeaderSort}
                />
                <SortableProjectHeader
                  label="조립처"
                  sortKey="assembly_vendor"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleHeaderSort}
                />
                <SortableProjectHeader
                  label="영업자"
                  sortKey="salesperson"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleHeaderSort}
                />
                <SortableProjectHeader
                  label="공정유형"
                  sortKey="process_type"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleHeaderSort}
                />
                <SortableProjectHeader
                  label="업무담당자"
                  sortKey="task_manager"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleHeaderSort}
                />
                <SortableProjectHeader
                  label="상태"
                  sortKey="status"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleHeaderSort}
                />
                <SortableProjectHeader
                  label="시작일"
                  sortKey="start_date"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleHeaderSort}
                />
                <SortableProjectHeader
                  label="종료일"
                  sortKey="end_date"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleHeaderSort}
                />
                <th className="px-3 py-3 text-left">관리</th>
              </tr>
            </thead>

            <tbody>
              {projectPage.rows.map((project) => (
                <tr
                  key={project.id}
                  className="group border-b border-slate-100 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <td className="px-3 py-3.5">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block truncate font-semibold text-slate-700 hover:text-blue-600 hover:underline"
                    >
                      {project.project_code || "-"}
                    </Link>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex min-w-0 items-start gap-2">
                      <button
                        type="button"
                        onClick={() => toggleFavorite(project)}
                        disabled={!favoriteUserScope}
                        aria-label={
                          favoriteProjectIds.has(project.id)
                            ? `${project.project_name} 즐겨찾기 해제`
                            : `${project.project_name} 즐겨찾기 추가`
                        }
                        className={`mt-0.5 shrink-0 rounded-lg p-1 transition-all hover:bg-amber-50 ${
                          favoriteProjectIds.has(project.id)
                            ? "text-amber-500 opacity-100"
                            : "text-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100"
                        }`}
                      >
                        <Star
                          size={15}
                          className={
                            favoriteProjectIds.has(project.id)
                              ? "fill-current"
                              : ""
                          }
                        />
                      </button>
                      <div className="min-w-0">
                        <Link
                          href={`/projects/${project.id}`}
                          className="block truncate font-semibold text-slate-950 hover:text-blue-600 hover:underline"
                        >
                          {project.project_name}
                        </Link>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3.5">{project.client_name || "-"}</td>
                  <td className="px-3 py-3.5">{project.assembly_vendor || "-"}</td>
                  <td className="px-3 py-3.5">{project.salesperson || "-"}</td>
                  <td className="px-3 py-3.5">{project.process_type || "-"}</td>
                  <td className="px-3 py-3.5">{project.task_manager || "-"}</td>
                  <td className="px-3 py-3.5">
                    <Badge
                      variant={getStatusBadgeVariant(project.status)}
                      className="font-semibold"
                    >
                      {getProjectStatusLabel(project.status)}
                    </Badge>
                  </td>
                  <td className="px-3 py-3.5 text-slate-500">
                    {formatDate(project.start_date)}
                  </td>
                  <td className="px-3 py-3.5 text-slate-500">
                    {formatDate(project.end_date || project.completion_due_date)}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex gap-2">
                      <Link
                        href={`/projects/${project.id}`}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:border-blue-200 hover:bg-blue-50"
                      >
                        수정
                      </Link>

                      {isAdmin && (
                        <button
                          onClick={() => setProjectPendingDelete(project)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:border-red-200 hover:bg-red-50"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredProjects.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-0">
                    <EmptyState
                      title="조건에 맞는 프로젝트가 없습니다."
                      message="검색어나 필터를 변경하거나 새 프로젝트를 만들어보세요."
                      icon={<FolderOpen size={26} />}
                      action={
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setShowModal(true)}
                        >
                          새 프로젝트 만들기
                        </Button>
                      }
                      className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-5 text-2xl font-bold">프로젝트 등록</h2>
            <ProjectCreateForm
              onCancel={() => setShowModal(false)}
              onSuccess={(projectId) => {
                window.location.href = `/projects/${projectId}`;
              }}
            />
          </div>
        </div>
      )}
      <ConfirmDialog
        open={projectPendingDelete !== null}
        title="프로젝트 삭제"
        description={`${projectPendingDelete?.project_name || "선택한 프로젝트"}와 관련 업무 및 출고 정보를 삭제합니다. 계속하시겠습니까?`}
        confirmLabel="삭제"
        danger
        onClose={() => setProjectPendingDelete(null)}
        onConfirm={() => {
          if (projectPendingDelete) {
            void deleteProject(projectPendingDelete.id);
          }
        }}
      />
    </div>
  );
}
