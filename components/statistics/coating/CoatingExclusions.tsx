"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { COATING_COSTS_CHANGED_EVENT } from "@/lib/collaboration-events";
import { coatingExcludedKg, coatingUsedKg, type CoatingPlanContext } from "@/lib/coating-plans";

const number = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
type Editor = { requestId: string; label: string; weight: number; reason: string; version: number; fingerprint: string | null; maximum: number };

export function CoatingExclusions({ projectId, data, onReload }: { projectId: number; data: CoatingPlanContext; onReload: () => Promise<void> }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const rows = [
    ...data.sources.map((source) => ({
      requestId: source.requestId, label: `${source.groupName} · ${source.purchaseOrderNo || "발주번호 없음"}`,
      allocated: source.allocatedKg, used: coatingUsedKg(data.plans, source.requestId), fingerprint: source.fingerprint,
      missing: false,
    })),
    ...(data.exclusions ?? []).filter((item) => item.weight_kg > 0 && !data.sources.some((source) => source.requestId === item.request_id))
      .map((item) => ({ requestId: item.request_id, label: `비활성 발주 · ${item.request_id}`, allocated: 0, used: 0, fingerprint: null, missing: true })),
  ];
  return <section className="mt-4 rounded-xl border border-slate-200 p-3">
    <h4 className="font-semibold">도장 제외 물량</h4>
    <p className="mt-1 text-xs text-slate-500">도장이 필요 없는 물량을 제외합니다. 미배정량은 발주별 압출 배정 − 도장 배정 − 제외 중량이며, 음수는 0으로 표시합니다. 제외 해제 시 중량을 0으로 저장하세요.</p>
    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
      <thead className="bg-slate-50"><tr>{["차수 / 발주번호", "제외 kg", "미배정 kg", "사유", "관리"].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead>
      <tbody>{rows.map((row) => {
        const exclusion = data.exclusions?.find((item) => item.request_id === row.requestId);
        const excluded = coatingExcludedKg(data, row.requestId);
        const remaining = Math.round((row.allocated - row.used - excluded) * 10) / 10;
        return <tr key={row.requestId} className="border-t">
          <td className="p-2">{row.label}{(row.missing || remaining < 0) && excluded > 0 && <p className="text-xs text-amber-700">원본 변경 · 제외 물량을 확인해주세요.</p>}</td>
          <td className="p-2">{number(excluded)}</td><td className="p-2">{row.missing ? "-" : number(Math.max(0, remaining))}</td>
          <td className="max-w-64 whitespace-pre-wrap break-words p-2 text-xs">{exclusion?.reason || "-"}{exclusion && excluded === 0 && <p className="text-slate-500">제외 해제됨</p>}</td>
          <td className="p-2">{data.canManage && <Button size="sm" variant="outline" onClick={() => setEditor({ requestId: row.requestId, label: row.label, weight: excluded, reason: exclusion?.reason ?? "", version: exclusion?.version ?? 0, fingerprint: row.fingerprint, maximum: Math.max(0, Math.round((row.allocated - row.used) * 10) / 10) })}>{excluded > 0 ? "수정 / 해제" : "제외 설정"}</Button>}</td>
        </tr>;
      })}{rows.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-500">제외할 발주가 없습니다.</td></tr>}</tbody>
    </table></div>
    {editor && <ExclusionForm key={editor.requestId} projectId={projectId} editor={editor} onClose={() => setEditor(null)} onReload={onReload} />}
  </section>;
}

function ExclusionForm({ projectId, editor, onClose, onReload }: { projectId: number; editor: Editor; onClose: () => void; onReload: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [weight, setWeight] = useState(String(editor.weight));
  const [reason, setReason] = useState(editor.reason);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const weightKg = Number(weight);
    if (!weight.trim() || !Number.isFinite(weightKg) || weightKg < 0 || weightKg > editor.maximum || !reason.trim()) {
      setError("가능 중량 이내의 제외 중량과 사유를 입력해주세요."); return;
    }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/statistics/coating-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "exclude", projectId, requestId: editor.requestId, version: editor.version, weightKg, reason: reason.trim(), fingerprint: editor.fingerprint }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "저장하지 못했습니다.");
      window.dispatchEvent(new CustomEvent(COATING_COSTS_CHANGED_EVENT)); onClose();
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "저장하지 못했습니다."} 원본이 변경된 경우 창을 닫고 다시 열어주세요.`);
      await onReload();
    } finally { setSaving(false); }
  }
  return <dialog ref={dialog} aria-label="도장 제외 물량 설정" onCancel={(event) => { if (saving) event.preventDefault(); else onClose(); }} className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl backdrop:bg-slate-950/40">
    <form onSubmit={save}><fieldset disabled={saving} className="space-y-4">
      <h3 className="text-lg font-bold">도장 제외 물량 설정</h3><p className="text-sm">{editor.label}</p>
      <p className="text-sm text-slate-500">제외 가능: {number(editor.maximum)} kg · 0으로 저장하면 제외가 해제됩니다.</p>
      <label className="block text-sm">제외 중량(kg)<input required type="number" min="0" max={editor.maximum} step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} className="mt-1 w-full rounded-xl border p-2" /></label>
      <label className="block text-sm">제외·해제 사유<textarea required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="예: 무도장 납품 / 제외 해제 사유" className="mt-1 w-full rounded-xl border p-2" /></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>닫기</Button><Button type="submit" variant="primary">{saving ? "저장 중…" : "저장"}</Button></div>
    </fieldset></form>
  </dialog>;
}
