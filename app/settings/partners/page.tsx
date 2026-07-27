"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";

type Partner = {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export default function PartnerOrganizationsPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingSortOrder, setEditingSortOrder] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadPartners = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/partner-organizations", { cache: "no-store" });
      const result = (await response.json()) as { partners?: Partner[]; error?: string };
      if (!response.ok) {
        setErrorMessage(result.error ?? "협력업체 목록을 불러오지 못했습니다.");
        return;
      }
      setPartners(result.partners ?? []);
    } catch (error) {
      console.error("partner organizations load error:", error);
      setErrorMessage("협력업체 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPartners(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPartners]);

  async function addPartner() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await fetch("/api/partner-organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), sort_order: sortOrder }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setErrorMessage(result.error ?? "협력업체를 추가하지 못했습니다.");
        return;
      }
      setName("");
      setSortOrder(0);
      setMessage("협력업체가 추가되었습니다.");
      await loadPartners();
    } finally {
      setSaving(false);
    }
  }

  async function savePartner(partner: Partner, active = partner.is_active) {
    if (!editingName.trim() || saving) return;
    setSaving(true);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await fetch("/api/partner-organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: partner.id, name: editingName.trim(), sort_order: editingSortOrder, is_active: active }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setErrorMessage(result.error ?? "협력업체를 수정하지 못했습니다.");
        return;
      }
      setEditingId(null);
      setMessage("협력업체 정보가 수정되었습니다.");
      await loadPartners();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(partner: Partner) {
    if (partner.is_active && !window.confirm(`${partner.name} 협력업체를 비활성 처리하시겠습니까?`)) {
      return;
    }
    setEditingName(partner.name);
    setEditingSortOrder(partner.sort_order);
    setSaving(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/partner-organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: partner.id, name: partner.name, sort_order: partner.sort_order, is_active: !partner.is_active }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setErrorMessage(result.error ?? "사용 여부를 변경하지 못했습니다.");
        return;
      }
      setMessage(partner.is_active ? "협력업체를 비활성화했습니다." : "협력업체를 활성화했습니다.");
      await loadPartners();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">프로젝트 조립업체 선택에 사용할 협력업체를 관리합니다.</p>
        <button type="button" onClick={() => void loadPartners()} className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><RefreshCw size={15} />새로고침</button>
      </div>

      {errorMessage && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}
      {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">협력업체 추가</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="협력업체명" className="min-w-64 flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
          <input type="number" min={0} value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} aria-label="정렬 순서" className="w-28 rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
          <button type="button" disabled={saving || !name.trim()} onClick={() => void addPartner()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-400"><Plus size={16} />추가</button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <p className="p-10 text-center text-sm text-slate-500">불러오는 중...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-100 text-slate-600"><tr><th className="px-4 py-3">순서</th><th className="px-4 py-3">협력업체명</th><th className="px-4 py-3">상태</th><th className="px-4 py-3 text-right">관리</th></tr></thead>
              <tbody>
                {partners.map((partner) => (
                  <tr key={partner.id} className="border-t border-slate-200 transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3">{editingId === partner.id ? <input type="number" min={0} value={editingSortOrder} onChange={(event) => setEditingSortOrder(Number(event.target.value))} className="w-20 rounded-lg border px-2 py-1.5" /> : partner.sort_order}</td>
                    <td className="px-4 py-3 font-medium">{editingId === partner.id ? <input value={editingName} onChange={(event) => setEditingName(event.target.value)} className="w-full rounded-lg border px-3 py-1.5" /> : partner.name}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={partner.is_active}
                        disabled={saving}
                        onClick={() => void toggleActive(partner)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${partner.is_active ? "bg-emerald-500" : "bg-slate-300"}`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${partner.is_active ? "translate-x-6" : "translate-x-1"}`} />
                        <span className="sr-only">{partner.is_active ? "활성" : "비활성"}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingId === partner.id ? <>
                        <button type="button" disabled={saving} onClick={() => void savePartner(partner)} className="mr-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">저장</button>
                        <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border px-3 py-1.5 text-xs">취소</button>
                      </> : <button type="button" onClick={() => { setEditingId(partner.id); setEditingName(partner.name); setEditingSortOrder(partner.sort_order); }} className="rounded-lg border px-3 py-1.5 text-xs">수정</button>}
                    </td>
                  </tr>
                ))}
                {partners.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">등록된 협력업체가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
