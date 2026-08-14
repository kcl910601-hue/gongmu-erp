import assert from "node:assert/strict";
import test from "node:test";
import { buildMaterialUsageAllocationPreview, calculateUnallocatedTons, canReduceMaterialUsageQuantity, getMaterialUsageAllocationState, normalizeOptionalMaterialUsageText, summarizeUnallocatedUsageRequests } from "./material-usage-requests.ts";

test("사용요청 선택 입력값은 바깥 공백만 제거하고 빈 값은 null로 정규화한다", () => {
  assert.equal(normalizeOptionalMaterialUsageText("   "), null);
  assert.equal(normalizeOptionalMaterialUsageText(" PO-2026/08 #A-1 "), "PO-2026/08 #A-1");
  assert.equal(normalizeOptionalMaterialUsageText("  첫 줄\n둘째 줄  "), "첫 줄\n둘째 줄");
});
test("요청량은 현재 배정량과 같거나 큰 값으로만 변경한다", () => {
  assert.equal(canReduceMaterialUsageQuantity(20, 20), true);
  assert.equal(canReduceMaterialUsageQuantity(19.9999, 20), false);
  assert.equal(canReduceMaterialUsageQuantity(30, 20), true);
});
test("활성 미배정 요청만 건수와 총량에 포함한다", () => {
  assert.deepEqual(summarizeUnallocatedUsageRequests([{ status: "active", unallocated_tons: 10 }, { status: "active", unallocated_tons: 0 }, { status: "cancelled", unallocated_tons: 20 }]), { count: 1, totalTons: 10 });
});

test("잔여 50t 계약에 요청 20t를 전량 배정한다", () => { const result = buildMaterialUsageAllocationPreview(20, [{ id: "A", availableTons: 50, priceKrwPerKg: 3400, effectiveStartDate: "2026-01-01" }]); assert.deepEqual(result, { allocations: [{ contractId: "A", quantityTons: 20, priceKrwPerKg: 3400, amountKrw: 68000000 }], allocatedTons: 20, unallocatedTons: 0, estimatedCostKrw: 68000000 }); });
test("A10+B15와 A10+B10+C5로 계약을 순차 분할한다", () => { const candidates = [{ id: "A", availableTons: 10, priceKrwPerKg: 3400, effectiveStartDate: "2026-01-01" }, { id: "B", availableTons: 15, priceKrwPerKg: 3600, effectiveStartDate: "2026-02-01" }]; assert.deepEqual(buildMaterialUsageAllocationPreview(25, candidates).allocations.map((row) => row.quantityTons), [10, 15]); assert.deepEqual(buildMaterialUsageAllocationPreview(25, [...candidates.slice(0,1), { ...candidates[1], availableTons: 10 }, { id: "C", availableTons: 5, priceKrwPerKg: 3500, effectiveStartDate: "2026-03-01" }]).allocations.map((row) => row.quantityTons), [10,10,5]); });
test("모든 계약이 부족하면 미배정량을 보존한다", () => { const result = buildMaterialUsageAllocationPreview(25, [{ id: "A", availableTons: 10, priceKrwPerKg: 3400, effectiveStartDate: "2026-01-01" }]); assert.equal(result.unallocatedTons, 15); assert.equal(getMaterialUsageAllocationState(25, 10), "partially_allocated"); });
test("취소 allocation은 배정량에서 제외되어 미배정으로 복귀한다", () => { assert.equal(calculateUnallocatedTons(25, [{ quantityTons: 10, status: "planned" }, { quantityTons: 15, status: "cancelled" }]), 15); assert.equal(getMaterialUsageAllocationState(25, 0), "unallocated"); });
