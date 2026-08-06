"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { SharingOverview } from "@/lib/sharing";
import { SHARING_CHANGED_EVENT } from "@/lib/collaboration-events";

export function ShareInvitationList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState("");
  const load = useCallback(async () => { const response = await fetch("/api/sharing", { cache: "no-store" }); const result = await response.json() as SharingOverview & { error?: string }; if (!response.ok) { setError(result.error ?? "공유 요청을 불러오지 못했습니다."); return; } setPendingCount(result.received.filter((invitation) => invitation.status === "pending" && invitation.invitee_id === result.currentEmployeeId).length); setError(""); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); window.addEventListener(SHARING_CHANGED_EVENT, load); return () => { window.clearTimeout(timer); window.removeEventListener(SHARING_CHANGED_EVENT, load); }; }, [load, refreshKey]);
  return <div className="rounded-xl border border-blue-100 bg-blue-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Bell size={15} className="text-blue-600"/>공유 요청 {pendingCount}건</div><Link href="/notifications?filter=personal" className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm">알림함에서 확인</Link></div>{error && <p className="mt-2 text-xs text-red-600">{error}</p>}<p className="mt-1 text-xs text-slate-500">받은 pending 요청은 Notification Inbox에서 처리합니다.</p></div>;
}
