import assert from "node:assert/strict";
import test from "node:test";
import { calculateMaterialAllocationAmountKrw, summarizeProjectMaterialAllocationCosts, summarizeProjectMaterialOrderStatus } from "./project-material-allocation-cost.ts";

test("톤을 kg으로 환산해 적용단가 snapshot 원가를 계산한다", () => {
  assert.equal(calculateMaterialAllocationAmountKrw(4.67, 1250), 5_837_500);
});

test("예정과 확정을 분리하고 공장 재고와 취소를 제외한다", () => {
  const summary = summarizeProjectMaterialAllocationCosts([
    { allocation_type: "project", status: "planned", quantity_tons: 1, applied_unit_price_krw_per_kg: 1000 },
    { allocation_type: "project", status: "confirmed", quantity_tons: 2, applied_unit_price_krw_per_kg: 1200 },
    { allocation_type: "factory", status: "confirmed", quantity_tons: 3, applied_unit_price_krw_per_kg: 1000 },
    { allocation_type: "project", status: "cancelled", quantity_tons: 1, applied_unit_price_krw_per_kg: 1000 },
  ]);
  assert.deepEqual(summary, { plannedTons: 1, confirmedTons: 2, totalAllocatedTons: 3, plannedCostKrw: 1_000_000, confirmedCostKrw: 2_400_000 });
});

test("예정에서 확정으로 이동해도 중복 합산하지 않는다", () => {
  const planned = summarizeProjectMaterialAllocationCosts([{ allocation_type: "project", status: "planned", quantity_tons: 1.25, applied_unit_price_krw_per_kg: 1000 }]);
  const confirmed = summarizeProjectMaterialAllocationCosts([{ allocation_type: "project", status: "confirmed", quantity_tons: 1.25, applied_unit_price_krw_per_kg: 1000 }]);
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
  assert.deepEqual(summarizeProjectMaterialOrderStatus(requests, allocations), { requestedTons: 10, plannedTons: 2.5, confirmedTons: 6, allocatedTons: 8.5, unallocatedTons: 1.5, excessTons: 0, allocationRate: 85 });
});

test("0 발주와 legacy allocation은 배정률 계산에 포함하지 않는다", () => {
  assert.deepEqual(summarizeProjectMaterialOrderStatus([], [{ usage_request_id: null, status: "confirmed", quantity_tons: 10 }]), { requestedTons: 0, plannedTons: 0, confirmedTons: 0, allocatedTons: 0, unallocatedTons: 0, excessTons: 0, allocationRate: 0 });
});

test("프로젝트 초과 배정은 미배정 0, 초과량과 100% 이상 배정률을 보존한다", () => {
  const requests = [{ id: "request-a", material_code: "AL", status: "active" as const, quantity_tons: 10, unallocated_tons: 0 }];
  const allocations = [{ usage_request_id: "request-a", status: "confirmed" as const, quantity_tons: 10.35 }];
  assert.deepEqual(summarizeProjectMaterialOrderStatus(requests, allocations), { requestedTons: 10, plannedTons: 0, confirmedTons: 10.35, allocatedTons: 10.35, unallocatedTons: 0, excessTons: 0.35, allocationRate: 103.5 });
});

test("계약과 직접단가 snapshot을 혼합하고 초과 물량도 원가에 포함한다", () => {
  const summary = summarizeProjectMaterialAllocationCosts([
    { allocation_type: "project", status: "confirmed", quantity_tons: 6, applied_unit_price_krw_per_kg: 4100 },
    { allocation_type: "project", status: "confirmed", quantity_tons: 4.35, applied_unit_price_krw_per_kg: 4350 },
  ]);
  assert.equal(summary.confirmedCostKrw, 43_522_500);
  assert.equal(summary.totalAllocatedTons, 10.35);
});
