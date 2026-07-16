"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, FolderOpen, Star, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  clearFavoriteProjects,
  clearRecentProjects,
  clearRecentTasks,
  getRecentUserScope,
  readFavoriteProjects,
  readRecentProjects,
  readRecentTasks,
  removeFavoriteProject,
  removeRecentProject,
  removeRecentTask,
  type FavoriteProject,
  type RecentProject,
  type RecentTask,
} from "@/lib/recent";
import { getProjectStatusLabel, getTaskStatusLabel } from "@/lib/status";

type RecentWorkspaceProps = {
  isOpen: boolean;
  onClose: () => void;
};

type RecentTab = "favorites" | "projects" | "tasks";

export default function RecentWorkspace({
  isOpen,
  onClose,
}: RecentWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<RecentTab>("favorites");
  const [userScope, setUserScope] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<FavoriteProject[]>([]);
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [tasks, setTasks] = useState<RecentTask[]>([]);

  const loadRecentItems = useCallback((scope: string | null) => {
    setFavorites(readFavoriteProjects(scope));
    setProjects(readRecentProjects(scope));
    setTasks(readRecentTasks(scope));
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    async function loadUserScope() {
      const scope = await getRecentUserScope();

      if (!isMounted) return;

      setUserScope(scope);
      loadRecentItems(scope);
    }

    void loadUserScope();

    return () => {
      isMounted = false;
    };
  }, [isOpen, loadRecentItems]);

  useEffect(() => {
    if (!isOpen) return;

    function handleRecentUpdated() {
      loadRecentItems(userScope);
    }

    window.addEventListener("gongmu-recent-updated", handleRecentUpdated);
    window.addEventListener("storage", handleRecentUpdated);

    return () => {
      window.removeEventListener("gongmu-recent-updated", handleRecentUpdated);
      window.removeEventListener("storage", handleRecentUpdated);
    };
  }, [isOpen, loadRecentItems, userScope]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  function openProject(projectId: number) {
    onClose();
    router.push(`/projects/${projectId}`);
  }

  function deleteProject(projectId: number) {
    removeRecentProject(userScope, projectId);
    loadRecentItems(userScope);
  }

  function deleteFavorite(projectId: number) {
    removeFavoriteProject(userScope, projectId);
    loadRecentItems(userScope);
  }

  function deleteTask(taskId: number) {
    removeRecentTask(userScope, taskId);
    loadRecentItems(userScope);
  }

  function clearCurrentTab() {
    const confirmed = window.confirm("최근 기록을 모두 삭제할까요?");

    if (!confirmed) return;

    if (activeTab === "favorites") {
      clearFavoriteProjects(userScope);
    } else if (activeTab === "projects") {
      clearRecentProjects(userScope);
    } else {
      clearRecentTasks(userScope);
    }

    loadRecentItems(userScope);
  }

  if (!isOpen) return null;

  const hasItems =
    activeTab === "favorites"
      ? favorites.length > 0
      : activeTab === "projects"
        ? projects.length > 0
        : tasks.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/20"
      onMouseDown={onClose}
    >
      <aside
        className="ml-auto flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Recent Workspace
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                최근 항목
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="최근 항목 닫기"
            >
              <X size={16} />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 rounded-2xl bg-slate-100 p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("favorites")}
              className={`rounded-xl px-3 py-2 ${
                activeTab === "favorites"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              즐겨찾기
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("projects")}
              className={`rounded-xl px-3 py-2 ${
                activeTab === "projects"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              최근 프로젝트
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("tasks")}
              className={`rounded-xl px-3 py-2 ${
                activeTab === "tasks"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              최근 업무
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "favorites" && (
            <div className="space-y-2">
              {favorites.length === 0 ? (
                <EmptyState
                  title="즐겨찾기한 프로젝트가 없습니다. 자주 확인하는 프로젝트를 별표로 고정해보세요."
                  className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500"
                />
              ) : (
                favorites.map((project) => (
                  <article
                    key={project.project_id}
                    className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => openProject(project.project_id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Star
                            size={15}
                            className="shrink-0 fill-amber-400 text-amber-400"
                          />
                          <h3 className="truncate text-sm font-bold text-slate-900">
                            {project.project_name}
                          </h3>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {project.project_code || "코드 없음"} · 조립처{" "}
                          {project.assembly_vendor || "-"}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="info" className="px-2 py-0.5">
                            {getProjectStatusLabel(project.status)}
                          </Badge>
                          <span className="truncate text-xs text-slate-400">
                            {formatRecentTime(project.favorited_at)}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteFavorite(project.project_id)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-amber-400 hover:bg-amber-50 hover:text-amber-500"
                        aria-label="즐겨찾기 해제"
                      >
                        <Star size={14} className="fill-current" />
                      </button>
                    </div>
                  </article>
                ))
              )}
              {!userScope && (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  로그인 사용자 정보를 확인할 수 없어 즐겨찾기를 사용할 수 없습니다.
                </p>
              )}
            </div>
          )}

          {activeTab === "projects" && (
            <div className="space-y-2">
              {projects.length === 0 ? (
                <EmptyState
                  title="최근 본 프로젝트가 없습니다."
                  className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500"
                />
              ) : (
                projects.map((project) => (
                  <article
                    key={project.project_id}
                    className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => openProject(project.project_id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <FolderOpen
                            size={15}
                            className="shrink-0 text-blue-500"
                          />
                          <h3 className="truncate text-sm font-bold text-slate-900">
                            {project.project_name}
                          </h3>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {project.project_code || "코드 없음"} · 조립처{" "}
                          {project.assembly_vendor || "-"}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="info" className="px-2 py-0.5">
                            {getProjectStatusLabel(project.status)}
                          </Badge>
                          <span className="truncate text-xs text-slate-400">
                            {formatRecentTime(project.visited_at)}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProject(project.project_id)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-red-500"
                        aria-label="최근 프로젝트 삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}

          {activeTab === "tasks" && (
            <div className="space-y-2">
              {tasks.length === 0 ? (
                <EmptyState
                  title="최근 수정한 업무가 없습니다."
                  className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500"
                />
              ) : (
                tasks.map((task) => (
                  <article
                    key={task.task_id}
                    className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => openProject(task.project_id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Clock
                            size={15}
                            className="shrink-0 text-emerald-500"
                          />
                          <h3 className="truncate text-sm font-bold text-slate-900">
                            {task.task_name || "업무"}
                          </h3>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {task.task_type || "유형 없음"} · {task.project_name}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          담당 {task.assignee || "미배정"} · 마감{" "}
                          {task.due_date || "-"}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="default" className="px-2 py-0.5">
                            {getTaskStatusLabel(task.status)}
                          </Badge>
                          <span className="truncate text-xs text-slate-400">
                            {formatRecentTime(task.updated_at)}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTask(task.task_id)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-red-500"
                        aria-label="최근 업무 삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 p-4">
          <button
            type="button"
            disabled={!hasItems}
            onClick={clearCurrentTab}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            최근 기록 전체 삭제
          </button>
        </div>
      </aside>
    </div>
  );
}

function formatRecentTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return `오늘 ${formatTime(date)}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === yesterday.toDateString()) {
    return `어제 ${formatTime(date)}`;
  }

  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}
