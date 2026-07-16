"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  LayoutGrid,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Settings,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

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

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "true";
  });
  const [userEmail, setUserEmail] = useState<string | null>(null);
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
