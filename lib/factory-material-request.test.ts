import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseFactoryMaterialRequestInput } from "./factory-material-request.ts";

const factoryRpcSql = readFileSync(new URL("../supabase/migrations/20260904100000_create_unallocated_factory_material_usage_request.sql", import.meta.url), "utf8");
const splitFactoryRpcSql = readFileSync(new URL("../supabase/migrations/20260908113000_split_factory_material_request_destinations.sql", import.meta.url), "utf8");

test("공장재고 발주 kg를 request-only RPC용 ton payload로 변환한다", () => {
  assert.deepEqual(parseFactoryMaterialRequestInput({ destinationName: "공장재고-중문", quantityKg: 5_000, usageDate: "2026-09-04", purchaseOrderNo: " F-1 ", memo: " test " }), {
    data: { destinationName: "공장재고-중문", quantityTons: 5, usageDate: "2026-09-04", purchaseOrderNo: "F-1", memo: "test" }, error: null,
  });
  assert.equal(parseFactoryMaterialRequestInput({ destinationName: "공장재고-기타", quantityKg: 1, usageDate: "2026-09-04" }).data, null);
});

test("공장재고 발주의 수량 정밀도와 날짜 및 텍스트 길이를 검증한다", () => {
  assert.equal(parseFactoryMaterialRequestInput({ destinationName: "공장재고-자동문", quantityKg: 0, usageDate: "2026-09-04" }).data, null);
  assert.equal(parseFactoryMaterialRequestInput({ destinationName: "공장재고-자동문", quantityKg: 1.11, usageDate: "2026-09-04" }).data, null);
  assert.equal(parseFactoryMaterialRequestInput({ destinationName: "공장재고-자동문", quantityKg: 1, usageDate: "09/04/2026" }).data, null);
  assert.equal(parseFactoryMaterialRequestInput({ destinationName: "공장재고-자동문", quantityKg: 1, usageDate: "2026-09-04", purchaseOrderNo: "x".repeat(101) }).data, null);
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

test("Factory destination RPC는 중문과 자동문만 저장한다", () => {
  assert.match(splitFactoryRpcSql, /create_unallocated_factory_material_usage_request_v2/);
  assert.match(splitFactoryRpcSql, /'공장재고-중문', '공장재고-자동문'/);
  assert.match(splitFactoryRpcSql, /'AL', 'factory', null, p_destination_name, p_quantity_tons/);
});
