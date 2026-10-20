"use client";

import { useState } from "react";
import type { PartnerImportRow } from "@/lib/partner-import";
import { PARTNER_TYPE_LABELS } from "@/lib/partners";

type Props = { disabled: boolean; onComplete: (count: number) => Promise<void> };
const buttonClass = "rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50";

export function PartnerExcelImport({ disabled, onComplete }: Props) {
  const [rows, setRows] = useState<PartnerImportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  async function download() {
    setBusy(true); setError("");
    try { (await import("@/lib/excel/partner-import")).downloadPartnerTemplate(); }
    catch (e) { setError(e instanceof Error ? e.message : "양식 다운로드 실패"); }
    finally { setBusy(false); }
  }
  async function upload(file: File) {
    setBusy(true); setError(""); setRows(null);
    try {
      const parsed = await (await import("@/lib/excel/partner-import")).readPartnerFile(file);
      setRows(parsed); setFileName(file.name);
    } catch (e) { setError(e instanceof Error ? e.message : "파일 읽기 실패"); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!rows || busy || disabled) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/partner-organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
      const result = await response.json() as { count?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "등록 실패");
      setRows(null);
      await onComplete(result.count ?? rows.length);
    } catch (e) { setError(e instanceof Error ? e.message : "등록 실패"); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" disabled={disabled || busy} onClick={() => void download()} className={buttonClass}>Excel 양식</button>
    <label className={`${buttonClass} cursor-pointer ${disabled || busy ? "pointer-events-none opacity-50" : ""}`}>Excel 업로드
      <input type="file" accept=".xlsx" className="sr-only" disabled={disabled || busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }}/>
    </label>
    {error && !rows && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}
    {rows && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <section role="dialog" aria-modal="true" aria-label="업체 Excel 등록 확인" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold">업체 일괄 등록 · {rows.length}건</h2>
        <p className="mt-2 break-all text-sm text-slate-500">{fileName}</p>
        <p className="mt-2 text-sm text-slate-600">아래 업체를 활성 상태로 등록합니다. 기존 업체와 이름이 중복되거나 오류가 있으면 전체 등록을 취소합니다.</p>
        <div className="my-4 max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-100"><tr>{["업체명", "유형", "순서", "비고"].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-t"><td className="p-3">{row.name}</td><td className="whitespace-nowrap p-3">{PARTNER_TYPE_LABELS[row.partner_type]}</td><td className="p-3">{row.sort_order}</td><td className="break-words p-3">{row.memo ?? "-"}</td></tr>)}</tbody></table></div>
        {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} className={buttonClass} onClick={() => { setRows(null); setError(""); }}>닫기</button><button type="button" disabled={disabled || busy} onClick={() => void save()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "등록 중…" : `${rows.length}개 업체 등록`}</button></div>
      </section>
    </div>}
  </>;
}
