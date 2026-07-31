import assert from "node:assert/strict";
import test from "node:test";
import { buildContractAllocationSummaryMap, calculateContractAllocationSummary, type ContractAllocationRow } from "./material-contract-allocations.ts";
import { parseMaterialContractAllocationInput } from "./material-contract-allocation-input.ts";

test("zero allocations preserves the full contract quantity", () => {
  assert.deepEqual(calculateContractAllocationSummary(100, []), { contractQuantityTons: 100, plannedTons: 0, confirmedTons: 0, cancelledTons: 0, remainingTons: 100, availableTons: 100 });
});

test("statuses are aggregated and cancelled rows do not reduce balances", () => {
  const rows: ContractAllocationRow[] = [
    { contract_id: "a", quantity_tons: 12.25, status: "planned" },
    { contract_id: "a", quantity_tons: "30.125", status: "confirmed" },
    { contract_id: "a", quantity_tons: 9, status: "cancelled" },
  ];
  assert.deepEqual(calculateContractAllocationSummary(100, rows), { contractQuantityTons: 100, plannedTons: 12.25, confirmedTons: 30.125, cancelledTons: 9, remainingTons: 69.875, availableTons: 57.625 });
});

test("over-allocation is visible as a negative quantity", () => {
  const summary = calculateContractAllocationSummary(10, [
    { contract_id: "a", quantity_tons: 8, status: "confirmed" },
    { contract_id: "a", quantity_tons: 4, status: "planned" },
  ]);
  assert.equal(summary.remainingTons, 2);
  assert.equal(summary.availableTons, -2);
});

test("decimal noise is normalized to four quantity decimals", () => {
  const summary = calculateContractAllocationSummary(0.3, [
    { contract_id: "a", quantity_tons: 0.1, status: "confirmed" },
    { contract_id: "a", quantity_tons: 0.2, status: "confirmed" },
  ]);
  assert.equal(summary.remainingTons, 0);
});

test("batch summaries isolate multiple contracts", () => {
  const summaries = buildContractAllocationSummaryMap(
    [{ id: "a", contract_quantity_ton: 10 }, { id: "b", contract_quantity_ton: 20 }],
    [{ contract_id: "a", quantity_tons: 2, status: "confirmed" }, { contract_id: "b", quantity_tons: 3, status: "planned" }],
  );
  assert.equal(summaries.get("a")?.remainingTons, 8);
  assert.equal(summaries.get("b")?.availableTons, 17);
});

test("allocation input accepts planned and confirmed with four decimal precision", () => {
  for (const status of ["planned", "confirmed"]) {
    const result = parseMaterialContractAllocationInput({ allocationType: "project", projectId: 12, quantityTons: "10.1234", allocationDate: "2026-07-31", status, purchaseOrderNo: " PO-1 ", memo: " memo " });
    assert.equal(result.error, null);
    assert.equal(result.data?.quantityTons, 10.1234);
    assert.equal(result.data?.purchaseOrderNo, "PO-1");
  }
});

test("allocation input rejects empty, zero, negative, excess precision and cancelled", () => {
  for (const quantityTons of ["", 0, -1, "1.00001"]) {
    assert.equal(parseMaterialContractAllocationInput({ allocationType: "project", projectId: 1, quantityTons, allocationDate: "2026-07-31", status: "planned" }).data, null);
  }
  assert.equal(parseMaterialContractAllocationInput({ allocationType: "project", projectId: 1, quantityTons: 1, allocationDate: "2026-07-31", status: "cancelled" }).data, null);
});

test("factory, A/S, sample and etc require a destination and reject project ids", () => {
  for (const allocationType of ["factory", "as", "sample", "etc"]) {
    const valid = parseMaterialContractAllocationInput({ allocationType, projectId: null, destinationName: "본사 사용처", quantityTons: 1, allocationDate: "2026-07-31", status: "planned" });
    assert.equal(valid.error, null);
    assert.equal(valid.data?.projectId, null);
    assert.equal(parseMaterialContractAllocationInput({ allocationType, projectId: null, destinationName: "", quantityTons: 1, allocationDate: "2026-07-31", status: "planned" }).data, null);
    assert.equal(parseMaterialContractAllocationInput({ allocationType, projectId: 3, destinationName: "본사 사용처", quantityTons: 1, allocationDate: "2026-07-31", status: "planned" }).data, null);
  }
});

test("project allocation requires a project and ignores destination names", () => {
  assert.equal(parseMaterialContractAllocationInput({ allocationType: "project", projectId: null, quantityTons: 1, allocationDate: "2026-07-31", status: "planned" }).data, null);
  const result = parseMaterialContractAllocationInput({ allocationType: "project", projectId: 7, destinationName: "제거대상", quantityTons: 1, allocationDate: "2026-07-31", status: "confirmed" });
  assert.equal(result.data?.destinationName, null);
});

test("excluding an edited allocation restores its quantity to the maximum", () => {
  const existingWithoutTarget = calculateContractAllocationSummary(100, [
    { contract_id: "a", quantity_tons: 70, status: "confirmed" },
  ]);
  assert.equal(existingWithoutTarget.availableTons, 30);
  assert.equal(existingWithoutTarget.availableTons + 20, 50);
});
