export const MATERIAL_COST_RATE_THRESHOLDS = {
  favorableMax: 50,
  normalMax: 65,
  cautionMax: 80,
} as const;

export type ProfitCalculationStatus = "calculated" | "missing_contract" | "missing_material_cost" | "zero_revenue" | "negative_margin" | "unsafe_amount";
export type ProfitAnalysisStatus = "favorable" | "normal" | "caution" | "high_cost" | "loss";
export const PROFIT_CALCULATION_LABEL: Record<ProfitCalculationStatus, string> = { calculated: "계산 완료", missing_contract: "계약 미등록", missing_material_cost: "원가 미등록", zero_revenue: "공급가액 0원", negative_margin: "음수 마진", unsafe_amount: "금액 정밀도 확인 필요" };
export const PROFIT_ANALYSIS_LABEL: Record<ProfitAnalysisStatus, string> = { favorable: "양호", normal: "보통", caution: "주의", high_cost: "고원가", loss: "원자재 기준 적자" };

export type ProjectProfitAnalysis = {
  calculation_status: ProfitCalculationStatus;
  calculation_reason: string | null;
  final_supply_amount_krw: number | null;
  expected_material_cost_krw: number | null;
  expected_material_margin_krw: number | null;
  material_cost_rate: number | null;
  material_margin_rate: number | null;
  analysis_status: ProfitAnalysisStatus | null;
};

export function classifyMaterialCostRate(costRate: number, margin: number): ProfitAnalysisStatus {
  if (margin < 0) return "loss";
  if (costRate > MATERIAL_COST_RATE_THRESHOLDS.cautionMax) return "high_cost";
  if (costRate > MATERIAL_COST_RATE_THRESHOLDS.normalMax) return "caution";
  if (costRate > MATERIAL_COST_RATE_THRESHOLDS.favorableMax) return "normal";
  return "favorable";
}

export function calculateProjectProfitAnalysis(input: { finalSupplyAmountKrw: number | null; expectedMaterialCostKrw: number | null; hasOriginalContract: boolean; materialUsageCount: number; amountsAreSafe?: boolean }): ProjectProfitAnalysis {
  const base = { final_supply_amount_krw: input.finalSupplyAmountKrw, expected_material_cost_krw: input.expectedMaterialCostKrw, expected_material_margin_krw: null, material_cost_rate: null, material_margin_rate: null, analysis_status: null };
  if (input.amountsAreSafe === false) return { ...base, calculation_status: "unsafe_amount", calculation_reason: "JavaScript safe integer 범위를 벗어난 금액이 있어 정밀한 계산이 불가능합니다." };
  if (!input.hasOriginalContract || input.finalSupplyAmountKrw === null) return { ...base, final_supply_amount_krw: null, calculation_status: "missing_contract", calculation_reason: input.materialUsageCount ? "유효한 최초 계약이 없습니다." : "계약과 원자재 원가가 모두 없어 분석 준비 전입니다." };
  if (input.finalSupplyAmountKrw === 0) return { ...base, calculation_status: "zero_revenue", calculation_reason: "최종 공급가액이 0원이어서 비율을 계산할 수 없습니다." };
  if (input.materialUsageCount === 0 || input.expectedMaterialCostKrw === null) return { ...base, expected_material_cost_krw: null, calculation_status: "missing_material_cost", calculation_reason: "예상 원자재 원가가 등록되지 않았습니다." };
  const margin = input.finalSupplyAmountKrw - input.expectedMaterialCostKrw; const costRate = input.expectedMaterialCostKrw / input.finalSupplyAmountKrw * 100; const marginRate = margin / input.finalSupplyAmountKrw * 100; const analysisStatus = classifyMaterialCostRate(costRate, margin);
  return { ...base, expected_material_margin_krw: margin, material_cost_rate: costRate, material_margin_rate: marginRate, analysis_status: analysisStatus, calculation_status: margin < 0 ? "negative_margin" : "calculated", calculation_reason: margin < 0 ? "예상 원자재 원가가 최종 공급가액보다 큽니다." : null };
}

export function calculateWeightedMaterialCostRate(analyses: ProjectProfitAnalysis[]) {
  const calculated = analyses.filter((item) => (item.calculation_status === "calculated" || item.calculation_status === "negative_margin") && item.final_supply_amount_krw !== null && item.expected_material_cost_krw !== null);
  const revenue = calculated.reduce((sum, item) => sum + (item.final_supply_amount_krw ?? 0), 0); const cost = calculated.reduce((sum, item) => sum + (item.expected_material_cost_krw ?? 0), 0);
  return revenue > 0 && Number.isSafeInteger(revenue) && Number.isSafeInteger(cost) ? cost / revenue * 100 : null;
}
