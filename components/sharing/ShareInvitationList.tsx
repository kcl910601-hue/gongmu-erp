"use client";

import { Bell, ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NOTIFICATIONS_CHANGED_EVENT, PERSONAL_NOTES_CHANGED_EVENT, SHARING_CHANGED_EVENT } from "@/lib/collaboration-events";
import { SHARE_PERMISSION_LABELS, selectPendingReceivedInvitations, type ShareInvitation, type SharingOverview } from "@/lib/sharing";
import { toast } from "@/lib/toast";

const itemTypeLabel = { todo: "Todo", schedule: "일정", memo: "메모" } as const;

export function ShareInvitationList({ compact = false, onPendingCountChange }: { compact?: boolean; onPendingCountChange?: (count: number) => void }) {
  const [overview, setOverview] = useState<SharingOverview | null>(null);
  const [error, setError] = useState("");
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [isOpen, setIsOpen] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/sharing", { cache: "no-store" });
    const result = await response.json() as SharingOverview & { error?: string };
    if (!response.ok) { setError(result.error ?? "공유 요청을 불러오지 못했습니다."); return; }
    if (selectPendingReceivedInvitations(result).length === 0) setIsOpen(false);
    setOverview(result); setError("");
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); window.addEventListener(SHARING_CHANGED_EVENT, load); return () => { window.clearTimeout(timer); window.removeEventListener(SHARING_CHANGED_EVENT, load); }; }, [load]);
  const invitations = useMemo(() => overview ? selectPendingReceivedInvitations(overview) : [], [overview]);
  useEffect(() => { onPendingCountChange?.(invitations.length); }, [invitations.length, onPendingCountChange]);

  async function respond(invitation: ShareInvitation, action: "accept" | "reject") {
    if (pendingIds.has(invitation.id)) return;
    const previous = overview;
    setPendingIds((current) => new Set(current).add(invitation.id));
    setOverview((current) => current ? { ...current, received: current.received.filter((item) => item.id !== invitation.id) } : current);
    const response = await fetch("/api/sharing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, invitationId: invitation.id }) });
    if (!response.ok) {
      setOverview(previous);
      const result = await response.json() as { error?: string };
      if (response.status === 409) { await load(); toast.error("이미 처리된 공유 요청입니다."); }
      else toast.error(result.error ?? "공유 요청을 처리하지 못했습니다.");
    } else {
      window.dispatchEvent(new CustomEvent(SHARING_CHANGED_EVENT));
      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT));
      window.dispatchEvent(new CustomEvent(PERSONAL_NOTES_CHANGED_EVENT));
      toast.success(action === "accept" ? "공유 요청을 수락했습니다." : "공유 요청을 거절했습니다.");
    }
    setPendingIds((current) => { const next = new Set(current); next.delete(invitation.id); return next; });
  }

  if ((!overview || invitations.length === 0) && !error) return null;
  return <section className={`min-w-0 rounded-xl border border-slate-200 bg-white ${compact ? "px-3 py-2" : "px-4 py-2.5"}`}>
    <button type="button" onClick={() => setIsOpen((open) => !open)} disabled={invitations.length === 0} className="flex w-full min-w-0 items-center justify-between gap-2 text-left text-sm font-bold text-slate-700 disabled:cursor-default"><span className="flex min-w-0 items-center gap-2"><Bell size={14} className="shrink-0 text-blue-600"/><span className="truncate">받은 공유 요청 <span className="text-blue-600">{invitations.length}건</span></span></span><span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600">{isOpen ? "접기" : "보기"}{isOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</span></button>
    {error && <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">{error}</p>}
    {isOpen && <div className="mt-2 grid gap-2 md:grid-cols-2">{invitations.map((invitation) => {
      const itemType = invitation.shared_item?.item_type ?? "todo";
      const isPending = pendingIds.has(invitation.id);
      return <article key={invitation.id} className="min-w-0 rounded-xl border border-blue-100 bg-white p-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-1"><span className="max-w-full truncate text-xs font-semibold text-slate-600" title={invitation.inviter?.name ?? "직원"}>{invitation.inviter?.name ?? "직원"}</span><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{SHARE_PERMISSION_LABELS[invitation.permission]}</span></div>
        <p className="mt-2 line-clamp-2 break-words text-sm font-bold text-slate-900 [overflow-wrap:anywhere]" title={invitation.item_title ?? undefined}>{invitation.item_title || `공유 ${itemTypeLabel[itemType]}`}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-500"><span>{itemTypeLabel[itemType]}</span><span>·</span><time dateTime={invitation.created_at}>{new Date(invitation.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>
        <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={isPending} onClick={() => void respond(invitation, "accept")} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">수락</button><button type="button" disabled={isPending} onClick={() => void respond(invitation, "reject")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50">거절</button></div>
      </article>;
    })}</div>}
  </section>;
}
