export const MARKET_DATA_TYPES = {
  LME_SPOT: "lme_spot",
  EXCHANGE_RATE: "exchange_rate",
  METAL_PREMIUM: "metal_premium",
  COMMODITY_PRICE: "commodity_price",
} as const;
export type MarketDataType = (typeof MARKET_DATA_TYPES)[keyof typeof MARKET_DATA_TYPES];

export const MARKET_DATA_PROVIDERS = { LME: "lme", EXCHANGE_RATE: "exchange_rate" } as const;
export type MarketDataProviderCode = (typeof MARKET_DATA_PROVIDERS)[keyof typeof MARKET_DATA_PROVIDERS];
export type MarketDataSyncMode = "initial" | "incremental";

export type MarketDataValidation = { valid: true } | { valid: false; reason: string };
export type ProviderFetchResult = { pageNumber: number; sourceUrl: string; payload: string };
export type ProviderParseResult<TRecord> = { records: TRecord[]; oldestDate: string; latestDate: string };

export interface MarketDataProvider<TRecord extends { referenceDate: string }> {
  readonly providerCode: MarketDataProviderCode;
  readonly sourceName: string;
  readonly dataType: MarketDataType;
  fetchPage(pageNumber: number): Promise<ProviderFetchResult>;
  parse(payload: string): ProviderParseResult<TRecord>;
  validate(record: TRecord): MarketDataValidation;
  getUniqueKey(record: TRecord): string;
  getComparableValue(record: TRecord): number;
}

export type ExchangeRateRecord = {
  referenceDate: string;
  baseCurrency: "USD";
  quoteCurrency: "KRW";
  rate: number;
  sourceName: string;
  sourceUrl?: string;
  fetchedAt: string;
};

export type CalculatedMarketValue =
  | { status: "calculated"; value: number }
  | { status: "missing_exchange_rate" }
  | { status: "missing_lme_price" }
  | { status: "invalid_value" };
