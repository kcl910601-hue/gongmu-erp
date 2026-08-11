import assert from "node:assert/strict";
import test from "node:test";
import { formatMaterialAllocationAuditChange, type MaterialAllocationAuditMetadata } from "./material-allocation-audit.ts";

const metadata = (before: string | null, after: string | null): MaterialAllocationAuditMetadata => ({
  material_contract_id: "contract-1", allocation_id: "allocation-1", field: "status", field_label: "상태",
  before: before, after: after, before_display: before, after_display: after,
});

test("감사 이력은 변경 전후 값을 화살표로 표시한다", () => {
  assert.equal(formatMaterialAllocationAuditChange(metadata("예정", "확정")), "예정 → 확정");
});

test("신규 또는 단일 값 이력은 존재하는 값만 표시한다", () => {
  assert.equal(formatMaterialAllocationAuditChange(metadata(null, "공장 재고 · 1.0000t")), "공장 재고 · 1.0000t");
});
