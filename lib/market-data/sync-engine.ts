import { LmePageStructureError } from "../lme-sync-parser.ts";
import type { MarketDataProvider, MarketDataSyncMode } from "./types.ts";
import type { MarketDataRepository, SyncRunActor } from "./repository.ts";

export type MarketDataConflict = { referenceDate: string; existingPrice: number; sourcePrice: number };
export type MarketDataSyncResult = { success: boolean; mode: MarketDataSyncMode; scannedPages: number; parsedRows: number; insertedRows: number; skippedRows: number; invalidRows: number; conflictRows: MarketDataConflict[]; latestSourceDate: string | null; stoppedReason: string; message: string };
export type MarketDataSyncOptions = { mode: MarketDataSyncMode; actor: SyncRunActor; initialStartDate: string; maxPages?: number; maxDurationMs?: number; requestDelayMs?: number };

function delay(milliseconds: number) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

export async function syncMarketData<TRecord extends { referenceDate: string }>(provider: MarketDataProvider<TRecord>, repository: MarketDataRepository<TRecord>, options: MarketDataSyncOptions): Promise<MarketDataSyncResult> {
  const startedAt = Date.now(); const maxPages = options.maxPages ?? 80; const maxDurationMs = options.maxDurationMs ?? 45_000; const requestDelayMs = options.requestDelayMs ?? 350;
  const result: MarketDataSyncResult = { success: false, mode: options.mode, scannedPages: 0, parsedRows: 0, insertedRows: 0, skippedRows: 0, invalidRows: 0, conflictRows: [], latestSourceDate: null, stoppedReason: "", message: "" };
  const run = await repository.acquireRun(options.mode, options.actor);
  if (!run) return { ...result, stoppedReason: "already_running", message: "이미 LME 동기화가 실행 중입니다." };
  try {
    const latestReferenceDate = await repository.getLatestReferenceDate();
    const stopDate = options.mode === "incremental" ? latestReferenceDate : options.initialStartDate;
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      if (Date.now() - startedAt >= maxDurationMs) { result.stoppedReason = "max_duration"; break; }
      if (pageNumber > 1) await delay(requestDelayMs);
      const fetched = await provider.fetchPage(pageNumber); const parsed = provider.parse(fetched.payload);
      result.scannedPages += 1; result.parsedRows += parsed.records.length;
      result.latestSourceDate = result.latestSourceDate && result.latestSourceDate > parsed.latestDate ? result.latestSourceDate : parsed.latestDate;
      const validRecords = parsed.records.filter((record) => { const validation = provider.validate(record); if (!validation.valid) result.invalidRows += 1; return validation.valid; });
      if (validRecords.length !== parsed.records.length) throw new Error("유효하지 않은 시장 데이터가 있어 저장을 중단했습니다.");
      const eligible = validRecords.filter((record) => options.mode === "initial" ? record.referenceDate >= options.initialStartDate : !stopDate || record.referenceDate > stopDate);
      const existing = await repository.findExisting(eligible);
      const pending = eligible.filter((record) => { const old = existing.get(provider.getUniqueKey(record)); if (!old) return true; result.skippedRows += 1; const sourceValue = provider.getComparableValue(record); if (old.comparableValue !== sourceValue) result.conflictRows.push({ referenceDate: record.referenceDate, existingPrice: old.comparableValue, sourcePrice: sourceValue }); return false; });
      result.insertedRows += await repository.insert(pending, { sourceUrl: fetched.sourceUrl, actor: options.actor });
      if (options.mode === "initial" && parsed.oldestDate < options.initialStartDate) { result.stoppedReason = "before_start_date"; break; }
      if (options.mode === "incremental" && stopDate && parsed.oldestDate <= stopDate) { result.stoppedReason = "latest_saved_date"; break; }
      if (pageNumber === maxPages) result.stoppedReason = "max_pages";
    }
    result.success = true; result.message = `신규 ${result.insertedRows}건, 중복 ${result.skippedRows}건, 충돌 ${result.conflictRows.length}건`;
  } catch (error) {
    if (error instanceof LmePageStructureError) result.invalidRows += 1;
    result.stoppedReason = "error"; result.message = error instanceof Error ? error.message : "LME 동기화에 실패했습니다.";
  }
  await repository.completeRun(run.id, result);
  return result;
}
