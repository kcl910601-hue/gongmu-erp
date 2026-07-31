import { MARKET_DATA_PROVIDERS, type MarketDataProviderCode } from "../types.ts";
import { lmeMarketDataProvider } from "./lme-provider.ts";
import { exchangeRateProvider } from "./exchange-rate-provider.ts";

export function getMarketDataProvider(providerCode: MarketDataProviderCode) {
  if (providerCode === MARKET_DATA_PROVIDERS.LME) return lmeMarketDataProvider;
  if (providerCode === MARKET_DATA_PROVIDERS.EXCHANGE_RATE) return exchangeRateProvider;
  throw new Error(`지원하지 않는 Market Data Provider입니다: ${providerCode}`);
}
