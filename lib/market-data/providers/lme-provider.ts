import { MARKET_DATA_PROVIDERS, MARKET_DATA_TYPES, type MarketDataProvider, type MarketDataValidation } from "../types.ts";
import { LME_SYNC_MATERIAL_CODE, LME_SYNC_SOURCE_NAME, LME_SYNC_SOURCE_URL, parseLmePage, type ParsedLmeRow } from "../../lme-sync-parser.ts";

const REQUEST_TIMEOUT_MS = 8_000;

function delay(milliseconds: number) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

export class LmeMarketDataProvider implements MarketDataProvider<ParsedLmeRow> {
  readonly providerCode = MARKET_DATA_PROVIDERS.LME;
  readonly sourceName = LME_SYNC_SOURCE_NAME;
  readonly dataType = MARKET_DATA_TYPES.LME_SPOT;
  readonly materialCode = LME_SYNC_MATERIAL_CODE;

  async fetchPage(pageNumber: number) {
    const sourceUrl = `${LME_SYNC_SOURCE_URL}&page=${pageNumber}`;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(sourceUrl, { headers: { "User-Agent": process.env.LME_SYNC_USER_AGENT || "Company-Gongmu-ERP/1.0", Accept: "text/html" }, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!response.ok) throw new Error(`협회 페이지 HTTP ${response.status}`);
        return { pageNumber, sourceUrl, payload: await response.text() };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("협회 페이지 요청에 실패했습니다.");
        if (attempt === 0) await delay(500);
      }
    }
    throw lastError ?? new Error("협회 페이지 요청에 실패했습니다.");
  }

  parse(payload: string) { const parsed = parseLmePage(payload); return { records: parsed.rows, oldestDate: parsed.oldestDate, latestDate: parsed.latestDate }; }
  validate(record: ParsedLmeRow): MarketDataValidation { return /^\d{4}-\d{2}-\d{2}$/.test(record.referenceDate) && Number.isFinite(record.priceUsdPerTon) && record.priceUsdPerTon > 0 ? { valid: true } : { valid: false, reason: "유효하지 않은 LME 일자 또는 가격입니다." }; }
  getUniqueKey(record: ParsedLmeRow) { return `${record.referenceDate}|${this.materialCode}|spot`; }
  getComparableValue(record: ParsedLmeRow) { return record.priceUsdPerTon; }
}

export const lmeMarketDataProvider = new LmeMarketDataProvider();
