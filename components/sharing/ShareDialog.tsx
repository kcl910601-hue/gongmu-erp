"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { PersonalNote } from "@/lib/personal-notes";
import { SHARE_PERMISSION_LABELS, type ShareEmployee, type SharePermission, type SharedItemMember, type SharingOverview } from "@/lib/sharing";
import { SHARING_CHANGED_EVENT } from "@/lib/collaboration-events";

export function ShareDialog({ note, onClose, onChanged }: { note: PersonalNote; onClose: () => void; onChanged: () => void }) {
  const [employees, setEmployees] = useState<ShareEmployee[]>([]);
  const [members, setMembers] = useState<SharedItemMember[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [permission, setPermission] = useState<SharePermission>("view");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { await fetch("/api/sharing", { cache: "no-store" }).then(async (response) => {
    const result = await response.json() as SharingOverview & { error?: string };
    if (!response.ok) setError(result.error ?? "직원 목록을 불러오지 못했습니다."); else { const itemMembers = result.members.filter((member) => member.shared_item_id === note.sharing?.sharedItemId); const excluded = new Set([...itemMembers.map((member) => member.employee_id), ...result.sent.filter((invitation) => invitation.status === "pending" && invitation.shared_item?.item_id === note.id).map((invitation) => invitation.invitee_id)]); setEmployees(result.employees.filter((employee) => !excluded.has(employee.id))); setMembers(itemMembers); }
  }); }, [note.id, note.sharing?.sharedItemId]);
  useEffect(() => {
    void load();
    window.addEventListener(SHARING_CHANGED_EVENT, load);
    return () => window.removeEventListener(SHARING_CHANGED_EVENT, load);
  }, [load]);
  const visibleEmployees = useMemo(() => { const keyword = search.trim().toLocaleLowerCase("ko-KR"); return employees.filter((employee) => !keyword || employee.name.toLocaleLowerCase("ko-KR").includes(keyword) || (employee.position ?? "").toLocaleLowerCase("ko-KR").includes(keyword)); }, [employees, search]);
  async function submit() {
    if (selected.length === 0) return;
    setSaving(true); setError("");
    for (const inviteeId of selected) {
      const response = await fetch("/api/sharing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", itemId: note.id, inviteeId, permission }) });
      if (!response.ok) { const result = await response.json() as { error?: string }; setError(result.error ?? "공유 요청을 보내지 못했습니다."); setSaving(false); return; }
    }
    setSaving(false); onChanged(); onClose();
  }
  async function updateMember(member: SharedItemMember, nextPermission?: SharePermission) {
    const action = nextPermission ? "update_permission" : "remove_member";
    const response = await fetch("/api/sharing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, sharedItemId: member.shared_item_id, employeeId: member.employee_id, permission: nextPermission }) });
    if (!response.ok) { const result = await response.json() as { error?: string }; setError(result.error ?? "참여자 정보를 변경하지 못했습니다."); return; }
    setMembers((current) => nextPermission ? current.map((item) => item.id === member.id ? { ...item, permission: nextPermission } : item) : current.filter((item) => item.id !== member.id));
    onChanged();
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-label="공유 요청">
    <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold text-slate-900">공유</h2><p className="mt-1 text-sm text-slate-500">{note.title || note.content}</p></div><button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="닫기"><X size={18}/></button></div>
      <div className="mt-4 grid grid-cols-2 gap-2">{(["view", "edit"] as const).map((value) => <button key={value} type="button" onClick={() => setPermission(value)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${permission === value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>{SHARE_PERMISSION_LABELS[value]}</button>)}</div>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="직원 검색" className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"/>
      <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">{visibleEmployees.map((employee) => <label key={employee.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50"><input type="checkbox" checked={selected.includes(employee.id)} onChange={() => setSelected((current) => current.includes(employee.id) ? current.filter((id) => id !== employee.id) : [...current, employee.id])}/><span className="text-sm font-medium text-slate-800">{employee.name}</span><span className="text-xs text-slate-400">{employee.position ?? ""}</span></label>)}</div>
      {members.length > 0 && <div className="mt-3 rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-600">현재 참여자</p><div className="mt-2 space-y-2">{members.map((member) => <div key={member.id} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{member.employee?.name ?? `직원 ${member.employee_id}`}</span><select value={member.permission} onChange={(event) => void updateMember(member, event.target.value as SharePermission)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"><option value="view">보기</option><option value="edit">편집</option></select><button type="button" onClick={() => void updateMember(member)} className="rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50">해제</button></div>)}</div></div>}
      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">취소</button><button type="button" disabled={saving || selected.length === 0} onClick={() => void submit()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">공유 요청 보내기</button></div>
    </div>
  </div>;
}
