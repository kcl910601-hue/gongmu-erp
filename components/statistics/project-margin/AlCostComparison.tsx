import type { ProjectMaterialCostStatus } from "@/lib/project-material-cost-status";

type CostRow = { quantityKg: number; costKrw: number };
export type AlCostComparisonData = { estimates: CostRow[]; current: CostRow[] };

function summarize(rows: CostRow[]) {
  if (!rows.length || rows.some(row => !Number.isFinite(row.quantityKg) || row.quantityKg <= 0 || !Number.isSafeInteger(row.costKrw) || row.costKrw < 0)) return null;
  const quantity = rows.reduce((sum, row) => sum + row.quantityKg, 0);
  const cost = rows.reduce((sum, row) => sum + row.costKrw, 0);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(cost)) return null;
  return { quantity, cost, price: cost / quantity };
}

export function AlCostComparison({ data, status }: { data: AlCostComparisonData; status?: ProjectMaterialCostStatus }) {
  const estimate = summarize(data.estimates);
  const current = summarize(data.current);
  const allocationBasis = status?.basis === "allocation";
  const comparable = allocationBasis && estimate !== null && current !== null;
  const format = (value: number, digits = 0, signed = false) => value.toLocaleString("ko-KR", { maximumFractionDigits: digits, signDisplay: signed ? "exceptZero" : "auto" });
  const quantityEffect = comparable ? Math.round((current.quantity - estimate.quantity) * estimate.price) : null;
  const difference = comparable ? current.cost - estimate.cost : null;
  const priceEffect = difference !== null && quantityEffect !== null ? difference - quantityEffect : null;
  const safeEffects = quantityEffect !== null && priceEffect !== null && Number.isSafeInteger(quantityEffect) && Number.isSafeInteger(priceEffect);
  const metrics = [
    { label: "물량 (kg)", before: estimate?.quantity, after: allocationBasis ? current?.quantity : undefined, digits: 1 },
    { label: "가중 평균단가 (원/kg)", before: estimate?.price, after: allocationBasis ? current?.price : undefined, digits: 2 },
    { label: "원가 (원)", before: estimate?.cost, after: allocationBasis ? current?.cost : undefined, digits: 0 },
  ];
  return <section className="mt-4 rounded-xl border border-slate-200 p-4">
    <h3 className="text-sm font-semibold">AL 예상 대비 현재 배정 원가</h3>
    <p className="mt-1 text-xs text-slate-500">현재 저장된 AL 예상 내역과 예정·확정 배정 합계의 비교입니다. 최초 예산이나 실제 소진원가를 의미하지 않습니다.</p>
    {!allocationBasis && <p className="mt-2 text-xs text-amber-800">현재 예상원가 기준입니다. LME 배정 기준으로 연결된 프로젝트에서 배정 원가 차이를 표시합니다.</p>}
    {allocationBasis && !comparable && <p className="mt-2 text-xs text-amber-800">예상 내역 또는 유효 배정 내역이 없거나 수량·금액을 계산할 수 없어 차이를 표시하지 않습니다.</p>}
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-96 text-right text-xs">
        <thead className="bg-slate-50"><tr><th className="p-2 text-left">항목</th><th className="p-2">저장된 예상</th><th className="p-2">현재 배정</th><th className="p-2">차이 (배정 − 예상)</th></tr></thead>
        <tbody>{metrics.map(item => <tr key={item.label} className="border-t">
          <th className="p-2 text-left font-medium">{item.label}</th>
          <td className="p-2">{item.before === undefined ? "—" : format(item.before, item.digits)}</td>
          <td className="p-2">{item.after === undefined ? "—" : format(item.after, item.digits)}</td>
          <td className="p-2">{comparable && item.before !== undefined && item.after !== undefined ? format(item.after - item.before, item.digits, true) : "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {safeEffects && quantityEffect !== null && priceEffect !== null && <div className="mt-3 space-y-1 text-xs text-slate-600">
      <p>물량 차이 영향: {format(quantityEffect, 0, true)}원 · 단가 차이 영향: {format(priceEffect, 0, true)}원</p>
      <p>물량 영향 = (배정량 − 예상량) × 예상 평균단가. 단가 영향은 전체 원가 차이에서 물량 영향을 뺀 금액이며 반올림 차이를 포함합니다.</p>
    </div>}
    <p className="mt-2 text-xs text-slate-500">평균단가는 저장 원가 ÷ 물량입니다. 원가 차이가 양수면 예상보다 증가, 음수면 감소입니다. 미배정 물량과 향후 추가 발주가 있으므로 감소액을 최종 절감액으로 판단하지 마세요.</p>
    {status && status.unallocatedKg > 0 && <p className="mt-2 text-xs font-medium text-amber-800">미배정 {format(status.unallocatedKg, 1)} kg가 남아 있어 전체 필요 물량의 비교가 아닙니다.</p>}
  </section>;
}
