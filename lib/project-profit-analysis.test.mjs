import assert from "node:assert/strict";
import test from "node:test";
import { calculateProjectProfitAnalysis, calculateWeightedMaterialCostRate } from "./project-profit-analysis.ts";

test("공급가액 1억원, 원자재 원가 6천만원", () => {
  const result = calculateProjectProfitAnalysis({ finalSupplyAmountKrw: 100_000_000, expectedMaterialCostKrw: 60_000_000, hasOriginalContract: true, materialUsageCount: 1 });
  assert.equal(result.expected_material_margin_krw, 40_000_000); assert.equal(result.material_cost_rate, 60); assert.equal(result.material_margin_rate, 40); assert.equal(result.analysis_status, "normal");
});
test("원자재 원가가 공급가액보다 크면 loss", () => { const result = calculateProjectProfitAnalysis({ finalSupplyAmountKrw: 100_000_000, expectedMaterialCostKrw: 120_000_000, hasOriginalContract: true, materialUsageCount: 1 }); assert.equal(result.expected_material_margin_krw, -20_000_000); assert.equal(result.calculation_status, "negative_margin"); assert.equal(result.analysis_status, "loss"); });
test("계약 없음", () => { assert.equal(calculateProjectProfitAnalysis({ finalSupplyAmountKrw: null, expectedMaterialCostKrw: 10, hasOriginalContract: false, materialUsageCount: 1 }).calculation_status, "missing_contract"); });
test("원가 없음", () => { assert.equal(calculateProjectProfitAnalysis({ finalSupplyAmountKrw: 100, expectedMaterialCostKrw: null, hasOriginalContract: true, materialUsageCount: 0 }).calculation_status, "missing_material_cost"); });
test("최종 공급가액 0원", () => { assert.equal(calculateProjectProfitAnalysis({ finalSupplyAmountKrw: 0, expectedMaterialCostKrw: 10, hasOriginalContract: true, materialUsageCount: 1 }).calculation_status, "zero_revenue"); });
test("가중 원자재 원가율", () => { const first = calculateProjectProfitAnalysis({ finalSupplyAmountKrw: 100, expectedMaterialCostKrw: 50, hasOriginalContract: true, materialUsageCount: 1 }); const second = calculateProjectProfitAnalysis({ finalSupplyAmountKrw: 300, expectedMaterialCostKrw: 225, hasOriginalContract: true, materialUsageCount: 1 }); assert.equal(calculateWeightedMaterialCostRate([first, second]), 68.75); });
