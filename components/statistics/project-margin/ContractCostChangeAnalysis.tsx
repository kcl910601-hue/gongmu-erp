import { useState } from "react";
import { ENTRY_TYPE_LABEL, type ProjectContractEntry, type ProjectContractSummary } from "@/lib/project-contracts";
import type { ProjectMarginAnalysis } from "@/lib/project-margin-analysis";

export type ContractChangeEntry = Pick<ProjectContractEntry, "id" | "entry_type" | "contract_title" | "effective_date" | "supply_amount_krw">;
type Summary = Pick<ProjectContractSummary, "original_supply_amount_krw" | "increase_supply_amount_krw" | "decrease_supply_amount_krw" | "final_supply_amount_krw">;

export function ContractCostChangeAnalysis({ summary, entries, analysis }: {
  summary: Summary; entries: ContractChangeEntry[]; analysis: ProjectMarginAnalysis;
}) {
  const [baselineInput, setBaselineInput] = useState("");
  const baseline = Number(baselineInput.trim());
  const validInput = /^\d+$/.test(baselineInput.trim()) && Number.isSafeInteger(baseline) && baseline >= 0;
  const original = summary.original_supply_amount_krw;
  const final = summary.final_supply_amount_krw;
  const currentCost = analysis.expected_total_cost_krw;
  const amountsSafe = original !== null && final !== null && [original, final, summary.increase_supply_amount_krw, summary.decrease_supply_amount_krw].every(Number.isSafeInteger);
  const contractChange = amountsSafe ? summary.increase_supply_amount_krw - summary.decrease_supply_amount_krw : null;
  const ready = amountsSafe && validInput && currentCost !== null && Number.isSafeInteger(currentCost)
    && (analysis.calculation_status === "calculated" || analysis.calculation_status === "negative_margin");
  const costChange = ready ? currentCost - baseline : null;
  const baselineMargin = ready && original !== null ? original - baseline : null;
  const marginChange = costChange !== null && contractChange !== null ? contractChange - costChange : null;
  const currentMargin = ready && final !== null ? final - currentCost : null;
  const safe = ready && [costChange, baselineMargin, marginChange, currentMargin].every(value => value !== null && Number.isSafeInteger(value));
  const money = (value: number | null, signed = false) => value === null || !Number.isSafeInteger(value) ? "계산 대기" : `${value.toLocaleString("ko-KR", { signDisplay: signed ? "exceptZero" : "auto" })}원`;
  const ordered = [...entries].sort((a, b) => a.effective_date.localeCompare(b.effective_date) || a.id.localeCompare(b.id));
  return <section className="mt-4 rounded-xl border border-slate-200 p-4">
    <h3 className="text-sm font-semibold">계약 증감과 원가 증감</h3>
    <p className="mt-1 text-xs text-slate-500">유효 계약 이력의 공급가액 기준입니다. 개별 계약 변경과 비용 사이의 직접 연결은 없으므로 프로젝트 전체 증감을 비교합니다.</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-4">
      {([ ["최초 계약", original], ["증액 합계", summary.increase_supply_amount_krw], ["감액 합계", summary.decrease_supply_amount_krw], ["계약 순증감", contractChange] ] as const).map(([label, value]) => <article key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold">{money(value)}</p></article>)}
    </div>
    <div className="mt-3 rounded-lg bg-blue-50 p-3">
      <label className="block text-xs font-medium">최초 계약에 대응하는 기준 총원가 (공급가액·원)
        <input type="text" inputMode="numeric" placeholder="확인된 최초 예산 입력" value={baselineInput}
          aria-invalid={baselineInput.trim() !== "" && !validInput}
          onChange={event => setBaselineInput(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:max-w-sm" />
      </label>
      <p className="mt-2 text-xs text-slate-600">AL·도장·유리·부자재·부대비용을 모두 포함한 동일 범위의 기준값을 입력하세요. 저장되지 않으며 상세창을 닫으면 초기화됩니다. 현재 총원가는 예상·실제 비용이 혼합되어 있어 최종 정산 결과와 다를 수 있습니다.</p>
      {baselineInput.trim() !== "" && !validInput && <p className="mt-1 text-xs text-red-700">지원 범위 내 0 이상의 원 단위 정수를 입력하세요.</p>}
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
      {[
        ["기준 마진 (최초 계약 − 기준 원가)", money(safe ? baselineMargin : null)],
        ["원가 증감 (현재 − 기준)", money(safe ? costChange : null, true)],
        ["마진 변화 (계약 순증감 − 원가 증감)", money(safe ? marginChange : null, true)],
        ["현재 집계 마진", money(safe ? currentMargin : null)],
      ].map(([label, value]) => <article key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></article>)}
    </div>
    {safe && marginChange !== null && <p className={`mt-2 text-xs ${marginChange < 0 ? "text-amber-800" : "text-slate-600"}`}>{marginChange < 0 ? "입력한 기준 대비 원가 증감이 계약 순증감보다 커서 마진이 감소했습니다." : marginChange > 0 ? "입력한 기준 대비 계약 순증감이 원가 증감보다 커서 마진이 증가했습니다." : "입력한 기준 대비 계약과 원가의 증감액이 같아 마진 변화가 없습니다."}</p>}
    {!safe && <p className="mt-2 text-xs text-slate-500">유효한 기준 총원가와 계산 가능한 계약·현재 원가가 있어야 마진 변화를 표시합니다. 기준값이 없으면 과거 마진을 추정하지 않습니다.</p>}
    <details className="mt-3"><summary className="cursor-pointer text-sm">유효 계약 변경 내역 · {entries.length}건</summary>
      <div className="mt-2 max-h-64 overflow-auto"><table className="w-full min-w-96 text-xs"><thead className="bg-slate-50"><tr>{["적용일", "구분", "계약명", "공급가액 증감"].map(label => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead>
        <tbody>{ordered.map(entry => <tr key={entry.id} className="border-t"><td className="p-2">{entry.effective_date}</td><td className="p-2">{ENTRY_TYPE_LABEL[entry.entry_type]}</td><td className="p-2">{entry.contract_title}</td><td className="p-2">{money(entry.entry_type === "decrease" ? -entry.supply_amount_krw : entry.supply_amount_krw, entry.entry_type !== "original")}</td></tr>)}{!entries.length && <tr><td colSpan={4} className="p-3 text-slate-500">유효 계약 내역이 없습니다.</td></tr>}</tbody>
      </table></div>
    </details>
  </section>;
}
