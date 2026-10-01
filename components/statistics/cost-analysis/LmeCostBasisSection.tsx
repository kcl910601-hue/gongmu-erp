"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MATERIAL_USAGE_REQUESTS_CHANGED_EVENT } from "@/lib/collaboration-events";
import { formatKrw, type ProjectMaterialUsage } from "@/lib/project-material-cost";
import { summarizeProjectMaterialAllocationCosts, type ProjectMaterialCostRow } from "@/lib/project-material-allocation-cost";

type Basis = { basis: "estimate" | "allocation"; baseline_quantity_kg: number; baseline_cost_krw: number; baseline_at: string };
type Allocation = ProjectMaterialCostRow & { id: string; material_code: string; contract_name: string; source_type: string };
type Data = { basis: Basis | null; usages: ProjectMaterialUsage[]; allocations: Allocation[]; unallocatedKg: number };
const kg = (value: number) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })} kg`;

export function LmeCostBasisSection({ projectId, canManage, onChanged }: {
  projectId: number; canManage: boolean; onChanged: () => Promise<void>;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmBasis, setConfirmBasis] = useState<"estimate" | "allocation" | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const [materialsResponse, allocationsResponse] = await Promise.all([
      fetch(`/api/statistics/cost-analysis/projects/${projectId}/materials`, { cache: "no-store", signal }),
      fetch(`/api/projects/${projectId}/material-allocations`, { cache: "no-store", signal }),
    ]);
    const [materials, allocations] = await Promise.all([materialsResponse.json(), allocationsResponse.json()]);
    if (!materialsResponse.ok || !allocationsResponse.ok) throw new Error(materials.error ?? allocations.error ?? "LME 원가를 불러오지 못했습니다.");
    if (signal?.aborted) return;
    setData({ basis: materials.basis, usages: materials.usages, allocations: allocations.allocations, unallocatedKg: Number(allocations.orderStatus.unallocatedTons) * 1000 });
    setError(null);
  }, [projectId]);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      void Promise.all([load(controller.signal), onChanged()]).catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "원가를 불러오지 못했습니다.");
      });
    };
    const timer = window.setTimeout(() => void load(controller.signal).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "원가를 불러오지 못했습니다.");
    }), 0);
    window.addEventListener(MATERIAL_USAGE_REQUESTS_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => { window.clearTimeout(timer); controller.abort(); window.removeEventListener(MATERIAL_USAGE_REQUESTS_CHANGED_EVENT, refresh); window.removeEventListener("focus", refresh); };
  }, [load, onChanged]);
  async function apply() {
    if (!confirmBasis) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/statistics/cost-analysis/projects/${projectId}/materials`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ basis: confirmBasis }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "원가 기준을 변경하지 못했습니다.");
      setConfirmBasis(null);
      await Promise.all([load(), onChanged()]);
      window.dispatchEvent(new Event(MATERIAL_USAGE_REQUESTS_CHANGED_EVENT));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "원가 기준을 변경하지 못했습니다."); }
    finally { setSaving(false); }
  }
  const allocations = data?.allocations.filter(row => row.material_code === "AL" && row.status !== "cancelled") ?? [];
  const summary = summarizeProjectMaterialAllocationCosts(allocations);
  const currentCost = summary.plannedCostKrw + summary.confirmedCostKrw;
  const estimates = data?.usages.filter(row => row.material_code === "AL") ?? [];
  const baselineKg = Number(data?.basis?.baseline_quantity_kg ?? estimates.reduce((sum, row) => sum + Number(row.expected_quantity_kg), 0));
  const baselineCost = Number(data?.basis?.baseline_cost_krw ?? estimates.reduce((sum, row) => sum + Number(row.expected_cost_krw), 0));
  const linked = data?.basis?.basis === "allocation";
  return <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">AL 압출 물량 · LME 원가 연결</h2>
      <span className="text-xs text-blue-700">현재 기준: {data ? linked ? "LME 현재 배정" : "입력한 예상원가" : "조회 중"}</span>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {data && <>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div><p className="text-slate-500">{data.basis ? "최초 연결 당시 예상" : "현재 입력된 예상"}</p><p>{kg(baselineKg)} · {formatKrw(baselineCost)}</p></div>
        <div><p className="text-slate-500">현재 유효 배정 (예정 + 확정)</p><p>{kg(summary.totalAllocatedTons * 1000)} · {formatKrw(currentCost)}</p></div>
        <div><p className="text-slate-500">예상 대비 증감</p><p>{kg(summary.totalAllocatedTons * 1000 - baselineKg)} · {formatKrw(currentCost - baselineCost)}</p></div>
      </div>
      <p className="text-xs text-slate-500">예정 {kg(summary.plannedTons * 1000)} / 확정 {kg(summary.confirmedTons * 1000)} · 미배정 {kg(data.unallocatedKg)} (원가 미포함)</p>
      {data.unallocatedKg > 0 && <p className="text-sm text-amber-700">미배정 물량이 있어 현재 배정 원가가 현장 전체 원가보다 적을 수 있습니다.</p>}
      <details className="text-sm"><summary className="cursor-pointer">배정별 물량과 단가 ({allocations.length}건)</summary>
        <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{["계약/단가 근거", "상태", "물량", "적용단가", "원가"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead>
          <tbody>{allocations.map(row => <tr key={row.id} className="border-t"><td className="p-2">{row.source_type === "direct_price" ? "직접단가" : row.contract_name}</td><td className="p-2">{row.status === "planned" ? "예정" : "확정"}</td><td className="p-2">{kg(Number(row.quantity_tons) * 1000)}</td><td className="p-2">{Number(row.applied_unit_price_krw_per_kg).toLocaleString("ko-KR")}원/kg</td><td className="p-2">{formatKrw(Number(row.quantity_tons) * 1000 * Number(row.applied_unit_price_krw_per_kg))}</td></tr>)}</tbody>
        </table></div>
      </details>
      <p className="text-xs text-slate-500">연결하면 배정 변경·취소가 원가 분석과 손익 집계에 자동 반영됩니다. 기존 AL 예상 내역은 보존하며 중복 합산하지 않습니다.</p>
      {canManage && <Button variant="outline" disabled={saving || !!error} onClick={() => setConfirmBasis(linked ? "estimate" : "allocation")}>{linked ? "입력한 예상원가로 되돌리기" : "LME 배정 기준 적용"}</Button>}
      {confirmBasis && <div className="space-y-2 rounded-xl bg-blue-50 p-3 text-sm">
        <p>{confirmBasis === "allocation" ? `AL 원가를 현재 배정 ${kg(summary.totalAllocatedTons * 1000)} · ${formatKrw(currentCost)} 기준으로 연결합니다. 이후에는 조회 시점의 최신 배정으로 계산합니다.` : "보존된 예상 내역의 현재 입력값으로 원가를 계산합니다."}</p>
        <div className="flex gap-2"><Button variant="primary" disabled={saving || !!error} onClick={() => void apply()}>{saving ? "적용 중…" : "확인 후 적용"}</Button><Button variant="ghost" disabled={saving} onClick={() => setConfirmBasis(null)}>취소</Button></div>
      </div>}
    </>}
  </section>;
}
