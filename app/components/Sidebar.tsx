"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FolderKanban,
  GanttChartSquare,
  LayoutDashboard,
  LogOut,
  Settings,
  Truck,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type EmployeeProfile = {
  name: string;
  position: string | null;
  role: string | null;
  email: string | null;
};

const menuItems = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/projects", label: "프로젝트 관리", icon: FolderKanban },
  { href: "/tasks", label: "업무 관리", icon: ClipboardList },
  { href: "/shipments", label: "출고 관리", icon: Truck },
  { href: "/calendar", label: "캘린더", icon: CalendarDays },
  { href: "/gantt", label: "간트차트", icon: GanttChartSquare },
  { href: "/employees", label: "직원관리", icon: Users },
  { href: "/settings", label: "설정", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

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

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const email = session?.user?.email ?? null;

      setUserEmail(email);

      if (email) {
        await loadProfile(email);
      } else {
        setEmployeeProfile(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function toggleSidebar() {
    const next = !isCollapsed;

    setIsCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));

    window.dispatchEvent(
      new CustomEvent("sidebar-change", {
        detail: next,
      })
    );
  }

  function getRoleLabel(role: string | null) {
    if (role === "admin") return "관리자";
    if (role === "manager") return "팀장";
    if (role === "viewer") return "조회전용";
    if (role === "member") return "직원";
    return "직원";
  }

  async function handleLogout() {
    const confirmed = window.confirm("로그아웃 하시겠습니까?");

    if (!confirmed) return;

    await supabase.auth.signOut();

    window.location.href = "/login";
  }

  return (
    <aside
      className={`fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-slate-800 bg-slate-950 text-white transition-all duration-300 ${
        isCollapsed ? "w-20" : "w-72"
      }`}
    >
      <button
        onClick={toggleSidebar}
        title={isCollapsed ? "메뉴 펼치기" : "메뉴 접기"}
        className="absolute -right-4 top-24 flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 shadow-lg transition hover:bg-blue-600 hover:text-white"
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div className="border-b border-slate-800 px-4 py-6">
        <div
          className={`flex items-center ${
            isCollapsed ? "justify-center" : "justify-between"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600">
              <BarChart3 size={24} />
            </div>

            {!isCollapsed && (
              <div>
                <h1 className="text-xl font-bold">공무팀 ERP</h1>
                <p className="mt-1 text-xs text-slate-400">
                  Project Management System
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-5">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center rounded-xl px-4 py-3 text-sm font-medium transition ${
                isCollapsed ? "justify-center" : "gap-3"
              } ${
                active
                  ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon size={19} />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-4">
        {!isCollapsed ? (
          <div className="rounded-2xl bg-slate-900 p-4">
            <p className="text-sm font-semibold">
              {employeeProfile?.name || "로그인 사용자"}
            </p>

            <p className="mt-2 truncate text-xs text-slate-400">
              {employeeProfile?.position || "직책 없음"}
            </p>

            <p className="mt-1 text-xs font-semibold text-blue-400">
              {getRoleLabel(employeeProfile?.role || null)}
            </p>

            <p className="mt-3 truncate text-[11px] text-slate-500">
              {employeeProfile?.email || userEmail || "사용자 정보 없음"}
            </p>

            <button
              onClick={handleLogout}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-300 transition hover:bg-red-600 hover:text-white"
            >
              <LogOut size={15} />
              로그아웃
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            title="로그아웃"
            className="flex w-full items-center justify-center rounded-xl bg-slate-800 px-3 py-3 text-sm text-slate-300 transition hover:bg-red-600 hover:text-white"
          >
            <LogOut size={18} />
          </button>
        )}
      </div>
    </aside>
  );
}