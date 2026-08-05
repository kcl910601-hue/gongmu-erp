"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  FolderOpen,
  FileSpreadsheet,
  Loader2,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCurrentEmployee } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { addActivity } from "@/lib/activity";
import { toast } from "@/lib/toast";
import { formatProjectQuantity } from "@/lib/project-quantity";
import { downloadProjectExcelTemplate } from "@/lib/excel/project-template";
import {
  getProjects,
  type ProjectListItem,
} from "@/lib/projects";
import { ProjectDialog } from "@/components/projects/ProjectDialog";
import { ProjectExcelUploadDialog } from "@/components/projects/ProjectExcelUploadDialog";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableViewControls } from "@/components/ui/TableViewControls";
import { ErrorState } from "@/components/ui/ErrorState";
import { DdayBadge } from "@/components/ui/DdayBadge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { usePersistentState } from "@/hooks/usePersistentState";
import { formatHierarchicalDeleteLockMessage, type HierarchicalDeleteResult } from "@/lib/editing-locks";
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
        <span className="whitespace-nowrap">{label}</span>
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
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectListItem | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [projectPendingDelete, setProjectPendingDelete] =
    useState<ProjectListItem | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [salespersonFilter, setSalespersonFilter] = useState("전체");
  const [managerFilter, setManagerFilter] = useState("전체");
  const [assemblyVendorFilter, setAssemblyVendorFilter] = useState<number[]>([]);
  const [dueFilter, setDueFilter] = useState("전체");
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
  const [currentPage, setCurrentPage] = useState(1);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [favoriteUserScope, setFavoriteUserScope] = useState<string | null>(null);
  const [favoriteProjectIds, setFavoriteProjectIds] = useState<Set<number>>(
    () => new Set()
  );

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
  const employee = await getCurrentEmployee();
  setCurrentRole(employee?.role ?? null);
}, []);

  const canCreate = hasPermission(currentRole, "project_create");
  const canUpdate = hasPermission(currentRole, "project_update");
  const canDelete = hasPermission(currentRole, "project_delete");

  async function handleTemplateDownload() {
    if (isDownloadingTemplate) return;
    setIsDownloadingTemplate(true);
    try {
      await downloadProjectExcelTemplate();
    } catch (error) {
      console.error("project excel template error", error);
      toast.error("엑셀 양식을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsDownloadingTemplate(false);
    }
  }


  useEffect(() => {
    [
      "erp:table:projects:search",
      "erp:table:projects:status",
      "erp:table:projects:salesperson",
      "erp:table:projects:manager",
      "erp:table:projects:assembly-vendors",
      "erp:table:projects:due",
      "erp:table:projects:page",
    ].forEach((storageKey) => window.localStorage.removeItem(storageKey));

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
    const { data, error } = await supabase.rpc("delete_project_with_lock_check", { p_project_id: projectId });
    if (error) {
      toast.error(error.code === "PGRST202" ? "계층 삭제 잠금 migration을 먼저 적용해주세요." : error.message);
      return;
    }
    const result = data as HierarchicalDeleteResult | null;
    if (!result?.deleted) {
      toast.error(formatHierarchicalDeleteLockMessage(result ?? {}));
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
      (project.site_address || "").toLowerCase().includes(keyword) ||
      project.assemblyVendors.some((vendor) => vendor.organizationName.toLowerCase().includes(keyword)) ||
      project.process_type.toLowerCase().includes(keyword) ||
      (project.salesperson || "").toLowerCase().includes(keyword) ||
      (project.task_manager || "").toLowerCase().includes(keyword);

    const statusMatched =
      statusFilter === "전체" ||
      (statusFilter === "지연"
        ? isProjectDelayed(project)
        : normalizeProjectStatus(project.status) ===
          normalizeProjectStatus(statusFilter));

    const salespersonMatched = salespersonFilter === "전체" || project.salesperson === salespersonFilter;
    const managerMatched = managerFilter === "전체" || project.task_manager === managerFilter;
    const assemblyVendorMatched = assemblyVendorFilter.length === 0 || project.assemblyVendors.some((vendor) => assemblyVendorFilter.includes(vendor.organizationId));
    const endDate = project.end_date || project.completion_due_date;
    const today = new Date().toISOString().slice(0, 10);
    const dueMatched = dueFilter === "전체" || (dueFilter === "미정" ? !endDate : dueFilter === "지연" ? Boolean(endDate && endDate < today && !isProjectCompleted(project.status)) : Boolean(endDate && endDate >= today));

    return searchMatched && statusMatched && salespersonMatched && managerMatched && assemblyVendorMatched && dueMatched;
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

        {canCreate && <div className="flex shrink-0 flex-wrap gap-2"><Button onClick={() => void handleTemplateDownload()} disabled={isDownloadingTemplate} variant="outline" className="rounded-2xl px-4 py-2.5">{isDownloadingTemplate ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {isDownloadingTemplate ? "양식 생성 중..." : "엑셀 양식 다운로드"}</Button><Button onClick={() => setShowExcelUpload(true)} variant="outline" className="rounded-2xl px-4 py-2.5"><FileSpreadsheet size={16} /> 엑셀 업로드</Button><Button
            onClick={() => { setSelectedProject(null); setShowModal(true); }}
            variant="primary"
            className="flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-blue-700"
          >
            <Plus size={16} />
            신규 프로젝트
          </Button></div>}
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="min-w-0">
            <label className="mb-1.5 block text-xs font-medium text-slate-500">검색</label>
            <div className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 transition-colors focus-within:border-blue-300 focus-within:bg-white">
              <Search size={16} className="shrink-0 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="프로젝트명, 코드, 현장, 발주처, 영업담당 검색"
                className="h-full w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">조립업체 (OR)</label>
            <details className="relative">
              <summary className="flex h-10 cursor-pointer list-none items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">{assemblyVendorFilter.length ? `${assemblyVendorFilter.length}개 선택` : "전체"}</summary>
              <div className="absolute z-20 mt-1 max-h-56 w-full min-w-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                {[...new Map(projects.flatMap((project) => project.assemblyVendors).map((vendor) => [vendor.organizationId, vendor])).values()].sort((a, b) => koreanNaturalCollator.compare(a.organizationName, b.organizationName)).map((vendor) => <label key={vendor.organizationId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"><input type="checkbox" checked={assemblyVendorFilter.includes(vendor.organizationId)} onChange={() => setAssemblyVendorFilter(assemblyVendorFilter.includes(vendor.organizationId) ? assemblyVendorFilter.filter((id) => id !== vendor.organizationId) : [...assemblyVendorFilter, vendor.organizationId])} />{vendor.organizationName}</label>)}
                {assemblyVendorFilter.length > 0 && <button type="button" onClick={() => setAssemblyVendorFilter([])} className="mt-1 w-full rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50">선택 초기화</button>}
              </div>
            </details>
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
            <label className="mb-1.5 block text-xs font-medium text-slate-500">영업담당</label>
            <select
              value={salespersonFilter}
              onChange={(e) => setSalespersonFilter(e.target.value)}
              className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:bg-white"
            >
              <option value="전체">전체</option>
              {[...new Set(projects.map((project) => project.salesperson).filter((value): value is string => Boolean(value)))].sort((a, b) => koreanNaturalCollator.compare(a, b)).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">공무담당</label>
            <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)} className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:bg-white">
              <option value="전체">전체</option>
              {[...new Set(projects.map((project) => project.task_manager).filter((value): value is string => Boolean(value)))].sort((a, b) => koreanNaturalCollator.compare(a, b)).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">종료예정일</label>
            <select value={dueFilter} onChange={(e) => setDueFilter(e.target.value)} className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:bg-white">
              <option value="전체">전체</option><option value="예정">예정</option><option value="지연">지연</option><option value="미정">미정</option>
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
          <TableSkeleton rows={7} columns={9} />
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
          <table className="w-full min-w-[1440px]">
            <colgroup>
              <col className="w-[9%]" /><col className="w-[15%]" /><col className="w-[8%]" /><col className="w-[10%]" />
              <col className="w-[13%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[12%]" />
              <col className="w-[8%]" /><col className="w-[10%]" /><col className="w-[6%]" />
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
                <th className="whitespace-nowrap px-3 py-3 text-left">수량</th>
                <SortableProjectHeader
                  label="발주처"
                  sortKey="client_name"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleHeaderSort}
                />
                <th className="px-3 py-3 text-left">조립업체</th>
                <SortableProjectHeader
                  label="영업담당"
                  sortKey="salesperson"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleHeaderSort}
                />
                <SortableProjectHeader
                  label="공무담당"
                  sortKey="task_manager"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleHeaderSort}
                />
                <th className="px-3 py-3 text-left">진행률</th>
                <SortableProjectHeader
                  label="상태"
                  sortKey="status"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleHeaderSort}
                />
                <SortableProjectHeader
                  label="종료예정일"
                  sortKey="end_date"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={handleHeaderSort}
                />
                <th className="px-3 py-3 text-left">상세</th>
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
                        {canUpdate ? <button type="button" onClick={() => { setSelectedProject(project); setShowModal(true); }} className="block max-w-full truncate text-left font-semibold text-slate-950 hover:text-blue-600 hover:underline">{project.project_name}</button> : <span className="block truncate font-semibold text-slate-950">{project.project_name}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5 font-medium text-slate-700" title={formatProjectQuantity(project.quantity, project.quantity_unit)}>
                    {formatProjectQuantity(project.quantity, project.quantity_unit)}
                  </td>

                  <td className="px-3 py-3.5">{project.client_name || "-"}</td>
                  <td className="px-3 py-3.5"><div className="flex max-w-52 flex-wrap gap-1" title={project.assemblyVendors.map((vendor) => vendor.organizationName).join(", ")}>{project.assemblyVendors.slice(0, 3).map((vendor) => <span key={vendor.organizationId} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{vendor.organizationName}</span>)}{project.assemblyVendors.length > 3 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">+{project.assemblyVendors.length - 3}</span>}{project.assemblyVendors.length === 0 && "-"}</div></td>
                  <td className="px-3 py-3.5">{project.salesperson || "-"}</td>
                  <td className="px-3 py-3.5">{project.task_manager || "-"}</td>
                  <td className="px-3 py-3.5"><div className="flex min-w-[120px] items-center gap-2"><ProgressBar percent={project.progress} className="h-1.5 flex-1" /><span className="w-9 text-right text-xs font-semibold text-slate-600">{project.progress}%</span></div><p className="mt-1 text-[11px] text-slate-400">{project.completed_task_count}/{project.task_count}건</p></td>
                  <td className="px-3 py-3.5">
                    <Badge
                      variant={getStatusBadgeVariant(project.status)}
                      className="font-semibold"
                    >
                      {getProjectStatusLabel(project.status)}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-slate-500">
                    <div className="flex items-center gap-2">
                      <span>{formatDate(project.end_date || project.completion_due_date)}</span>
                      {!isProjectCompleted(project.status) && (
                        <DdayBadge targetDate={project.end_date || project.completion_due_date} />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex gap-2"><Link href={`/projects/${project.id}`} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:border-blue-200 hover:bg-blue-50">보기</Link>
                      {canDelete && (
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
                      action={canCreate ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => { setSelectedProject(null); setShowModal(true); }}
                        >
                          새 프로젝트 만들기
                        </Button>
                      ) : undefined}
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

      <ProjectDialog
        open={showModal && (selectedProject ? canUpdate : canCreate)}
        project={selectedProject}
        onClose={() => { setShowModal(false); setSelectedProject(null); }}
        onSaved={() => { setShowModal(false); setSelectedProject(null); void fetchProjects(); }}
      />
      {canCreate && <ProjectExcelUploadDialog open={showExcelUpload} onClose={() => setShowExcelUpload(false)} onCompleted={() => void fetchProjects()} />}
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
