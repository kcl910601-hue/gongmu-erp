"use client";

import Link from "next/link";
import { Clock3, FileText, FolderKanban, ListTodo, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getRecentUserScope,
  readRecentWorkspace,
  type RecentWorkspaceItem,
} from "@/lib/recent";

const itemMeta = {
  project: { label: "프로젝트", icon: FolderKanban },
  task: { label: "업무", icon: ListTodo },
  shipment: { label: "출고", icon: Truck },
  file: { label: "파일", icon: FileText },
} as const;

function formatVisitedAt(value: string) {
  const visitedAt = new Date(value);
  const now = new Date();
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - visitedAt.getTime()) / 60_000)
  );
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  if (visitedAt.toDateString() === now.toDateString()) return "오늘";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (visitedAt.toDateString() === yesterday.toDateString()) return "어제";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  }).format(visitedAt);
}

export default function MyWorkspaceRecent() {
  const [items, setItems] = useState<RecentWorkspaceItem[]>([]);
  const lastProject = items.find((item) => item.type === "project");

  useEffect(() => {
    let isMounted = true;

    async function loadItems() {
      const scope = await getRecentUserScope();
      if (isMounted) setItems(readRecentWorkspace(scope).slice(0, 5));
    }

    function handleUpdated() {
      void loadItems();
    }

    void loadItems();
    window.addEventListener("gongmu-recent-updated", handleUpdated);
    return () => {
      isMounted = false;
      window.removeEventListener("gongmu-recent-updated", handleUpdated);
    };
  }, []);

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Clock3 size={16} className="text-blue-600" />
        <h2 className="text-sm font-bold text-slate-900">최근 작업</h2>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">최근 작업이 없습니다.</p>
      ) : (
        <>
        {lastProject && (
          <Link
            href={lastProject.href}
            className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 hover:border-blue-200"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-blue-600">
                마지막으로 열었던 프로젝트
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                {lastProject.name}
              </p>
            </div>
            <span className="shrink-0 text-[11px] text-slate-500">
              {formatVisitedAt(lastProject.visited_at)}
            </span>
          </Link>
        )}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {items
            .filter((item) => item.key !== lastProject?.key)
            .slice(0, 5)
            .map((item) => (
            <RecentItem key={item.key} item={item} />
          ))}
        </div>
        </>
      )}
    </section>
  );
}

function RecentItem({ item }: { item: RecentWorkspaceItem }) {
  const meta = itemMeta[item.type];
  const Icon = meta.icon;

  return (
    <Link
      href={item.href}
      className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 transition-colors hover:border-blue-200 hover:bg-blue-50"
    >
      <Icon size={15} className="shrink-0 text-slate-500" />
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-slate-800">
          {item.name}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-400">
          {meta.label} · {formatVisitedAt(item.visited_at)}
        </p>
      </div>
    </Link>
  );
}
