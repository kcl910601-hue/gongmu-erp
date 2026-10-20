import { useState } from "react";
import type { ProjectMaterialCostStatus } from "@/lib/project-material-cost-status";

function parsePrice(input: string) {
  const raw = input.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const price = Number(raw);
  return Number.isFinite(price) && price > 0 && Number.isSafeInteger(Math.round(price * 100)) ? price : null;
}

export function AlPriceExposure({ status, revenue }: { status?: ProjectMaterialCostStatus; revenue: number | null }) {
  const [baseInput, setBaseInput] = useState("");
  const [comparisonInput, setComparisonInput] = useState("");
  const base = parsePrice(baseInput);
  const comparison = parsePrice(comparisonInput);
  const quantity = status?.unallocatedKg;
  const quantityReady = quantity !== undefined && Number.isFinite(quantity) && quantity >= 0 && Number.isSafeInteger(Math.round(quantity * 10));
  const baseCost = quantityReady && base !== null ? Math.round(quantity * base) : null;
  const safeBase = baseCost !== null && Number.isSafeInteger(baseCost);
  const scenarios = [
    ...[-10, -5, 0, 5, 10].map(percent => ({ label: percent === 0 ? "기준 단가" : `${percent > 0 ? "+" : ""}${percent}%`, price: base === null ? null : Math.round(base * (1 + percent / 100) * 100) / 100 })),
    { label: "직접 입력", price: comparison },
  ];
  const format = (value: number, digits = 0, signed = false) => value.toLocaleString("ko-KR", { maximumFractionDigits: digits, signDisplay: signed ? "exceptZero" : "auto" });
  return <section className="mt-4 rounded-xl border border-slate-200 p-4">
    <h3 className="text-sm font-semibold">미배정 AL 물량의 가격변동 영향</h3>
    <p className="mt-1 text-xs text-slate-500">현재 미배정 물량을 같은 수량으로 조달할 때의 단가별 비교입니다. 이미 예정·확정 배정된 물량은 제외하며, 입력 단가는 실시간 시세가 아닌 사용자 가정입니다.</p>
    <p className="mt-3 text-sm font-semibold">미배정량: {quantityReady ? `${format(quantity, 1)} kg` : "확인 불가"}</p>
    {quantityReady && quantity === 0 ? <p className="mt-2 text-xs text-slate-500">현재 미배정 AL 물량이 없어 이 물량의 가격변동 영향은 0원입니다. 향후 추가 발주는 포함하지 않습니다.</p> : <>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-600">기준 조달 단가 (원/kg)
          <input type="text" inputMode="decimal" value={baseInput} placeholder="기준 단가 입력" aria-invalid={baseInput.trim() !== "" && base === null}
            onChange={event => setBaseInput(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-slate-600">비교 조달 단가 (원/kg·선택)
          <input type="text" inputMode="decimal" value={comparisonInput} placeholder="직접 비교할 단가 입력" aria-invalid={comparisonInput.trim() !== "" && comparison === null}
            onChange={event => setComparisonInput(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-500">두 단가 모두 VAT를 제외하고 가공비 등 포함 범위를 동일하게 맞추세요. 0보다 큰 값, 소수 둘째 자리까지 입력할 수 있습니다. 입력값은 저장되지 않습니다.</p>
      {((baseInput.trim() !== "" && base === null) || (comparisonInput.trim() !== "" && comparison === null)) && <p role="alert" className="mt-2 text-xs text-red-700">단가 입력값을 확인해주세요. 지원 범위 내 양수를 소수 둘째 자리까지 입력하세요.</p>}
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-right text-xs">
        <thead className="bg-slate-50"><tr>{["단가 시나리오", "단가 (원/kg)", "미배정분 조달 예상액", "기준 대비 원가 증감", "마진 증감", "마진율 변화 (%p)"].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{scenarios.map(scenario => {
          const amount = quantityReady && scenario.price !== null && scenario.price > 0 && Number.isSafeInteger(Math.round(scenario.price * 100)) ? Math.round(quantity * scenario.price) : null;
          const change = amount !== null && safeBase && baseCost !== null ? amount - baseCost : null;
          const valid = amount !== null && Number.isSafeInteger(amount) && change !== null && Number.isSafeInteger(change);
          const margin = valid && change !== null ? -change : null;
          const percentagePoints = margin !== null && revenue !== null && Number.isSafeInteger(revenue) && revenue > 0 ? margin / revenue * 100 : null;
          return <tr key={scenario.label} className="border-t">
            <th className="p-2 font-medium">{scenario.label}</th>
            <td className="p-2">{scenario.price === null || scenario.price <= 0 ? "—" : format(scenario.price, 2)}</td>
            <td className="p-2">{valid && amount !== null ? `${format(amount)}원` : "—"}</td>
            <td className="p-2">{valid && change !== null ? `${format(change, 0, true)}원` : "—"}</td>
            <td className={`p-2 ${margin !== null && margin < 0 ? "text-red-700" : ""}`}>{margin === null ? "—" : `${format(margin, 0, true)}원`}</td>
            <td className="p-2">{percentagePoints === null ? "—" : format(percentagePoints, 2, true)}</td>
          </tr>;
        })}</tbody>
      </table></div>
      {base !== null && quantityReady && !safeBase && <p role="alert" className="mt-2 text-xs text-red-700">조달 예상액이 지원 범위를 초과했습니다.</p>}
      <p className="mt-2 text-xs text-slate-500">조달 예상액은 미배정량 × 단가를 원 단위 반올림합니다. 원가 증감은 시나리오 예상액 − 기준 예상액이며, 마진 증감은 그 반대 부호입니다. 계약 공급가액이 없거나 0원이면 마진율 변화를 표시하지 않습니다. 자료 부족 또는 지원 범위 초과 시 —로 표시합니다.</p>
    </>}
    <p className="mt-2 text-xs text-amber-800">가격변동분만 비교하며 준공 예상마진은 아닙니다. 예상원가 기준에는 해당 물량이 이미 포함될 수 있고, 배정 기준에는 미배정분 기본 조달액부터 빠져 있을 수 있으므로 현재 마진에 단순 가감하지 않습니다.</p>
  </section>;
}
