"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  FileText,
  FolderKanban,
  Search,
  Star,
  User,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getProjectStatusLabel,
  getTaskStatusLabel,
  isProjectCompleted,
  isProjectInProgress,
  isTaskCompleted,
  isTaskInProgress,
} from "@/lib/status";
import { getRecentUserScope, readFavoriteProjects } from "@/lib/recent";

type ProjectSearchRow = {
  id: number;
  project_code: string | null;
  project_name: string;
  client_name: string | null;
  assembly_vendor: string | null;
  salesperson: string | null;
  site_address: string | null;
  status: string | null;
};

type TaskSearchRow = {
  id: number;
  project_id: number;
  task_name: string | null;
  task_type: string | null;
  assignee: string | null;
  status: string | null;
};

type ProjectNameRow = {
  id: number;
  project_name: string;
};

type EmployeeSearchRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  department: string | null;
  position: string | null;
};

type NoticeSearchRow = {
  id: number;
  title: string;
  description: string;
  date: string;
};

type SearchItem = {
  key: string;
  href: string;
};

type GlobalSearchProps = {
  isOpen: boolean;
  onClose: () => void;
};

const noticeRows: NoticeSearchRow[] = [
  {
    id: 1,
    title: "공지사항 기능 준비 중",
    description: "공무팀 공지와 전달사항을 이곳에서 관리할 예정입니다.",
    date: "2026-07-06",
  },
];

function getProjectVariant(status: string | null): BadgeVariant {
  if (isProjectCompleted(status)) return "success";
  if (isProjectInProgress(status)) return "info";
  return "default";
}

function getTaskVariant(status: string | null): BadgeVariant {
  if (isTaskCompleted(status)) return "success";
  if (isTaskInProgress(status)) return "info";
  return "default";
}

function getSearchFilter(query: string, columns: string[]) {
  const value = query.replace(/[,%]/g, " ").trim();
  return columns.map((column) => `${column}.ilike.%${value}%`).join(",");
}

