import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatMaterialAllocationAuditChange, type MaterialAllocationAuditMetadata } from "./material-allocation-audit.ts";
import { formatMaterialUsageRequestAllocationHistory } from "./material-contract-allocations.ts";

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

test("직접단가 배정 이력은 UUID를 bigint target_id에 저장하지 않는다", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260904150000_fix_direct_price_allocation_activity.sql", import.meta.url), "utf8");
  assert.match(sql, /record_material_allocation_activity\(null,v_result\.id/);
  assert.doesNotMatch(sql, /activity_logs\([\s\S]*target_id[^;]*v_result\.id/);
});

test("사용요청 History는 canonical RPC를 사용한다", () => {
  const route = readFileSync(new URL("../app/api/statistics/lme/usage-requests/[id]/route.ts", import.meta.url), "utf8");
  assert.match(route, /rpc\("get_material_usage_request_history"/);
  assert.doesNotMatch(route, /\.contains\("metadata"/);
});

test("사용요청 History는 직접단가와 계약의 수량 및 적용단가를 구분한다", () => {
  assert.equal(formatMaterialUsageRequestAllocationHistory({ after: {
    source_type: "direct_price", quantity_tons: 4, applied_unit_price_krw_per_kg: 4350,
  } }), "직접단가 · 4,000kg · 4,350원/kg");
  assert.equal(formatMaterialUsageRequestAllocationHistory({ after: {
    source_type: "contract", quantity_tons: 6, applied_unit_price_krw_per_kg: 6100,
  } }), "계약 · 6,000kg · 6,100원/kg");
});
