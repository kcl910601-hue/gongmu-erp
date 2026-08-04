"use client";

import { useCallback, useEffect, useState } from "react";
import { getTimelineDescription, type SharedTimelineEntry } from "@/lib/timeline";

function formatTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function TimelineSection({ itemId }: { itemId: string }) {
  const [activities, setActivities] = useState<SharedTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const response = await fetch(`/api/timeline?itemId=${encodeURIComponent(itemId)}`, { cache: "no-store" });
    const result = await response.json() as { activities?: SharedTimelineEntry[]; error?: string };
    if (!response.ok) setError(result.error ?? "활동 이력을 불러오지 못했습니다."); else setActivities(result.activities ?? []);
    setLoading(false);
  }, [itemId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return <section className="mt-3 border-t border-slate-200/70 pt-3" onClick={(event) => event.stopPropagation()}>
    <h4 className="text-xs font-bold text-slate-700">Activity Timeline</h4>
    {loading ? <p className="py-3 text-xs text-slate-400">활동 이력을 불러오는 중...</p> : error ? <div className="mt-2 flex items-center justify-between rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600"><span>{error}</span><button type="button" onClick={() => void load()} className="font-semibold">재시도</button></div> : activities.length === 0 ? <p className="py-3 text-xs text-slate-400">기록된 활동이 없습니다.</p> : <ol className="mt-2 max-h-64 space-y-2 overflow-y-auto">{activities.map((activity) => { const description = getTimelineDescription(activity); return <li key={activity.id} className="relative ml-2 border-l border-slate-200 pb-2 pl-4 text-xs last:pb-0"><span className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-blue-500"/><div className="flex flex-wrap items-center gap-x-2"><span className="font-bold text-slate-700">{activity.employee_name ?? "시스템"}</span><span className="text-slate-600">{activity.title}</span><time className="ml-auto text-[10px] text-slate-400">{formatTime(activity.created_at)}</time></div>{description && <p className="mt-1 whitespace-pre-wrap break-words text-slate-500">{description}</p>}</li>; })}</ol>}
  </section>;
}