export default function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [projects, setProjects] = useState<ProjectSearchRow[]>([]);
  const [tasks, setTasks] = useState<TaskSearchRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeSearchRow[]>([]);
  const [notices, setNotices] = useState<NoticeSearchRow[]>([]);
  const [projectNames, setProjectNames] = useState<Record<number, string>>({});
  const [favoriteProjectIds, setFavoriteProjectIds] = useState<Set<number>>(
    () => new Set()
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  const normalizedQuery = debouncedQuery.trim();
  const hasQuery = normalizedQuery.length > 0;
  const searchItems = useMemo<SearchItem[]>(() => {
    return [
      ...projects.map((project) => ({
        key: `project-${project.id}`,
        href: `/projects/${project.id}`,
      })),
      ...tasks.map((task) => ({
        key: `task-${task.id}`,
        href: `/projects/${task.project_id}`,
      })),
      ...employees.map((employee) => ({
        key: `employee-${employee.id}`,
        href: "/employees",
      })),
      ...notices.map((notice) => ({
        key: `notice-${notice.id}`,
        href: "/notices",
      })),
    ];
  }, [employees, notices, projects, tasks]);
  const hasResults = searchItems.length > 0;

  const resetSearch = useCallback(function resetSearch() {
    setQuery("");
    setDebouncedQuery("");
    setProjects([]);
    setTasks([]);
    setEmployees([]);
    setNotices([]);
    setProjectNames({});
    setSelectedIndex(0);
    setErrorMessage("");
  }, []);

  const closeSearch = useCallback(function closeSearch() {
    resetSearch();
    onClose();
  }, [onClose, resetSearch]);

  const loadFavoriteProjects = useCallback(async function loadFavoriteProjects() {
    const scope = await getRecentUserScope();
    const favoriteIds = new Set(
      readFavoriteProjects(scope).map((project) => project.project_id)
    );

    setFavoriteProjectIds(favoriteIds);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const timer = window.setTimeout(() => {
      void loadFavoriteProjects();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isOpen, loadFavoriteProjects]);

  useEffect(() => {
    if (!isOpen) return;

    function handleRecentUpdated() {
      void loadFavoriteProjects();
    }

    window.addEventListener("gongmu-recent-updated", handleRecentUpdated);

    return () => {
      window.removeEventListener("gongmu-recent-updated", handleRecentUpdated);
    };
  }, [isOpen, loadFavoriteProjects]);

  useEffect(() => {
    if (!isOpen) return;

    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [closeSearch, isOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const selectedItem = searchItems[selectedIndex];
    if (!selectedItem) return;

    itemRefs.current[selectedItem.key]?.scrollIntoView({
      block: "nearest",
    });
  }, [searchItems, selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeSearch();
      }

      if (!hasResults) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => (current + 1) % searchItems.length);
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex(
          (current) => (current - 1 + searchItems.length) % searchItems.length
        );
      }

      if (event.key === "Enter") {
        const selectedItem = searchItems[selectedIndex];
        if (!selectedItem) return;

        event.preventDefault();
        closeSearch();
        router.push(selectedItem.href);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeSearch, hasResults, isOpen, router, searchItems, selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;

    async function search() {
      if (!normalizedQuery) {
        setProjects([]);
        setTasks([]);
        setEmployees([]);
        setNotices([]);
        setProjectNames({});
        setSelectedIndex(0);
        setErrorMessage("");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      const projectFilter = getSearchFilter(normalizedQuery, [
        "project_name",
        "project_code",
        "client_name",
        "assembly_vendor",
        "salesperson",
        "site_address",
      ]);
      const taskFilter = getSearchFilter(normalizedQuery, [
        "task_name",
        "task_type",
        "assignee",
      ]);
      const employeeFilter = getSearchFilter(normalizedQuery, [
        "name",
        "email",
        "role",
        "department",
        "position",
      ]);

      const [projectResult, taskResult, employeeResult] = await Promise.all([
        supabase
          .from("projects")
          .select(
            "id, project_code, project_name, client_name, assembly_vendor, salesperson, site_address, status"
          )
          .or(projectFilter)
          .limit(5),
        supabase
          .from("tasks")
          .select("id, project_id, task_name, task_type, assignee, status")
          .or(taskFilter)
          .limit(8),
        supabase
          .from("employees")
          .select("id, name, email, role, department, position")
          .or(employeeFilter)
          .limit(5),
      ]);

      if (projectResult.error || taskResult.error || employeeResult.error) {
        setProjects([]);
        setTasks([]);
        setEmployees([]);
        setNotices([]);
        setProjectNames({});
        setErrorMessage(
          projectResult.error?.message ||
            taskResult.error?.message ||
            employeeResult.error?.message ||
            "검색 중 오류가 발생했습니다."
        );
        setIsLoading(false);
        return;
      }

      const taskRows = (taskResult.data || []) as TaskSearchRow[];
      const projectIds = Array.from(
        new Set(taskRows.map((task) => task.project_id))
      );

      let nextProjectNames: Record<number, string> = {};

      if (projectIds.length > 0) {
        const { data, error } = await supabase
          .from("projects")
          .select("id, project_name")
          .in("id", projectIds);

        if (error) {
          setErrorMessage(error.message);
        } else {
          nextProjectNames = ((data || []) as ProjectNameRow[]).reduce<
            Record<number, string>
          >((acc, project) => {
            acc[project.id] = project.project_name;
            return acc;
          }, {});
        }
      }

      setProjects((projectResult.data || []) as ProjectSearchRow[]);
      setTasks(taskRows);
      setEmployees((employeeResult.data || []) as EmployeeSearchRow[]);
      setNotices(
        noticeRows
          .filter((notice) => {
            const keyword = normalizedQuery.toLowerCase();
            return (
              notice.title.toLowerCase().includes(keyword) ||
              notice.description.toLowerCase().includes(keyword) ||
              notice.date.toLowerCase().includes(keyword)
            );
          })
          .slice(0, 5)
      );
      setProjectNames(nextProjectNames);
      setSelectedIndex(0);
      setIsLoading(false);
    }

    void search();
  }, [isOpen, normalizedQuery]);

  const helperText = useMemo(() => {
    if (!hasQuery) return "프로젝트명, 코드, 발주처, 조립처, 업무명으로 검색하세요.";
    if (isLoading) return "검색 중...";
    return `"${normalizedQuery}" 검색 결과`;
  }, [hasQuery, isLoading, normalizedQuery]);

  function getResultClass(key: string) {
    const selectedItem = searchItems[selectedIndex];
    const isSelected = selectedItem?.key === key;

    return `block rounded-2xl px-3 py-3 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-100 ${
      isSelected ? "bg-blue-50 ring-1 ring-blue-100" : "hover:bg-slate-50"
    }`;
  }

  function getResultIndex(key: string) {
    return searchItems.findIndex((item) => item.key === key);
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 px-4 py-20 backdrop-blur-sm"
      onMouseDown={closeSearch}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder="프로젝트 또는 업무 검색"
            className="h-10 min-w-0 flex-1 bg-transparent text-base font-medium text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={closeSearch}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
            aria-label="검색 닫기"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 text-sm text-slate-500">{helperText}</div>

        <div className="max-h-[60vh] overflow-y-auto px-3 pb-4">
          {errorMessage && (
            <EmptyState
              message={errorMessage}
              className="rounded-2xl bg-red-50 p-6 text-center text-sm text-red-600"
            />
          )}

          {!errorMessage && !hasQuery && (
            <EmptyState
              message="검색어를 입력하면 프로젝트와 업무가 표시됩니다."
              className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500"
            />
          )}

          {!errorMessage && hasQuery && isLoading && (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
              검색 중...
            </div>
          )}

          {!errorMessage && hasQuery && !isLoading && !hasResults && (
            <EmptyState
              message="검색 결과가 없습니다."
              className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500"
            />
          )}

          {!errorMessage && hasQuery && !isLoading && hasResults && (
            <div className="space-y-5">
              {projects.length > 0 && (
                <section>
                  <h3 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    프로젝트
                  </h3>
                  <div className="space-y-1">
                    {projects.map((project) => (
                      <Link
                        key={project.id}
                        ref={(node) => {
                          itemRefs.current[`project-${project.id}`] = node;
                        }}
                        href={`/projects/${project.id}`}
                        onClick={closeSearch}
                        onMouseEnter={() =>
                          setSelectedIndex(getResultIndex(`project-${project.id}`))
                        }
                        className={getResultClass(`project-${project.id}`)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-3">
                            <FolderKanban
                              size={18}
                              className="mt-0.5 shrink-0 text-blue-500"
                            />
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-slate-950">
                                {favoriteProjectIds.has(project.id) && (
                                  <Star
                                    size={13}
                                    className="shrink-0 fill-amber-400 text-amber-400"
                                  />
                                )}
                                <span className="truncate">
                                  {project.project_name}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-xs text-slate-500">
                                {project.project_code || "코드 없음"} ·{" "}
                                {project.assembly_vendor
                                  ? `${project.client_name || "발주처 없음"} · ${
                                      project.assembly_vendor
                                    }`
                                  : project.client_name ||
                                  project.salesperson ||
                                  "담당 정보 없음"}
                              </div>
                            </div>
                          </div>
                          <Badge
                            variant={getProjectVariant(project.status)}
                            className="shrink-0"
                          >
                            {getProjectStatusLabel(project.status)}
                          </Badge>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {tasks.length > 0 && (
                <section>
                  <h3 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    업무
                  </h3>
                  <div className="space-y-1">
                    {tasks.map((task) => (
                      <Link
                        key={task.id}
                        ref={(node) => {
                          itemRefs.current[`task-${task.id}`] = node;
                        }}
                        href={`/projects/${task.project_id}`}
                        onClick={closeSearch}
                        onMouseEnter={() =>
                          setSelectedIndex(getResultIndex(`task-${task.id}`))
                        }
                        className={getResultClass(`task-${task.id}`)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-3">
                            <BriefcaseBusiness
                              size={18}
                              className="mt-0.5 shrink-0 text-slate-500"
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-950">
                                {task.task_name || "업무명 없음"}
                              </div>
                              <div className="mt-1 truncate text-xs text-slate-500">
                                {projectNames[task.project_id] ||
                                  `프로젝트 #${task.project_id}`}{" "}
                                · {task.task_type || "업무유형 없음"} ·{" "}
                                {task.assignee || "미배정"}
                              </div>
                            </div>
                          </div>
                          <Badge
                            variant={getTaskVariant(task.status)}
                            className="shrink-0"
                          >
                            {getTaskStatusLabel(task.status)}
                          </Badge>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {employees.length > 0 && (
                <section>
                  <h3 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    직원
                  </h3>
                  <div className="space-y-1">
                    {employees.map((employee) => (
                      <Link
                        key={employee.id}
                        ref={(node) => {
                          itemRefs.current[`employee-${employee.id}`] = node;
                        }}
                        href="/employees"
                        onClick={closeSearch}
                        onMouseEnter={() =>
                          setSelectedIndex(
                            getResultIndex(`employee-${employee.id}`)
                          )
                        }
                        className={getResultClass(`employee-${employee.id}`)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-3">
                            <User
                              size={18}
                              className="mt-0.5 shrink-0 text-emerald-500"
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-950">
                                {employee.name}
                              </div>
                              <div className="mt-1 truncate text-xs text-slate-500">
                                {employee.department || "부서 없음"} ·{" "}
                                {employee.position || employee.email}
                              </div>
                            </div>
                          </div>
                          <Badge variant="default" className="shrink-0">
                            {employee.role || "직원"}
                          </Badge>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {notices.length > 0 && (
                <section>
                  <h3 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    공지
                  </h3>
                  <div className="space-y-1">
                    {notices.map((notice) => (
                      <Link
                        key={notice.id}
                        ref={(node) => {
                          itemRefs.current[`notice-${notice.id}`] = node;
                        }}
                        href="/notices"
                        onClick={closeSearch}
                        onMouseEnter={() =>
                          setSelectedIndex(getResultIndex(`notice-${notice.id}`))
                        }
                        className={getResultClass(`notice-${notice.id}`)}
                      >
                        <div className="flex items-start gap-3">
                          <FileText
                            size={18}
                            className="mt-0.5 shrink-0 text-amber-500"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-950">
                              {notice.title}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500">
                              {notice.date} · {notice.description}
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
