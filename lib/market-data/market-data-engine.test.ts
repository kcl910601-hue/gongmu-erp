import assert from "node:assert/strict";
import test from "node:test";
import { calculateDomesticLmeValue } from "./calculations.ts";
import { lmeMarketDataProvider } from "./providers/lme-provider.ts";
import { getMarketDataProvider } from "./providers/registry.ts";
import { syncMarketData } from "./sync-engine.ts";
import { MARKET_DATA_PROVIDERS, type MarketDataProvider, type MarketDataProviderCode } from "./types.ts";
import type { ExistingMarketData, MarketDataRepository, SyncRunActor } from "./repository.ts";

type RecordRow = { referenceDate: string; value: number };
const actor: SyncRunActor = { triggerSource: "admin", userId: "user", userName: "관리자" };

class FixtureProvider implements MarketDataProvider<RecordRow> {
  readonly providerCode = MARKET_DATA_PROVIDERS.LME; readonly sourceName = "fixture"; readonly dataType = "lme_spot" as const;
  private readonly pages: Record<number, RecordRow[]>;
  constructor(pages: Record<number, RecordRow[]>) { this.pages = pages; }
  async fetchPage(pageNumber: number) { return { pageNumber, sourceUrl: `fixture:${pageNumber}`, payload: String(pageNumber) }; }
  parse(payload: string) { const records = this.pages[Number(payload)] ?? []; const dates = records.map((row) => row.referenceDate).sort(); return { records, oldestDate: dates[0], latestDate: dates.at(-1) ?? dates[0] }; }
  validate(record: RecordRow) { return record.value > 0 ? { valid: true as const } : { valid: false as const, reason: "invalid" }; }
  getUniqueKey(record: RecordRow) { return record.referenceDate; } getComparableValue(record: RecordRow) { return record.value; }
}

class FixtureRepository implements MarketDataRepository<RecordRow> {
  inserted: RecordRow[] = []; completed: unknown = null; private readonly latest: string | null; private readonly existing: Map<string, ExistingMarketData>;
  constructor(latest: string | null, existing = new Map<string, ExistingMarketData>()) { this.latest = latest; this.existing = existing; }
  async acquireRun() { return { id: "run" }; } async getLatestReferenceDate() { return this.latest; }
  async findExisting() { return this.existing; } async insert(records: RecordRow[]) { this.inserted.push(...records); return records.length; }
  async completeRun(_runId: string, result: unknown) { this.completed = result; } async getStatus() { return { latestReferenceDate: this.latest, lastRun: null }; }
}

test("Provider registry는 LME를 선택하고 미지원 Provider를 거부한다", () => { assert.equal(getMarketDataProvider(MARKET_DATA_PROVIDERS.LME), lmeMarketDataProvider); assert.throws(() => getMarketDataProvider("unknown" as MarketDataProviderCode), /지원하지 않는/); });
test("LME Provider 파싱 결과는 기존 parser 결과와 동일하다", () => { const html = `<!doctype html><html><body><p>현물 US$/톤</p><table><tr><th>일자</th><th>품목</th></tr><tr><th>Cu</th><th>Al</th></tr><tr><td>2024. 02. 15</td><td>8,153.0</td><td>2,205.0</td></tr></table></body></html>`; assert.deepEqual(lmeMarketDataProvider.parse(html).records, [{ referenceDate: "2024-02-15", priceUsdPerTon: 2205 }]); });
test("최초 모드는 시작일 이전에서 중단하고 신규 행만 저장한다", async () => { const repository = new FixtureRepository(null); const result = await syncMarketData(new FixtureProvider({ 1: [{ referenceDate: "2024-01-02", value: 2 }, { referenceDate: "2023-12-29", value: 1 }] }), repository, { mode: "initial", actor, initialStartDate: "2024-01-01", requestDelayMs: 0 }); assert.equal(result.stoppedReason, "before_start_date"); assert.deepEqual(repository.inserted, [{ referenceDate: "2024-01-02", value: 2 }]); });
test("증분 모드는 최신 저장일에서 중단한다", async () => { const repository = new FixtureRepository("2024-01-02"); const result = await syncMarketData(new FixtureProvider({ 1: [{ referenceDate: "2024-01-03", value: 3 }, { referenceDate: "2024-01-02", value: 2 }] }), repository, { mode: "incremental", actor, initialStartDate: "2024-01-01", requestDelayMs: 0 }); assert.equal(result.stoppedReason, "latest_saved_date"); assert.equal(result.insertedRows, 1); });
test("Repository 결과를 신규·중복·충돌로 분류하고 응답 형식을 유지한다", async () => { const existing = new Map<string, ExistingMarketData>([["2024-01-03", { uniqueKey: "2024-01-03", comparableValue: 3 }], ["2024-01-04", { uniqueKey: "2024-01-04", comparableValue: 9 }]]); const repository = new FixtureRepository("2024-01-01", existing); const result = await syncMarketData(new FixtureProvider({ 1: [{ referenceDate: "2024-01-05", value: 5 }, { referenceDate: "2024-01-04", value: 4 }, { referenceDate: "2024-01-03", value: 3 }, { referenceDate: "2024-01-01", value: 1 }] }), repository, { mode: "incremental", actor, initialStartDate: "2024-01-01", requestDelayMs: 0 }); assert.equal(result.insertedRows, 1); assert.equal(result.skippedRows, 2); assert.equal(result.conflictRows.length, 1); for (const key of ["success","mode","scannedPages","parsedRows","insertedRows","skippedRows","invalidRows","conflictRows","latestSourceDate","stoppedReason","message"]) assert.ok(key in result); });
test("국내환산 계산은 누락과 잘못된 값을 구분한다", () => { assert.deepEqual(calculateDomesticLmeValue(2205, 1350), { status: "calculated", value: 2976.75 }); assert.deepEqual(calculateDomesticLmeValue(2205, null), { status: "missing_exchange_rate" }); assert.deepEqual(calculateDomesticLmeValue(null, 1350), { status: "missing_lme_price" }); assert.deepEqual(calculateDomesticLmeValue(0, 1350), { status: "invalid_value" }); assert.deepEqual(calculateDomesticLmeValue(2205, -1), { status: "invalid_value" }); });
