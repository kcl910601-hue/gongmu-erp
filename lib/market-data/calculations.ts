import type { CalculatedMarketValue } from "./types.ts";

export function calculateDomesticLmeValue(lmeUsdPerTon: number | null | undefined, exchangeRateKrwPerUsd: number | null | undefined): CalculatedMarketValue {
  if (lmeUsdPerTon === null || lmeUsdPerTon === undefined) return { status: "missing_lme_price" };
  if (exchangeRateKrwPerUsd === null || exchangeRateKrwPerUsd === undefined) return { status: "missing_exchange_rate" };
  if (!Number.isFinite(lmeUsdPerTon) || !Number.isFinite(exchangeRateKrwPerUsd) || lmeUsdPerTon <= 0 || exchangeRateKrwPerUsd <= 0) return { status: "invalid_value" };
  const value = lmeUsdPerTon * exchangeRateKrwPerUsd / 1000;
  return Number.isFinite(value) && value > 0 ? { status: "calculated", value } : { status: "invalid_value" };
}
