import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseFactoryMaterialRequestInput } from "./factory-material-request.ts";

const factoryRpcSql = readFileSync(new URL("../supabase/migrations/20260904100000_create_unallocated_factory_material_usage_request.sql", import.meta.url), "utf8");

test("공장재고 발주 kg를 request-only RPC용 ton payload로 변환한다", () => {
  assert.deepEqual(parseFactoryMaterialRequestInput({ quantityKg: 5_000, usageDate: "2026-09-04", purchaseOrderNo: " F-1 ", memo: " test " }), {
    data: { quantityTons: 5, usageDate: "2026-09-04", purchaseOrderNo: "F-1", memo: "test" }, error: null,
  });
});

test("공장재고 발주의 수량 정밀도와 날짜 및 텍스트 길이를 검증한다", () => {
  assert.equal(parseFactoryMaterialRequestInput({ quantityKg: 0, usageDate: "2026-09-04" }).data, null);
  assert.equal(parseFactoryMaterialRequestInput({ quantityKg: 1.11, usageDate: "2026-09-04" }).data, null);
  assert.equal(parseFactoryMaterialRequestInput({ quantityKg: 1, usageDate: "09/04/2026" }).data, null);
  assert.equal(parseFactoryMaterialRequestInput({ quantityKg: 1, usageDate: "2026-09-04", purchaseOrderNo: "x".repeat(101) }).data, null);
});

test("Factory request-only RPC는 canonical factory row만 생성한다", () => {
  assert.match(factoryRpcSql, /'AL', 'factory', null, null, p_quantity_tons/);
  assert.doesNotMatch(factoryRpcSql, /insert into public\.material_contract_allocations/i);
  assert.doesNotMatch(factoryRpcSql, /insert into public\.raw_material_contracts/i);
});

test("Factory request-only RPC는 승인된 활성 Admin과 AL 및 수량을 검증한다", () => {
  assert.match(factoryRpcSql, /security definer/i);
  assert.match(factoryRpcSql, /active = true and approval_status = 'approved'/);
  assert.match(factoryRpcSql, /v_employee\.role <> 'admin'/);
  assert.match(factoryRpcSql, /upper\(btrim\(coalesce\(p_material_code, ''\)\)\) <> 'AL'/);
  assert.match(factoryRpcSql, /p_quantity_tons <= 0/);
});
