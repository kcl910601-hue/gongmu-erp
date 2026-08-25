import assert from "node:assert/strict";
import test from "node:test";
import { calculateAccessoryCost, validateAccessoryQuantity } from "./accessories.ts";

test("국내 직접단가와 EA 수량의 원가를 계산한다", () => {
  assert.deepEqual(calculateAccessoryCost({ quantity: 500, unitPrice: 2300, priceBasis: "KRW_DIRECT" }), { krwUnitPrice: 2300, totalCostKrw: 1_150_000 });
});
test("USD 단가를 원화 단가부터 반올림한 뒤 총원가를 계산한다", () => {
  assert.deepEqual(calculateAccessoryCost({ quantity: 500, unitPrice: 1.85, priceBasis: "FOREIGN_CURRENCY", exchangeRate: 1390 }), { krwUnitPrice: 2572, totalCostKrw: 1_286_000 });
});
test("수입품도 KRW 직접단가 계산을 지원한다", () => {
  assert.equal(calculateAccessoryCost({ quantity: 500, unitPrice: 2780, priceBasis: "KRW_DIRECT" }).totalCostKrw, 1_390_000);
});
test("M은 소수 수량, EA와 SET은 정수 수량만 허용한다", () => {
  assert.equal(validateAccessoryQuantity("M", 2.35), true);
  assert.equal(validateAccessoryQuantity("EA", 2.35), false);
  assert.equal(validateAccessoryQuantity("SET", 2), true);
});
test("외화 방식은 환율 Snapshot을 요구한다", () => {
  assert.throws(() => calculateAccessoryCost({ quantity: 1, unitPrice: 1.85, priceBasis: "FOREIGN_CURRENCY" }), /환율/);
});
test("계산 결과는 입력 Snapshot으로 고정된다", () => {
  const oldUsage = calculateAccessoryCost({ quantity: 500, unitPrice: 2300, priceBasis: "KRW_DIRECT" });
  const newUsage = calculateAccessoryCost({ quantity: 500, unitPrice: 2450, priceBasis: "KRW_DIRECT" });
  assert.equal(oldUsage.totalCostKrw, 1_150_000);
  assert.equal(newUsage.totalCostKrw, 1_225_000);
});
