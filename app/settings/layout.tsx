"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { usePermission } from "@/hooks/usePermission";
import { canAccessRoute } from "@/lib/permissions";

const tabs = [
  { href: "/settings/maintenance", label: "시스템 점검모드", adminOnly: true },
  { href: "/settings/templates", label: "업무 템플릿 관리", adminOnly: false },
  { href: "/settings/employees", label: "직원 관리", adminOnly: false },
  { href: "/settings/partners", label: "협력업체 관리", adminOnly: false },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { role } = usePermission();

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px]">
        <header>
          <h1 className="text-3xl font-bold text-slate-900">설정</h1>
          <p className="mt-1 text-sm text-slate-500">
            시스템 운영에 필요한 기준 정보를 관리합니다.
          </p>

          <nav
            aria-label="설정 메뉴"
            className="mt-6 overflow-x-auto border-b border-slate-300"
          >
            <div className="flex min-w-max gap-6">
              {tabs.filter((tab) => (!tab.adminOnly || role === "admin") && canAccessRoute(role, tab.href)).map((tab) => {
                const active = pathname === tab.href;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={`border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${
                      active
                        ? "border-blue-600 text-blue-700"
                        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </header>

        <div className="pt-6">{children}</div>
      </div>
    </main>
  );
}
