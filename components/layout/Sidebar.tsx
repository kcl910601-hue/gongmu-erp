"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  FolderKanban,
  LayoutGrid,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Megaphone,
  Settings,
  Star,
  Clock3,
  Truck,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  getRecentUserScope,
  hydrateFavoriteProjectsFromDatabase,
  readRecentWorkspace,
  removeFavoriteProject,
  removeRecentWorkspaceItem,
  type FavoriteProject,
  type RecentWorkspaceItem,
} from "@/lib/recent";

type EmployeeProfile = {
  name: string;
  position: string | null;
  role: string | null;
  email: string | null;
};

type MenuItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

const menuItems: MenuItem[] = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/board", label: "Project Board", icon: LayoutGrid },
  { href: "/projects", label: "프로젝트", icon: FolderKanban },
  { href: "/employees", label: "직원관리", icon: Users, adminOnly: true },
  { href: "/notices", label: "공지사항", icon: Megaphone },
  { href: "/settings", label: "설정", icon: Settings, adminOnly: true },
];

function getRoleLabel(role: string | null) {
  if (role === "admin") return "관리자";
  if (role === "manager") return "매니저";
  if (role === "sales") return "영업";
  if (role === "viewer") return "조회전용";
  return "직원";
}

function formatRecentProjectTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  const diffMinutes = Math.max(
    0,
    Math.floor((today.getTime() - date.getTime()) / 60_000)
  );
  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (isToday) return "오늘";

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return "어제";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "true";
  });
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [recentUserScope, setRecentUserScope] = useState<string | null>(null);
  const [favoriteProjects, setFavoriteProjects] = useState<FavoriteProject[]>([]);
  const [recentItems, setRecentItems] = useState<RecentWorkspaceItem[]>([]);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [favoriteDueCounts, setFavoriteDueCounts] = useState<
    Record<number, number>
  >({});
  const [employeeProfile, setEmployeeProfile] =
    useState<EmployeeProfile | null>(null);

  useEffect(() => {
    async function loadProfile(email: string) {
      const { data, error } = await supabase
        .from("employees")
        .select("name, position, role, email")
        .eq("email", email)
        .maybeSingle();

      if (error || !data) {
        setEmployeeProfile(null);
        return;
      }

      setEmployeeProfile(data);
    }

    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const email = session?.user?.email ?? null;
      setUserEmail(email);

      if (email) {
        await loadProfile(email);
      } else {
        setEmployeeProfile(null);
      }
    }

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user?.email ?? null;
      setUserEmail(email);

      if (email) {
        void loadProfile(email);
      } else {
        setEmployeeProfile(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadWorkspaceLinks() {
      const scope = await getRecentUserScope();
      if (!isMounted) return;

      setRecentUserScope(scope);
      const favorites = (
        await hydrateFavoriteProjectsFromDatabase(scope)
      ).slice(0, 10);
      setFavoriteProjects(favorites);
      setRecentItems(readRecentWorkspace(scope).slice(0, 15));

      const projectIds = favorites.map((project) => project.project_id);
      if (projectIds.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const { data } = await supabase
          .from("tasks")
          .select("project_id, status")
          .in("project_id", projectIds)
          .eq("due_date", today);
        if (!isMounted) return;

        const counts = (data ?? []).reduce<Record<number, number>>(
          (result, task) => {
            if (task.status === "completed" || task.status === "완료") {
              return result;
            }
            result[task.project_id] = (result[task.project_id] ?? 0) + 1;
            return result;
          },
          {}
        );
        setFavoriteDueCounts(counts);
      } else {
        setFavoriteDueCounts({});
      }
    }

    function handleWorkspaceUpdated() {
      void loadWorkspaceLinks();
    }

    void loadWorkspaceLinks();
    window.addEventListener("gongmu-recent-updated", handleWorkspaceUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener(
        "gongmu-recent-updated",
        handleWorkspaceUpdated
      );
    };
  }, []);

  function isActive(href: string) {
    if (href === "/dashboard") {
      return pathname === "/" || pathname.startsWith("/dashboard");
    }

    return pathname.startsWith(href);
  }

  function toggleSidebar() {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
    window.dispatchEvent(new CustomEvent("sidebar-change", { detail: next }));
  }

  async function handleLogout() {
    const confirmed = window.confirm("로그아웃 하시겠습니까?");

    if (!confirmed) return;

    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <aside
      className={`fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-slate-200 bg-white text-slate-900 shadow-sm transition-all duration-300 ${
        isCollapsed ? "w-16" : "w-64"
      }`}
    >
      <button
        onClick={toggleSidebar}
        title={isCollapsed ? "메뉴 펼치기" : "메뉴 접기"}
        className="absolute -right-4 top-24 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div className="border-b border-slate-200 px-4 py-6">
        <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-3"}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
            <BarChart3 size={24} />
          </div>

          {!isCollapsed && (
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-950">
                공무팀 ERP
              </h1>
              <p className="mt-1 text-xs font-medium text-slate-500">
                v1.0 Workspace
              </p>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-1.5 px-3 py-5">
        {menuItems
          .filter((item) => !item.adminOnly || employeeProfile?.role === "admin")
          .map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-200 ${
                isCollapsed ? "justify-center" : "gap-3"
              } ${
                active
                  ? "border border-slate-200 bg-slate-950 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              <Icon size={18} className="shrink-0" />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!isCollapsed && (
        <div className="border-t border-slate-100 px-3 py-3">
          <button
            type="button"
            onClick={() => setIsWorkspaceOpen((current) => !current)}
            className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
            aria-expanded={isWorkspaceOpen}
          >
            <span className="flex items-center gap-2">
              <Star size={14} className="fill-amber-400 text-amber-500" />내 작업공간
            </span>
            <ChevronDown
              size={14}
              className={`transition-transform ${isWorkspaceOpen ? "rotate-180" : ""}`}
            />
          </button>
          {isWorkspaceOpen && (
            <div className="mt-3 max-h-[330px] space-y-4 overflow-y-auto">
              <SidebarProjectGroup
                title="즐겨찾기"
                icon={<Star size={14} className="fill-amber-400 text-amber-500" />}
                emptyMessage="즐겨찾기가 없습니다."
                projects={favoriteProjects}
                dueCounts={favoriteDueCounts}
                onRemove={(projectId) =>
                  removeFavoriteProject(recentUserScope, projectId)
                }
              />
              <SidebarRecentGroup
                items={recentItems}
                onRemove={(key) =>
                  removeRecentWorkspaceItem(recentUserScope, key)
                }
              />
            </div>
          )}
        </div>
      )}

      <div className="border-t border-slate-200 p-3">
        {!isCollapsed ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="truncate text-sm font-semibold text-slate-950">
              {employeeProfile?.name || "로그인 사용자"}
            </p>
            <p className="mt-2 truncate text-xs text-slate-500">
              {employeeProfile?.position || "직책 없음"}
            </p>
            <p className="mt-1 text-xs font-semibold text-blue-600">
              {getRoleLabel(employeeProfile?.role || null)}
            </p>
            <p className="mt-3 truncate text-[11px] text-slate-400">
              {employeeProfile?.email || userEmail || "사용자 정보 없음"}
            </p>
            <button
              onClick={handleLogout}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <LogOut size={15} />
              로그아웃
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            title="로그아웃"
            className="flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={18} />
          </button>
        )}
      </div>
    </aside>
  );
}

function SidebarProjectGroup({
  title,
  icon,
  emptyMessage,
  projects,
  dueCounts,
  onRemove,
}: {
  title: string;
  icon: ReactNode;
  emptyMessage: string;
  projects: FavoriteProject[];
  dueCounts: Record<number, number>;
  onRemove: (projectId: number) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        {icon}
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {title}
        </h2>
      </div>
      {projects.length === 0 ? (
        <p className="px-2 py-1 text-[11px] text-slate-400">{emptyMessage}</p>
      ) : (
        <div className="space-y-0.5">
          {projects.map((project) => (
            <div
              key={project.project_id}
              className="group relative rounded-xl transition-colors hover:bg-slate-100"
            >
              <Link
                href={`/projects/${project.project_id}`}
                className="flex items-center gap-2 px-2 py-1.5 pr-8"
              >
                <FolderKanban size={14} className="shrink-0 text-blue-500" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
                  {project.project_name}
                </span>
                {(dueCounts[project.project_id] ?? 0) > 0 && (
                  <span className="shrink-0 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {dueCounts[project.project_id]}
                  </span>
                )}
              </Link>
              <button
                type="button"
                onClick={() => onRemove(project.project_id)}
                title="즐겨찾기 해제"
                aria-label={`${project.project_name} 즐겨찾기 해제`}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 opacity-0 hover:bg-white hover:text-red-500 group-hover:opacity-100 focus:opacity-100"
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SidebarRecentGroup({
  items,
  onRemove,
}: {
  items: RecentWorkspaceItem[];
  onRemove: (key: string) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <Clock3 size={14} className="text-slate-400" />
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          최근 작업
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="px-2 py-1 text-[11px] text-slate-400">
          최근 작업이 없습니다.
        </p>
      ) : (
        <div className="space-y-0.5">
          {items.map((item) => {
            const Icon =
              item.type === "project"
                ? FolderKanban
                : item.type === "task"
                  ? ClipboardList
                  : item.type === "shipment"
                    ? Truck
                    : FileText;

            return (
              <div
                key={item.key}
                className="group relative rounded-xl transition-colors hover:bg-slate-100"
              >
                <Link
                  href={item.href}
                  className="flex items-center gap-2 px-2 py-1.5 pr-8"
                >
                  <Icon size={14} className="shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-slate-700">
                      {item.name}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-slate-400">
                      {formatRecentProjectTime(item.visited_at)}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => onRemove(item.key)}
                  title="최근 목록 삭제"
                  aria-label={`${item.name} 최근 목록 삭제`}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 opacity-0 hover:bg-white hover:text-red-500 group-hover:opacity-100 focus:opacity-100"
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
