import assert from "node:assert/strict";
import test from "node:test";
import { calculateCoatingExpectedKrw, coatingPlanSummary, coatingSourceChanged, coatingUsedKg, type CoatingPlan, type CoatingSource } from "./coating-plans.ts";

const source: CoatingSource = {
  requestId: "request-1", groupId: "group-1", groupName: "문틀 1차", purchaseOrderNo: "PO-1",
  usageDate: "2026-10-16", orderedKg: 2000, plannedKg: 80, confirmedKg: 2000, allocatedKg: 2080, fingerprint: "original",
};
const plan: CoatingPlan = {
  id: "plan-1", project_id: 1, vendor_organization_id: 1, vendor_name: "도장업체", weight_basis: "allocated",
  pricing_unit: "kg", target_weight_kg: 1200, pricing_quantity: 1200, unit_price_krw: 1500,
  expected_amount_krw: 1800000, sources: [{ requestId: source.requestId, weightKg: 1200, snapshot: source }],
  memo: null, status: "active", version: 1, updated_at: "2026-10-16T00:00:00Z",
};

test("kg 단가와 m 단가 계산은 마지막에 원 단위로 반올림한다", () => {
  assert.equal(calculateCoatingExpectedKrw(2000, 1500), 3000000);
  assert.equal(calculateCoatingExpectedKrw(12.345, 1234.56), 15241);
  assert.equal(calculateCoatingExpectedKrw(0.3, 5), 2);
  assert.equal(calculateCoatingExpectedKrw(0.299, 5), 1);
});

test("빈 값, 음수, 비정상 값과 안전 범위 밖 금액은 계산하지 않는다", () => {
  for (const [quantity, price] of [[0, 10], [-1, 10], [10, 0], [NaN, 10], [10, Infinity], [1e14, 1e14], [0.001, 0.01]]) {
    assert.equal(calculateCoatingExpectedKrw(quantity, price), null);
  }
});

test("잔량 산정에서는 취소 배정과 현재 수정 중인 배정을 제외한다", () => {
  const other = { ...plan, id: "plan-2", sources: [{ requestId: source.requestId, weightKg: 300, snapshot: source }] };
  const cancelled = { ...plan, id: "plan-3", status: "cancelled" as const };
  assert.equal(coatingUsedKg([plan, other, cancelled], source.requestId), 1500);
  assert.equal(coatingUsedKg([plan, other, cancelled], source.requestId, plan.id), 300);
  assert.equal(coatingUsedKg([plan], "another-request"), 0);
});

test("원본 변경 및 취소 감지는 저장된 중량과 금액을 수정하지 않는다", () => {
  assert.equal(coatingSourceChanged(plan, [source]), false);
  assert.equal(coatingSourceChanged(plan, [{ ...source, allocatedKg: 2100, fingerprint: "changed" }]), true);
  assert.equal(coatingSourceChanged(plan, []), true);
  assert.equal(plan.sources[0].snapshot.allocatedKg, 2080);
  assert.equal(plan.expected_amount_krw, 1800000);
});

test("발주·압출 배정·도장 배정 중량을 별도로 집계하고 실제원가와 중복 합산하지 않는다", () => {
  const result = coatingPlanSummary({ sources: [source], plans: [plan, { ...plan, id: "cancelled", status: "cancelled" }], vendors: [], actualCostKrw: 2000000, canManage: false });
  assert.deepEqual(result, { orderedKg: 2000, allocatedKg: 2080, excludedKg: 0, remainingKg: 880, coatingKg: 1200, expectedKrw: 1800000 });
});
