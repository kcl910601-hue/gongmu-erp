"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Clock, Plus, RefreshCw, Search } from "lucide-react";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import QuickCreate from "@/components/quick-create/QuickCreate";
import type { QuickCreateInitialView } from "@/components/quick-create/QuickCreate";
import RecentWorkspace from "@/components/recent/RecentWorkspace";
import { FocusPanelButton } from "@/components/focus/FocusPanelButton";

const pageTitles: Record<string, string> = {
  "/": "대시보드",
  "/dashboard": "DASHBOARD",
  "/calendar": "CALENDAR",
  "/board": "BOARD",
  "/projects": "PROJECTS",
  "/tasks": "업무",
  "/shipments": "출고",
  "/gantt": "간트 차트",
  "/employees": "직원관리",
  "/schedule": "일정",
  "/notices": "공지사항",
  "/notifications": "알림",
  "/settings": "설정",
};

function getPageTitle(pathname: string) {
  const matchedPath = Object.keys(pageTitles)
    .filter((path) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];

  return matchedPath ? pageTitles[matchedPath] : "공무팀 ERP";
}

type HeaderProps = {
  onSearchClick?: () => void;
};

export default function Header({ onSearchClick }: HeaderProps) {
  const pathname = usePathname();
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickCreateView, setQuickCreateView] =
    useState<QuickCreateInitialView>();
  const [contextProjectId, setContextProjectId] = useState<number | null>(null);
  const [stayOnPage, setStayOnPage] = useState(false);
  const [isRecentOpen, setIsRecentOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isQuickCreateShortcut =
        event.shiftKey &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k";

      if (!isQuickCreateShortcut) return;

      event.preventDefault();
      setQuickCreateView(undefined);
      setContextProjectId(null);
      setStayOnPage(false);
      setIsQuickCreateOpen(true);
    }

    function handleQuickCreate(
      event: Event
    ) {
      const detail = (
        event as CustomEvent<{
          view: QuickCreateInitialView;
          projectId?: number | null;
        }>
      ).detail;
      setQuickCreateView(detail.view);
      setContextProjectId(detail.projectId ?? null);
      setStayOnPage(true);
      setIsQuickCreateOpen(true);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("quick-create:open", handleQuickCreate);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("quick-create:open", handleQuickCreate);
    };
  }, []);

  return (
    <>
      <header className="relative z-40 border-b border-slate-200 bg-white/80 px-8 py-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">
              Gongmu ERP
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              {getPageTitle(pathname)}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <FocusPanelButton />
            <button
              type="button"
              aria-label="빠른 등록 열기"
              onClick={() => {
                setQuickCreateView(undefined);
                setContextProjectId(null);
                setStayOnPage(false);
                setIsQuickCreateOpen(true);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <Plus size={18} />
            </button>
            <button
              type="button"
              aria-label="최근 항목"
              onClick={() => setIsRecentOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <Clock size={18} />
            </button>
            <button
              type="button"
              aria-label={`${getPageTitle(pathname)} 새로고침`}
              title="새로고침"
              onClick={() => window.location.reload()}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <RefreshCw size={18} />
            </button>
            <NotificationCenter />
            <button
              type="button"
              onClick={onSearchClick}
              className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <Search size={16} className="text-slate-400" />
              검색
              <span className="hidden rounded-lg bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-400 sm:inline">
                Ctrl K
              </span>
            </button>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              v1.0
            </span>
          </div>
        </div>
      </header>
      <QuickCreate
        isOpen={isQuickCreateOpen}
        initialView={quickCreateView}
        contextProjectId={contextProjectId}
        stayOnPage={stayOnPage}
        onClose={() => setIsQuickCreateOpen(false)}
      />
      <RecentWorkspace
        isOpen={isRecentOpen}
        onClose={() => setIsRecentOpen(false)}
      />
    </>
  );
}
