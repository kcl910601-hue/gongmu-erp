"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { usePermission } from "@/hooks/usePermission";
import type { SettingsItemActionResult } from "@/lib/settings-deletion";
import { toast } from "@/lib/toast";
import { PARTNER_TYPE_LABELS, PARTNER_TYPES, type PartnerType } from "@/lib/partners";
import { EditingLockNotice } from "@/components/editing/EditingLockNotice";
import { useEditingLock } from "@/hooks/useEditingLock";
import { withShortEditingLock } from "@/lib/editing-locks";

type Partner = {
  id: number;
  name: string;
  partner_type: PartnerType;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  memo: string | null;
};

export default function PartnerOrganizationsPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [memo, setMemo] = useState("");
  const [partnerType, setPartnerType] = useState<PartnerType>("assembly");
  const [typeFilter, setTypeFilter] = useState<PartnerType | "all">("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingSortOrder, setEditingSortOrder] = useState(0);
  const [editingMemo, setEditingMemo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Partner | null>(null);
  const [deletePlan, setDeletePlan] = useState<SettingsItemActionResult | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { role } = usePermission();
  const canDelete = role === "admin";
  const editingLock = useEditingLock("setting", editingId === null ? null : `partner:${editingId}`, editingId !== null);
  const visiblePartners = useMemo(
    () => partners.filter((partner) => (showInactive || partner.is_active) && (typeFilter === "all" || partner.partner_type === typeFilter)),
    [partners, showInactive, typeFilter]
  );

  const loadPartners = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/partner-organizations", { cache: "no-store" });
      const result = (await response.json()) as { partners?: Partner[]; error?: string };
      if (!response.ok) {
        setErrorMessage(result.error ?? "업체 목록을 불러오지 못했습니다.");
        return;
      }
      setPartners(result.partners ?? []);
    } catch (error) {
      console.error("partner organizations load error:", error);
      setErrorMessage("업체 목록을 불러오지 못했습니다.");
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
        body: JSON.stringify({ name: name.trim(), partner_type: partnerType, sort_order: sortOrder, memo }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setErrorMessage(result.error ?? "업체를 추가하지 못했습니다.");
        return;
      }
      setName("");
      setSortOrder(0);
      setMemo("");
      setMessage("업체가 추가되었습니다.");
      await loadPartners();
    } finally {
      setSaving(false);
    }
  }

  async function savePartner(partner: Partner, active = partner.is_active) {
    if (!editingName.trim() || saving || !editingLock.canEdit) return;
    setSaving(true);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await fetch("/api/partner-organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: partner.id, name: editingName.trim(), partner_type: partner.partner_type, sort_order: editingSortOrder, is_active: active, memo: editingMemo }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setErrorMessage(result.error ?? "업체를 수정하지 못했습니다.");
        return;
      }
      setEditingId(null);
      setMessage("업체 정보가 수정되었습니다.");
      await loadPartners();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(partner: Partner) {
    if (partner.is_active && !window.confirm(`${partner.name} 업체를 비활성 처리하시겠습니까?`)) {
      return;
    }
    setEditingName(partner.name);
    setEditingSortOrder(partner.sort_order);
    setSaving(true);
    setErrorMessage("");
    try {
      await withShortEditingLock("setting", `partner:${partner.id}`, async () => {
        const response = await fetch("/api/partner-organizations", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: partner.id, name: partner.name, partner_type: partner.partner_type, sort_order: partner.sort_order, is_active: !partner.is_active, memo: partner.memo }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "사용 여부를 변경하지 못했습니다.");
      });
      setMessage(partner.is_active ? "업체를 비활성화했습니다." : "업체를 활성화했습니다.");
      await loadPartners();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "사용 여부를 변경하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function requestDelete(partner: Partner, execute: boolean) {
    const response = await fetch("/api/partner-organizations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: partner.id, execute }),
    });
    const result = (await response.json()) as Partial<SettingsItemActionResult> & { error?: string };
    if (!response.ok) throw new Error(result.error || "업체 삭제 요청에 실패했습니다.");
    if (typeof result.success !== "boolean" || !result.action) {
      throw new Error("업체 삭제 결과가 올바르지 않습니다.");
    }
    return {
      success: result.success,
      action: result.action,
      message: result.message || "업체를 처리했습니다.",
      referenceCount: result.referenceCount || 0,
    } satisfies SettingsItemActionResult;
  }

  async function prepareDelete(partner: Partner) {
    if (!canDelete || deleting) return;
    setDeleting(true);
    try {
      const result = await requestDelete(partner, false);
      if (!result.success || result.action === "blocked") {
        toast.error(result.message);
        return;
      }
      setDeleteTarget(partner);
      setDeletePlan(result);
    } catch (error) {
      console.error("partner delete inspection error:", error);
      toast.error("삭제하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setDeleting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !deletePlan || deleting) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      const result = await requestDelete(target, true);
      if (!result.success || result.action === "blocked") {
        toast.error(result.message);
        return;
      }
      if (result.action === "deleted") {
        setPartners((current) => current.filter((partner) => partner.id !== target.id));
        toast.success(`"${target.name}"이 삭제되었습니다.`);
      } else {
        setPartners((current) => current.map((partner) => partner.id === target.id ? { ...partner, is_active: false } : partner));
        toast.success(`"${target.name}"이 기존 기록에 사용 중이어서 비활성화되었습니다.`);
      }
      setDeleteTarget(null);
      setDeletePlan(null);
    } catch (error) {
      console.error("partner delete error:", error);
      toast.error("삭제하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">조립업체, AL업체, 도장업체와 유리업체를 관리합니다.</p>
        <div className="flex flex-wrap items-center gap-3">
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as PartnerType | "all")} className="rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="all">전체 타입</option>{PARTNER_TYPES.map((type) => <option key={type} value={type}>{PARTNER_TYPE_LABELS[type]}</option>)}</select>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />비활성 포함</label>
          <button type="button" onClick={() => void loadPartners()} className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><RefreshCw size={15} />새로고침</button>
        </div>
      </div>

      {errorMessage && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}
      {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      {editingId !== null && <EditingLockNotice state={editingLock.state} lock={editingLock.lock} error={editingLock.error}/>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">업체 추가</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="업체명" className="min-w-64 flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
          <select value={partnerType} onChange={(event) => setPartnerType(event.target.value as PartnerType)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm">{PARTNER_TYPES.map((type) => <option key={type} value={type}>{PARTNER_TYPE_LABELS[type]}</option>)}</select>
          <input type="number" min={0} value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} aria-label="정렬 순서" className="w-28 rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
          <input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="비고" className="min-w-48 flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm" />
          <button type="button" disabled={saving || !name.trim()} onClick={() => void addPartner()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-400"><Plus size={16} />추가</button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <p className="p-10 text-center text-sm text-slate-500">불러오는 중...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-100 text-slate-600"><tr><th className="px-4 py-3">순서</th><th className="px-4 py-3">업체명</th><th className="px-4 py-3">업체 유형</th><th className="px-4 py-3">비고</th><th className="px-4 py-3">상태</th><th className="px-4 py-3 text-right">관리</th></tr></thead>
              <tbody>
                {visiblePartners.map((partner) => (
                  <tr key={partner.id} className="border-t border-slate-200 transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3">{editingId === partner.id ? <input type="number" min={0} value={editingSortOrder} onChange={(event) => setEditingSortOrder(Number(event.target.value))} className="w-20 rounded-lg border px-2 py-1.5" /> : partner.sort_order}</td>
                    <td className="px-4 py-3 font-medium">{editingId === partner.id ? <input value={editingName} onChange={(event) => setEditingName(event.target.value)} className="w-full rounded-lg border px-3 py-1.5" /> : partner.name}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{PARTNER_TYPE_LABELS[partner.partner_type]}</span></td>
                    <td className="px-4 py-3">{editingId === partner.id ? <input value={editingMemo} onChange={(event) => setEditingMemo(event.target.value)} className="w-full rounded-lg border px-3 py-1.5" /> : partner.memo ?? "-"}</td>
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
                        <button type="button" disabled={saving || !editingLock.canEdit} onClick={() => void savePartner(partner)} className="mr-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">저장</button>
                        <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border px-3 py-1.5 text-xs">취소</button>
                      </> : <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => { setEditingId(partner.id); setEditingName(partner.name); setEditingSortOrder(partner.sort_order); setEditingMemo(partner.memo ?? ""); }} className="rounded-lg border px-3 py-1.5 text-xs">수정</button>
                        {canDelete && <button type="button" title="업체 삭제" aria-label={`${partner.name} 삭제`} disabled={deleting} onClick={() => void prepareDelete(partner)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 size={15} /></button>}
                      </div>}
                    </td>
                  </tr>
                ))}
                {visiblePartners.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">표시할 업체가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ConfirmDialog
        open={deleteTarget !== null && deletePlan !== null}
        title={deletePlan?.action === "deactivated" ? "업체 비활성화" : "업체 삭제"}
        description={deletePlan?.action === "deactivated"
          ? `"${deleteTarget?.name || "업체"}"은 기존 프로젝트 또는 출고 기록에서 사용 중입니다.\n완전 삭제할 수 없어 비활성화 처리됩니다.\n기존 프로젝트와 PDF 기록은 유지됩니다.`
          : `"${deleteTarget?.name || "업체"}" 항목을 삭제하시겠습니까?\n삭제한 데이터는 복구할 수 없습니다.`}
        confirmLabel={deletePlan?.action === "deactivated" ? "비활성화" : "삭제"}
        danger
        isPending={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => {
          if (deleting) return;
          setDeleteTarget(null);
          setDeletePlan(null);
        }}
      />
    </div>
  );
}
