"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FolderKanban,
  GanttChartSquare,
  LayoutDashboard,
  Settings,
  Truck,
} from "lucide-react";

const menuItems = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/projects", label: "프로젝트 관리", icon: FolderKanban },
  { href: "/tasks", label: "업무 관리", icon: ClipboardList },
  { href: "/shipments", label: "출고 관리", icon: Truck },
  { href: "/calendar", label: "캘린더", icon: CalendarDays },
  { href: "/gantt", label: "간트차트", icon: GanttChartSquare },
  { href: "/settings", label: "설정", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside
      className={`fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-slate-800 bg-slate-950 text-white transition-all duration-300 ${
        isCollapsed ? "w-20" : "w-72"
      }`}
    >
      <button
  onClick={() => setIsCollapsed((prev) => !prev)}
  title={isCollapsed ? "메뉴 펼치기" : "메뉴 접기"}
  className="
    absolute
    -right-4
    top-24
    flex
    h-8
    w-8
    items-center
    justify-center
    rounded-full
    border
    border-slate-700
    bg-slate-900
    text-slate-300
    shadow-lg
    transition
    hover:bg-blue-600
    hover:text-white
  "
>
  {isCollapsed ? (
    <ChevronRight size={16} />
  ) : (
    <ChevronLeft size={16} />
  )}
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
        {!isCollapsed && (
          <div className="mb-4 rounded-2xl bg-slate-900 p-4">
            <p className="text-sm font-semibold">공무팀 업무관리</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              프로젝트 · 업무 · 출고 일정을 통합 관리합니다.
            </p>
          </div>
        )}

       <button
  onClick={() => {
    const next = !isCollapsed;

    setIsCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));

    window.dispatchEvent(
      new CustomEvent("sidebar-change", {
        detail: next,
      })
    );
  }}
  title={isCollapsed ? "메뉴 펼치기" : "메뉴 접기"}
  className="absolute -right-4 top-24 flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 shadow-lg transition hover:bg-blue-600 hover:text-white"
>
  {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
</button>
      </div>
    </aside>
  );
}