"use client";

import { useCallback, useEffect, useState } from "react";
import { SHARE_INVITATION_STATUS_LABELS, SHARE_PERMISSION_LABELS, type ShareInvitation, type SharingOverview } from "@/lib/sharing";
import { dispatchPersonalNotesChanged } from "@/lib/personal-notes";

export function ShareInvitationList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [overview, setOverview] = useState<SharingOverview | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => { const response = await fetch("/api/sharing", { cache: "no-store" }); const result = await response.json() as SharingOverview & { error?: string }; if (!response.ok) setError(result.error ?? "공유 요청을 불러오지 못했습니다."); else { setOverview(result); setError(""); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, refreshKey]);
  async function act(action: string, invitation: ShareInvitation) { const response = await fetch("/api/sharing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, invitationId: invitation.id }) }); if (!response.ok) { const result = await response.json() as { error?: string }; setError(result.error ?? "공유 요청을 처리하지 못했습니다."); return; } await load(); dispatchPersonalNotesChanged(); }
  if (!overview || (overview.received.length === 0 && overview.sent.length === 0)) return error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null;
  return <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><h3 className="text-xs font-bold text-slate-700">공유 요청</h3>{error && <p className="mt-2 text-xs text-red-600">{error}</p>}<div className="mt-2 grid gap-3 xl:grid-cols-2"><InvitationGroup title="받은 요청" items={overview.received} currentEmployeeId={overview.currentEmployeeId} onAction={act}/><InvitationGroup title="보낸 요청" items={overview.sent} currentEmployeeId={overview.currentEmployeeId} onAction={act}/></div></div>;
}

function InvitationGroup({ title, items, currentEmployeeId, onAction }: { title: string; items: ShareInvitation[]; currentEmployeeId: number; onAction: (action: string, invitation: ShareInvitation) => Promise<void> }) {
  return <div><p className="text-xs font-semibold text-slate-500">{title} ({items.length})</p><div className="mt-1 space-y-1">{items.slice(0, 5).map((invitation) => <article key={invitation.id} className="rounded-xl bg-white p-2.5 text-xs"><div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-800">{invitation.shared_item?.item_type.toUpperCase() ?? "공유 항목"}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{SHARE_INVITATION_STATUS_LABELS[invitation.status]}</span></div><p className="mt-1 text-slate-500">{invitation.inviter_id === currentEmployeeId ? invitation.invitee?.name : invitation.inviter?.name} · {SHARE_PERMISSION_LABELS[invitation.permission]}</p>{invitation.status === "pending" && <div className="mt-2 flex gap-1">{invitation.invitee_id === currentEmployeeId ? <><button type="button" onClick={() => void onAction("accept", invitation)} className="rounded-lg bg-blue-600 px-2 py-1 font-semibold text-white">수락</button><button type="button" onClick={() => void onAction("reject", invitation)} className="rounded-lg border border-slate-200 px-2 py-1">거절</button></> : <button type="button" onClick={() => void onAction("cancel", invitation)} className="rounded-lg border border-slate-200 px-2 py-1">요청 취소</button>}</div>}</article>)}</div></div>;
}
