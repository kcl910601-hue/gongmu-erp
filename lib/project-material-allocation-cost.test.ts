import assert from "node:assert/strict";
import test from "node:test";
import { calculateMaterialAllocationAmountKrw, summarizeProjectMaterialAllocationCosts, summarizeProjectMaterialOrderStatus } from "./project-material-allocation-cost.ts";

test("톤을 kg으로 환산해 현재 계약 단가 원가를 계산한다", () => {
  assert.equal(calculateMaterialAllocationAmountKrw(4.67, 1250), 5_837_500);
});

test("예정과 확정을 분리하고 공장 재고와 취소를 제외한다", () => {
  const summary = summarizeProjectMaterialAllocationCosts([
    { allocation_type: "project", status: "planned", quantity_tons: 1, contract_price_krw_per_kg: 1000 },
    { allocation_type: "project", status: "confirmed", quantity_tons: 2, contract_price_krw_per_kg: 1200 },
    { allocation_type: "factory", status: "confirmed", quantity_tons: 3, contract_price_krw_per_kg: 1000 },
    { allocation_type: "project", status: "cancelled", quantity_tons: 1, contract_price_krw_per_kg: 1000 },
  ]);
  assert.deepEqual(summary, { plannedTons: 1, confirmedTons: 2, totalAllocatedTons: 3, plannedCostKrw: 1_000_000, confirmedCostKrw: 2_400_000 });
});

test("예정에서 확정으로 이동해도 중복 합산하지 않는다", () => {
  const planned = summarizeProjectMaterialAllocationCosts([{ allocation_type: "project", status: "planned", quantity_tons: 1.25, contract_price_krw_per_kg: 1000 }]);
  const confirmed = summarizeProjectMaterialAllocationCosts([{ allocation_type: "project", status: "confirmed", quantity_tons: 1.25, contract_price_krw_per_kg: 1000 }]);
  assert.equal(planned.plannedCostKrw, 1_250_000); assert.equal(planned.confirmedCostKrw, 0);
  assert.equal(confirmed.plannedCostKrw, 0); assert.equal(confirmed.confirmedCostKrw, 1_250_000);
});

test("AL 발주량과 예정·확정 배정을 KPI 기준으로 집계한다", () => {
  const requests = [{ id: "request-a", material_code: "AL", status: "active" as const, quantity_tons: 10, unallocated_tons: 1.5 }];
  const allocations = [
    { usage_request_id: "request-a", status: "planned" as const, quantity_tons: 2.5 },
    { usage_request_id: "request-a", status: "confirmed" as const, quantity_tons: 6 },
    { usage_request_id: "request-a", status: "cancelled" as const, quantity_tons: 1.5 },
  ];
  assert.deepEqual(summarizeProjectMaterialOrderStatus(requests, allocations), { requestedTons: 10, plannedTons: 2.5, confirmedTons: 6, allocatedTons: 8.5, unallocatedTons: 1.5, allocationRate: 85 });
});

test("0 발주와 legacy allocation은 배정률 계산에 포함하지 않는다", () => {
  assert.deepEqual(summarizeProjectMaterialOrderStatus([], [{ usage_request_id: null, status: "confirmed", quantity_tons: 10 }]), { requestedTons: 0, plannedTons: 0, confirmedTons: 0, allocatedTons: 0, unallocatedTons: 0, allocationRate: 0 });
});
