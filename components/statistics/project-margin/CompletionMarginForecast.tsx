import { useState } from "react";
import type { ProjectMarginAnalysis } from "@/lib/project-margin-analysis";
import type { ProjectMaterialCostStatus } from "@/lib/project-material-cost-status";

const categories = [
  { key: "al", label: "AL" },
  { key: "coating", label: "도장" },
  { key: "glass", label: "유리" },
  { key: "accessory", label: "부자재" },
  { key: "additional", label: "부대비용" },
] as const;
type Category = typeof categories[number]["key"];
const empty = (): Record<Category, string> => ({ al: "", coating: "", glass: "", accessory: "", additional: "" });

export function CompletionMarginForecast({ analysis, materialStatus }: {
  analysis: ProjectMarginAnalysis;
  materialStatus?: ProjectMaterialCostStatus;
}) {
  const [inputs, setInputs] = useState(empty);
  const parsed = categories.map(category => {
    const raw = inputs[category.key].trim();
    const amount = Number(raw);
    return { ...category, amount, missing: raw === "", valid: /^\d+$/.test(raw) && Number.isSafeInteger(amount) && amount >= 0 };
  });
  const missingCount = parsed.filter(item => item.missing).length;
  const allValid = parsed.every(item => item.valid);
  const remaining = allValid ? parsed.reduce((sum, item) => sum + item.amount, 0) : null;
  const current = analysis.expected_total_cost_krw;
  const revenue = analysis.final_supply_amount_krw;
  const baseReady = (analysis.calculation_status === "calculated" || analysis.calculation_status === "negative_margin")
    && current !== null && revenue !== null && Number.isSafeInteger(current) && Number.isSafeInteger(revenue) && revenue > 0;
  const total = baseReady && remaining !== null ? current + remaining : null;
  const margin = total !== null && revenue !== null ? revenue - total : null;
  const safe = remaining !== null && Number.isSafeInteger(remaining) && total !== null && Number.isSafeInteger(total)
    && margin !== null && Number.isSafeInteger(margin);
  const rate = safe && revenue !== null && revenue > 0 && margin !== null ? margin / revenue * 100 : null;
  const overflow = allValid && (remaining === null || !Number.isSafeInteger(remaining) || (baseReady && !safe));
  const money = (amount: number | null) => amount === null ? "계산 대기" : `${amount.toLocaleString("ko-KR")}원`;
  return <section className="mt-4 rounded-xl border border-slate-200 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">잔여 발생예상비용 · 준공 예상마진 시뮬레이션</h3>
      <button type="button" className="text-xs text-slate-600 underline" onClick={() => setInputs(empty())}>입력 초기화</button>
    </div>
    <p className="mt-2 text-xs text-slate-600">현재 집계 총원가에 아직 포함되지 않은 추가 비용만 공급가액(원)으로 입력하세요. 남은 비용이 없으면 0을 입력합니다. 미지급액도 이미 원가에 포함되었다면 다시 더하지 않습니다.</p>
    <p className="mt-1 text-xs text-slate-500">입력값은 저장되지 않으며 상세창을 닫으면 초기화됩니다. 현재 계약금액을 유지한 가정이며 기존 마진 집계에는 반영되지 않습니다.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {parsed.map(item => <label key={item.key} className="text-xs text-slate-600">
        {item.label} 추가 예상비용
        <input type="text" inputMode="numeric" value={inputs[item.key]} placeholder="미확인 · 없으면 0"
          aria-invalid={!item.missing && !item.valid}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          onChange={event => setInputs(previous => ({ ...previous, [item.key]: event.target.value }))} />
        {!item.missing && !item.valid && <span className="mt-1 block text-red-700">지원 범위 내 0 이상의 원 단위 정수를 입력하세요.</span>}
      </label>)}
    </div>
    <p className="mt-2 text-xs text-amber-800">AL 예상원가 기준에서는 전체 예상 물량이 이미 반영되었을 수 있습니다. LME 배정 기준에서도 예정·확정 배정액이 포함되어 있으므로 중복 입력하지 마세요. 도장 계획금액 역시 자동 합산하지 않습니다.</p>
    {materialStatus && materialStatus.unallocatedKg > 0 && <p className="mt-1 text-xs text-amber-800">AL 미배정 {materialStatus.unallocatedKg.toLocaleString("ko-KR", { maximumFractionDigits: 1 })} kg: 현재 원가에 포함되지 않은 금액만 확인해 입력하세요.</p>}
    {!baseReady && <p className="mt-2 text-xs text-amber-800">계약금액과 현재 집계 총원가를 계산할 수 있는 프로젝트에서 준공 예상마진을 표시합니다.</p>}
    {missingCount > 0 && <p className="mt-2 text-xs text-slate-500">미확인 {missingCount}개 항목이 있습니다. 모든 항목을 입력해야 결과를 계산합니다.</p>}
    {overflow && <p role="alert" className="mt-2 text-xs text-red-700">합산 금액이 지원 범위를 초과했습니다.</p>}
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
      {[
        ["추가 예상비용 합계", money(remaining !== null && Number.isSafeInteger(remaining) ? remaining : null)],
        ["준공 예상 총원가", money(safe ? total : null)],
        ["준공 예상마진", money(safe ? margin : null)],
        ["준공 예상마진율", rate === null ? "계산 대기" : `${rate.toFixed(2)}%`],
      ].map(([label, value]) => <article key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></article>)}
    </div>
    {safe && margin !== null && margin < 0 && <p className="mt-2 text-sm font-semibold text-red-700">입력한 잔여 비용을 반영하면 준공 시 손실이 예상됩니다.</p>}
    <p className="mt-2 text-xs text-slate-500">준공 예상 총원가 = 현재 집계 총원가 + 추가 예상비용. 준공 예상마진 = 최종 계약 공급가액 − 준공 예상 총원가. VAT와 향후 계약 증감은 제외합니다.</p>
  </section>;
}
