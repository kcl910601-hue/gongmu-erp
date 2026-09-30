"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { calculateVat, formatContractAmount, type ContractPreview, type ProjectContractEntry, type ProjectContractEntryType } from "@/lib/project-contracts";

export function ProjectContractEntryDialog({ projectId, hasOriginal, currentSupply, entry, action = "save", onClose, onSaved }: {
  projectId: number; hasOriginal: boolean; currentSupply: number | null;
  entry: ProjectContractEntry | null; action?: "save" | "void";
  onClose: () => void; onSaved: () => void | Promise<void>;
}) {
  const original = entry ? entry.entry_type === "original" : !hasOriginal;
  const [type, setType] = useState<ProjectContractEntryType>(entry?.entry_type ?? (original ? "original" : "increase"));
  const [mode, setMode] = useState<"delta" | "total">(original ? "delta" : entry ? entry.amount_input_mode ?? "delta" : "total");
  const [title, setTitle] = useState(entry?.contract_title ?? "");
  const [contractDate, setContractDate] = useState(entry?.contract_date ?? new Date().toISOString().slice(0, 10));
  const [effectiveDate, setEffectiveDate] = useState(entry?.effective_date ?? new Date().toISOString().slice(0, 10));
  const [documentNumber, setDocumentNumber] = useState(entry?.document_number ?? "");
  const [supply, setSupply] = useState(entry ? String(entry.input_supply_amount_krw ?? entry.supply_amount_krw) : "");
  const [vat, setVat] = useState(entry ? String(entry.input_vat_amount_krw ?? entry.vat_amount_krw) : "0");
  const [vatManual, setVatManual] = useState(Boolean(entry));
  const [memo, setMemo] = useState(entry?.memo ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ContractPreview | null>(null);
  const isVoid = action === "void";
  const amountValid = supply.trim() !== "" && vat.trim() !== "" && Number.isSafeInteger(Number(supply)) && Number(supply) >= (original ? 1 : 0)
    && Number.isSafeInteger(Number(vat)) && Number(vat) >= 0 && Number.isSafeInteger(Number(supply) + Number(vat));
  const valid = isVoid || (title.trim() && contractDate && effectiveDate && amountValid);
  function changeSupply(value: string) {
    setSupply(value);
    if (!vatManual) setVat(String(calculateVat(Number(value) || 0)));
  }
  async function submit() {
    setSaving(true); setError(null);
    try {
      const input = isVoid ? { action: "void" } : {
        project_id: projectId, entry_type: type, amount_input_mode: mode, contract_title: title,
        contract_date: contractDate, effective_date: effectiveDate, document_number: documentNumber,
        supply_amount_krw: Number(supply), vat_amount_krw: Number(vat), memo,
      };
      const response = await fetch(entry ? `/api/statistics/project-contracts/entries/${entry.id}` : "/api/statistics/project-contracts/entries", {
        method: entry ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, preview: !preview, revision: preview?.revision }),
      });
      const payload = await response.json() as { preview?: ContractPreview; error?: string; saved?: boolean };
      if (!response.ok || !payload.preview) {
        setPreview(null);
        throw new Error(payload.error ?? "변경내용을 확인하지 못했습니다.");
      }
      if (!payload.saved) { setPreview(payload.preview); return; }
      setSaved(true);
      try { await onSaved(); onClose(); }
      catch { setError("저장은 완료되었지만 화면 갱신에 실패했습니다. 닫은 후 다시 조회해주세요."); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); }
    finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="contract-entry-title">
    <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between"><div><h2 id="contract-entry-title" className="text-lg font-bold">{isVoid ? "계약 무효 처리" : entry ? "계약 수정" : original ? "최초 계약 등록" : "변경 계약 등록"}</h2><p className="mt-1 text-xs text-slate-500">공급가액은 부가세를 제외한 금액입니다.</p></div><Button variant="ghost" disabled={saving} onClick={onClose}>닫기</Button></div>
      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">현재 최종 공급가액 <b className="ml-2">{formatContractAmount(currentSupply)}</b></p>
      {isVoid ? <p className="mt-4 text-sm">‘{entry?.contract_title}’ 이력을 보존하고 집계에서 제외합니다. 후속 계약에 미치는 영향을 확인한 뒤 저장해주세요.</p> : <fieldset disabled={saving || saved} onChange={() => { setPreview(null); setError(null); }}>
        {!original && <label className="mt-4 block text-sm font-semibold">금액 입력 방식<select value={mode} onChange={(event) => { setMode(event.target.value as "delta" | "total"); setSupply(""); setVat("0"); setVatManual(false); }} className="mt-1 h-10 w-full rounded-lg border px-3"><option value="total">변경 후 총 계약금액 입력</option><option value="delta">증액·감액 금액만 입력</option></select></label>}
        {!original && <p className="mt-2 text-xs text-slate-500">{mode === "total" ? "해당 계약 이후의 총 공급가액과 총 부가세를 입력하세요. 증액·감액은 자동 계산됩니다." : "이번 계약에서 늘거나 줄어드는 금액만 입력하세요."}</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {mode === "delta" && <label className="text-xs font-semibold text-slate-600">계약 유형<select value={type} onChange={(event) => setType(event.target.value as ProjectContractEntryType)} className="mt-1 h-9 w-full rounded-lg border px-3 text-sm">{original ? <option value="original">최초 계약</option> : <><option value="increase">증액</option><option value="decrease">감액</option></>}</select></label>}
          <label className="text-xs font-semibold text-slate-600">계약 제목<input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} className="mt-1 h-9 w-full rounded-lg border px-3 text-sm"/></label>
          <label className="text-xs font-semibold text-slate-600">계약일<input type="date" value={contractDate} onChange={(event) => setContractDate(event.target.value)} className="mt-1 h-9 w-full rounded-lg border px-3 text-sm"/></label>
          <label className="text-xs font-semibold text-slate-600">적용일<input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className="mt-1 h-9 w-full rounded-lg border px-3 text-sm"/></label>
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">문서번호<input value={documentNumber} maxLength={100} onChange={(event) => setDocumentNumber(event.target.value)} className="mt-1 h-9 w-full rounded-lg border px-3 text-sm"/></label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">{original ? "최초 계약 공급가액" : mode === "total" ? "변경 후 총 공급가액" : `${type === "decrease" ? "감액" : "증액"} 공급가액`}<input type="number" min={original ? 1 : 0} step="1" value={supply} onChange={(event) => changeSupply(event.target.value)} className="mt-1 h-9 w-full rounded-lg border px-3 text-sm"/>{supply !== "" && <span className="mt-1 block font-normal">{formatContractAmount(Number(supply))}</span>}</label>
          <label className="text-xs font-semibold text-slate-600">{mode === "total" ? "변경 후 총 부가세" : original ? "부가세" : "증감 부가세"}<div className="mt-1 flex gap-2"><input type="number" min="0" step="1" value={vat} onChange={(event) => { setVat(event.target.value); setVatManual(true); }} className="h-9 min-w-0 flex-1 rounded-lg border px-3 text-sm"/><Button size="sm" variant="outline" onClick={() => { setVat(String(calculateVat(Number(supply) || 0))); setVatManual(false); setPreview(null); }}>10% 자동</Button></div></label>
        </div>
        <label className="mt-4 block text-xs font-semibold text-slate-600">비고<textarea value={memo} maxLength={2000} onChange={(event) => setMemo(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border p-3 text-sm"/></label>
      </fieldset>}
      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">계산 순서는 최초 계약 → 변경 계약 등록 순서입니다. 계약일을 수정해도 순서는 바뀌지 않습니다. 과거 계약을 수정하면 후속 총액 입력 계약의 총액은 유지되고, 증감액 입력 계약의 증감액은 유지됩니다. 기존 계약은 증감액 입력으로 취급합니다.</p>
      {preview && <section className="mt-4 space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-live="polite">
        <h3 className="font-semibold">저장 전 변경내용 확인</h3>
        <p className="text-sm">최종 공급가액: {formatContractAmount(preview.before_supply)} → <b>{formatContractAmount(preview.after_supply)}</b></p>
        <p className="text-xs">최종 부가세: {formatContractAmount(preview.before_vat)} → {formatContractAmount(preview.after_vat)}</p>
        <p className="text-sm font-semibold">변경 후 VAT 포함 총액: {formatContractAmount(preview.after_supply + preview.after_vat)}</p>
        {preview.changes.map((change) => <div key={change.id} className="rounded-lg bg-white p-3 text-xs leading-relaxed"><p className="font-semibold">{change.is_target ? "이번 계약" : "후속 계약 자동 재계산"} · {change.title}</p><p>공급가액 증감: {change.before_delta === null ? "신규" : formatContractAmount(change.before_delta)} → {formatContractAmount(change.after_delta)}</p><p>부가세 증감: {change.before_vat_delta === null ? "신규" : formatContractAmount(change.before_vat_delta)} → {formatContractAmount(change.after_vat_delta)}</p>{!isVoid && <p>이 계약까지 반영한 공급가액: {formatContractAmount(change.resulting_supply)}</p>}</div>)}
      </section>}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={onClose}>{saved ? "닫기" : "취소"}</Button><Button variant={isVoid ? "danger" : "primary"} disabled={saving || saved || !valid} onClick={() => void submit()}>{saving ? "처리 중" : preview ? isVoid ? "확인 후 무효 처리" : "확인 후 저장" : "변경내용 확인"}</Button></div>
    </section>
  </div>;
}
