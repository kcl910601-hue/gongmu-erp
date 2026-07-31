export const LME_SOURCE_URL = "https://www.nonferrous.or.kr/stats/?act=sub3";

export const LME_STATUS_RULES = {
  favorableMax: 0,
  normalMax: 3,
  cautionMax: 7,
} as const;

export type LmeStatus = "favorable" | "normal" | "caution" | "high";

export type LmeRecord = {
  id: string;
  reference_date: string;
  reference_month: string;
  round: 1 | 2;
  supplier_id: string;
  supplier_name: string | null;
  lme_al_usd_per_ton: number;
  exchange_rate_krw_per_usd: number;
  domestic_lme_krw_per_kg: number;
  processing_cost_krw_per_kg: number;
  standard_cost_krw_per_kg: number;
  applied_price_krw_per_kg: number;
  difference_krw_per_kg: number;
  difference_rate: number;
  status: LmeStatus;
  effective_start_date: string | null;
  effective_end_date: string | null;
  quantity_ton: number | null;
  source_url: string;
  memo: string | null;
  created_by: string | null;
  created_by_name: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  revision: number;
  supersedes_id: string | null;
  is_current: boolean;
};

export type LmeInput = {
  referenceDate: string;
  round: 1 | 2;
  supplierId: string;
  lmeAlUsdPerTon: number;
  exchangeRateKrwPerUsd: number;
  processingCostKrwPerKg: number;
  appliedPriceKrwPerKg: number;
  effectiveStartDate: string;
  effectiveEndDate: string;
  quantityTon: number | null;
  sourceUrl: string;
  memo: string;
};

export function calculateLmeValues(input: Pick<LmeInput, "lmeAlUsdPerTon" | "exchangeRateKrwPerUsd" | "processingCostKrwPerKg" | "appliedPriceKrwPerKg">) {
  const domesticLme = input.lmeAlUsdPerTon * input.exchangeRateKrwPerUsd / 1000;
  const standardCost = domesticLme + input.processingCostKrwPerKg;
  const difference = input.appliedPriceKrwPerKg - standardCost;
  const differenceRate = standardCost === 0 ? 0 : difference / standardCost * 100;
  const status: LmeStatus = differenceRate <= LME_STATUS_RULES.favorableMax
    ? "favorable"
    : differenceRate <= LME_STATUS_RULES.normalMax
      ? "normal"
      : differenceRate <= LME_STATUS_RULES.cautionMax
        ? "caution"
        : "high";
  return { domesticLme, standardCost, difference, differenceRate, status };
}

export const LME_STATUS_PRESENTATION: Record<LmeStatus, { label: string; className: string }> = {
  favorable: { label: "유리", className: "bg-emerald-100 text-emerald-700" },
  normal: { label: "정상", className: "bg-blue-100 text-blue-700" },
  caution: { label: "주의", className: "bg-amber-100 text-amber-700" },
  high: { label: "높음", className: "bg-red-100 text-red-700" },
};

export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
