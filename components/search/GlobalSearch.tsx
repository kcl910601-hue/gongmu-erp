"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FolderKanban,
  History,
  ListTodo,
  Search,
  SearchX,
  Truck,
  User,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  GLOBAL_SEARCH_MAX_LENGTH,
  GLOBAL_SEARCH_MIN_LENGTH,
  RECENT_SEARCH_STORAGE_KEY,
} from "@/lib/search";
import {
  getRecentUserScope,
  hydrateFavoriteProjectsFromDatabase,
  readFavoriteProjects,
} from "@/lib/recent";
import type {
  EmployeeSearchResult,
  GlobalSearchResponse,
  ProjectSearchResult,
  ShipmentSearchResult,
  TaskSearchResult,
} from "@/types/search";

type GlobalSearchProps = {
  isOpen: boolean;
  onClose: () => void;
};

type SearchItem = {
  key: string;
  href: string;
};

const EMPTY_RESULTS: GlobalSearchResponse = {
  projects: [],
  tasks: [],
  shipments: [],
  employees: [],
};

const quickLinks = [
  { href: "/projects", label: "프로젝트" },
  { href: "/tasks", label: "업무" },
  { href: "/shipments", label: "출고" },
] as const;

function readRecentSearches() {
  try {
    const value = JSON.parse(
      localStorage.getItem(RECENT_SEARCH_STORAGE_KEY) ?? "[]"
    ) as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

export default function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const lastRequestedQuery = useRef("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResponse>(EMPTY_RESULTS);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [favoriteProjectIds, setFavoriteProjectIds] = useState<Set<number>>(
    () => new Set()
  );

  const normalizedQuery = debouncedQuery.trim();
  const canSearch = normalizedQuery.length >= GLOBAL_SEARCH_MIN_LENGTH;
  const sortedProjects = useMemo(
    () =>
      [...results.projects].sort(
        (left, right) =>
          Number(favoriteProjectIds.has(right.id)) -
          Number(favoriteProjectIds.has(left.id))
      ),
    [favoriteProjectIds, results.projects]
  );
  const searchItems = useMemo<SearchItem[]>(
    () => [
      ...sortedProjects.map((project) => ({
        key: `project-${project.id}`,
        href: `/projects/${project.id}`,
      })),
      ...results.tasks.map((task) => ({
        key: `task-${task.id}`,
        href: `/projects/${task.projectId}?task=${task.id}`,
      })),
      ...results.shipments.map((shipment) => ({
        key: `shipment-${shipment.id}`,
        href: shipment.projectId
          ? `/projects/${shipment.projectId}`
          : "/shipments",
      })),
      ...results.employees.map((employee) => ({
        key: `employee-${employee.id}`,
        href: "/employees",
      })),
    ],
    [results.employees, results.shipments, results.tasks, sortedProjects]
  );
  const hasResults = searchItems.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    let currentScope: string | null = null;

    async function loadFavorites() {
      currentScope = await getRecentUserScope();
      const favorites = await hydrateFavoriteProjectsFromDatabase(currentScope);
      if (!isMounted) return;
      setFavoriteProjectIds(
        new Set(favorites.map((project) => project.project_id))
      );
    }

    function handleFavoritesUpdated() {
      setFavoriteProjectIds(
        new Set(
          readFavoriteProjects(currentScope).map(
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
  }, [isOpen]);

  const resetSearch = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    setResults(EMPTY_RESULTS);
    setSelectedIndex(0);
    setErrorMessage("");
    setIsLoading(false);
    lastRequestedQuery.current = "";
  }, []);

  const closeSearch = useCallback(() => {
    resetSearch();
    onClose();
  }, [onClose, resetSearch]);

  const saveRecentSearch = useCallback((value: string) => {
    const normalized = value.trim();
    if (!normalized) return;

    const next = [
      normalized,
      ...readRecentSearches().filter((item) => item !== normalized),
    ].slice(0, 5);
    localStorage.setItem(RECENT_SEARCH_STORAGE_KEY, JSON.stringify(next));
    setRecentSearches(next);
  }, []);

  const openResult = useCallback(
    (item: SearchItem) => {
      saveRecentSearch(normalizedQuery);
      closeSearch();
      router.push(item.href);
    },
    [closeSearch, normalizedQuery, router, saveRecentSearch]
  );

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      setRecentSearches(readRecentSearches());
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const selectedItem = searchItems[selectedIndex];
    if (!selectedItem) return;
    itemRefs.current[selectedItem.key]?.scrollIntoView({ block: "nearest" });
  }, [searchItems, selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeSearch();
        return;
      }
      if (!hasResults) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => (current + 1) % searchItems.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex(
          (current) => (current - 1 + searchItems.length) % searchItems.length
        );
      } else if (event.key === "Enter") {
        const selectedItem = searchItems[selectedIndex];
        if (!selectedItem) return;
        event.preventDefault();
        openResult(selectedItem);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    closeSearch,
    hasResults,
    isOpen,
    openResult,
    searchItems,
    selectedIndex,
  ]);

  useEffect(() => {
    if (!isOpen) return;

    if (!canSearch) {
      const timer = window.setTimeout(() => {
        setResults(EMPTY_RESULTS);
        setSelectedIndex(0);
        setErrorMessage("");
        setIsLoading(false);
        lastRequestedQuery.current = "";
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (lastRequestedQuery.current === normalizedQuery) return;
    lastRequestedQuery.current = normalizedQuery;
    const controller = new AbortController();

    async function search() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(normalizedQuery)}`,
          { cache: "no-store", signal: controller.signal }
        );
        const data = (await response.json()) as
          | GlobalSearchResponse
          | { error?: string };

        if (!response.ok || !("projects" in data)) {
          throw new Error("검색 요청 실패");
        }

        setResults(data);
        setSelectedIndex(0);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("global search request failed", {
          path: "/api/search",
          query: normalizedQuery,
          error,
        });
        setResults(EMPTY_RESULTS);
        setErrorMessage("검색 중 오류가 발생했습니다.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void search();
    return () => controller.abort();
  }, [canSearch, isOpen, normalizedQuery]);

  function getResultClass(key: string) {
    const selectedItem = searchItems[selectedIndex];
    return `block rounded-xl px-3 py-2.5 transition-colors focus:outline-none ${
      selectedItem?.key === key
        ? "bg-blue-50 ring-1 ring-blue-100"
        : "hover:bg-slate-50"
    }`;
  }

  function getResultIndex(key: string) {
    return searchItems.findIndex((item) => item.key === key);
  }

  function resultProps(key: string, href: string) {
    return {
      ref: (node: HTMLAnchorElement | null) => {
        itemRefs.current[key] = node;
      },
      href,
      className: getResultClass(key),
      onMouseEnter: () => setSelectedIndex(getResultIndex(key)),
      onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        openResult({ key, href });
      },
    };
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 px-4 py-20 backdrop-blur-sm"
      onMouseDown={closeSearch}
    >
      <div
        className="w-full max-w-[640px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            maxLength={GLOBAL_SEARCH_MAX_LENGTH}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder="프로젝트, 업무, 출고 또는 직원 검색"
            className="h-10 min-w-0 flex-1 bg-transparent text-base font-medium text-slate-900 outline-none placeholder:text-slate-400"
          />
          <span className="hidden text-xs text-slate-400 sm:inline">ESC</span>
          <button
            type="button"
            onClick={closeSearch}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
            aria-label="검색 닫기"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-3">
          {!query.trim() && (
            <div className="space-y-4">
              {recentSearches.length > 0 && (
                <section>
                  <h3 className="px-2 pb-2 text-xs font-semibold text-slate-400">
                    최근 검색어
                  </h3>
                  <div className="flex flex-wrap gap-2 px-2">
                    {recentSearches.map((recent) => (
                      <button
                        key={recent}
                        type="button"
                        onClick={() => setQuery(recent)}
                        className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200"
                      >
                        <History size={13} />
                        {recent}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <section>
                <h3 className="px-2 pb-2 text-xs font-semibold text-slate-400">
                  빠른 이동
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {quickLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeSearch}
                      className="rounded-xl bg-slate-50 px-3 py-3 text-center text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          )}

          {query.trim().length > 0 &&
            query.trim().length < GLOBAL_SEARCH_MIN_LENGTH && (
              <p className="p-8 text-center text-sm text-slate-500">
                검색어를 2글자 이상 입력해주세요.
              </p>
            )}

          {errorMessage && (
            <p className="rounded-xl bg-red-50 p-6 text-center text-sm text-red-600">
              {errorMessage}
            </p>
          )}

          {canSearch && isLoading && (
            <p className="p-8 text-center text-sm text-slate-500">검색 중...</p>
          )}

          {canSearch && !isLoading && !errorMessage && !hasResults && (
            <div className="flex flex-col items-center p-8 text-center">
              <SearchX size={28} className="text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700">
                검색 결과가 없습니다.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                프로젝트명, 코드, 업무명 또는 담당자명을 확인해주세요.
              </p>
            </div>
          )}

          {canSearch && !isLoading && !errorMessage && hasResults && (
            <div className="space-y-4">
              <ResultGroup title="프로젝트" count={results.projects.length}>
                {sortedProjects.map((project) => (
                  <ProjectResult
                    key={project.id}
                    project={project}
                    linkProps={resultProps(
                      `project-${project.id}`,
                      `/projects/${project.id}`
                    )}
                  />
                ))}
              </ResultGroup>
              <ResultGroup title="업무" count={results.tasks.length}>
                {results.tasks.map((task) => (
                  <TaskResult
                    key={task.id}
                    task={task}
                    linkProps={resultProps(
                      `task-${task.id}`,
                      `/projects/${task.projectId}?task=${task.id}`
                    )}
                  />
                ))}
              </ResultGroup>
              <ResultGroup title="출고" count={results.shipments.length}>
                {results.shipments.map((shipment) => {
                  const href = shipment.projectId
                    ? `/projects/${shipment.projectId}`
                    : "/shipments";
                  return (
                    <ShipmentResult
                      key={shipment.id}
                      shipment={shipment}
                      linkProps={resultProps(`shipment-${shipment.id}`, href)}
                    />
                  );
                })}
              </ResultGroup>
              <ResultGroup title="직원" count={results.employees.length}>
                {results.employees.map((employee) => (
                  <EmployeeResult
                    key={employee.id}
                    employee={employee}
                    linkProps={resultProps(`employee-${employee.id}`, "/employees")}
                  />
                ))}
              </ResultGroup>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type LinkProps = {
  href: string;
  className: string;
  ref: (node: HTMLAnchorElement | null) => void;
  onMouseEnter: () => void;
  onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
};

function ResultGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section>
      <h3 className="px-2 pb-1.5 text-xs font-semibold text-slate-400">
        {title} {count}건
      </h3>
      <div>{children}</div>
    </section>
  );
}

function ProjectResult({
  project,
  linkProps,
}: {
  project: ProjectSearchResult;
  linkProps: LinkProps;
}) {
  return (
    <Link {...linkProps}>
      <div className="flex items-start gap-3">
        <FolderKanban size={17} className="mt-0.5 shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {project.projectName}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {project.projectCode || "코드 없음"} · {project.processType} ·{" "}
            {project.taskManager || "담당자 없음"}
          </p>
        </div>
        <Badge variant="default">{project.status || "상태 없음"}</Badge>
      </div>
    </Link>
  );
}

function TaskResult({ task, linkProps }: { task: TaskSearchResult; linkProps: LinkProps }) {
  return (
    <Link {...linkProps}>
      <div className="flex items-start gap-3">
        <ListTodo size={17} className="mt-0.5 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {task.taskName || "업무명 없음"}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {task.projectName} · {task.assignee || "미배정"} ·{" "}
            {task.dueDate || "마감일 없음"}
          </p>
        </div>
        <Badge variant="default">{task.status || "상태 없음"}</Badge>
      </div>
    </Link>
  );
}

function ShipmentResult({
  shipment,
  linkProps,
}: {
  shipment: ShipmentSearchResult;
  linkProps: LinkProps;
}) {
  return (
    <Link {...linkProps}>
      <div className="flex items-start gap-3">
        <Truck size={17} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {shipment.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {shipment.projectName || "프로젝트 없음"} ·{" "}
            {shipment.shipmentDate || "예정일 없음"} ·{" "}
            {shipment.assignee || "담당자 없음"}
          </p>
        </div>
        <Badge variant="default">{shipment.status || "상태 없음"}</Badge>
      </div>
    </Link>
  );
}

function EmployeeResult({
  employee,
  linkProps,
}: {
  employee: EmployeeSearchResult;
  linkProps: LinkProps;
}) {
  return (
    <Link {...linkProps}>
      <div className="flex items-start gap-3">
        <User size={17} className="mt-0.5 shrink-0 text-sky-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {employee.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {employee.position || "직책 없음"} · {employee.role || "권한 없음"}
          </p>
        </div>
        <Badge variant={employee.active === false ? "default" : "success"}>
          {employee.active === false ? "비활성" : "활성"}
        </Badge>
      </div>
    </Link>
  );
}
