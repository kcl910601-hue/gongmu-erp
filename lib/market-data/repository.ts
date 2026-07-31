import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedLmeRow } from "../lme-sync-parser.ts";
import { LME_SYNC_MATERIAL_CODE, LME_SYNC_SOURCE_NAME } from "../lme-sync-parser.ts";
import type { MarketDataSyncMode } from "./types.ts";

export type ExistingMarketData = { uniqueKey: string; comparableValue: number };
export type SyncRunActor = { triggerSource: "admin" | "cron"; userId: string | null; userName: string };
export type CompleteSyncRun = { success: boolean; scannedPages: number; parsedRows: number; insertedRows: number; skippedRows: number; invalidRows: number; conflictRows: unknown[]; latestSourceDate: string | null; stoppedReason: string; message: string };

export interface MarketDataRepository<TRecord extends { referenceDate: string }> {
  acquireRun(mode: MarketDataSyncMode, actor: SyncRunActor): Promise<{ id: string } | null>;
  getLatestReferenceDate(): Promise<string | null>;
  findExisting(records: TRecord[]): Promise<Map<string, ExistingMarketData>>;
  insert(records: TRecord[], context: { sourceUrl: string; actor: SyncRunActor }): Promise<number>;
  completeRun(runId: string, result: CompleteSyncRun): Promise<void>;
  getStatus(): Promise<{ latestReferenceDate: string | null; lastRun: Record<string, unknown> | null }>;
}

export class LmeMarketDataRepository implements MarketDataRepository<ParsedLmeRow> {
  constructor(private readonly supabase: SupabaseClient) {}

  async acquireRun(mode: MarketDataSyncMode, actor: SyncRunActor) {
    const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
    await this.supabase.from("lme_sync_runs").update({ status: "failed", completed_at: new Date().toISOString(), stopped_reason: "stale_lock", message: "실행 제한시간을 넘긴 이전 동기화 잠금을 종료했습니다." }).eq("status", "running").lt("started_at", staleBefore);
    const { data, error } = await this.supabase.from("lme_sync_runs").insert({ mode, trigger_source: actor.triggerSource, status: "running", created_by: actor.userId, created_by_name: actor.userName }).select("id").single();
    if (error?.code === "23505") return null;
    if (error) throw new Error(error.message);
    return data;
  }

  async getLatestReferenceDate() {
    const { data, error } = await this.supabase.from("lme_market_prices").select("reference_date").eq("material_code", LME_SYNC_MATERIAL_CODE).order("reference_date", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.reference_date ?? null;
  }

  async findExisting(records: ParsedLmeRow[]) {
    if (!records.length) return new Map<string, ExistingMarketData>();
    const dates = records.map((record) => record.referenceDate);
    const { data, error } = await this.supabase.from("lme_market_prices").select("reference_date,lme_al_usd_per_ton").eq("material_code", LME_SYNC_MATERIAL_CODE).in("reference_date", dates);
    if (error) throw new Error(error.message);
    return new Map((data ?? []).map((row) => [`${row.reference_date}|${LME_SYNC_MATERIAL_CODE}|spot`, { uniqueKey: `${row.reference_date}|${LME_SYNC_MATERIAL_CODE}|spot`, comparableValue: Number(row.lme_al_usd_per_ton) }]));
  }

  async insert(records: ParsedLmeRow[], context: { sourceUrl: string; actor: SyncRunActor }) {
    if (!records.length) return 0;
    const fetchedAt = new Date().toISOString();
    const { error } = await this.supabase.from("lme_market_prices").insert(records.map((record) => ({ reference_date: record.referenceDate, reference_month: `${record.referenceDate.slice(0, 7)}-01`, round: null, material_code: LME_SYNC_MATERIAL_CODE, lme_al_usd_per_ton: record.priceUsdPerTon, exchange_rate_krw_per_usd: null, domestic_lme_krw_per_kg: null, price_type: "spot", currency: "USD", unit: "metric_ton", source_name: LME_SYNC_SOURCE_NAME, source_url: context.sourceUrl, fetched_at: fetchedAt, memo: null, created_by: context.actor.userId, created_by_name: context.actor.userName })));
    if (error) throw new Error(error.message);
    return records.length;
  }

  async completeRun(runId: string, result: CompleteSyncRun) {
    const { error } = await this.supabase.from("lme_sync_runs").update({ status: result.success ? "success" : "failed", completed_at: new Date().toISOString(), scanned_pages: result.scannedPages, parsed_rows: result.parsedRows, inserted_rows: result.insertedRows, skipped_rows: result.skippedRows, invalid_rows: result.invalidRows, conflict_rows: result.conflictRows, latest_source_date: result.latestSourceDate, stopped_reason: result.stoppedReason, message: result.message }).eq("id", runId);
    if (error) throw new Error(error.message);
  }

  async getStatus() {
    const [{ data: latest, error: latestError }, { data: lastRun, error: runError }] = await Promise.all([
      this.supabase.from("lme_market_prices").select("reference_date").eq("material_code", LME_SYNC_MATERIAL_CODE).order("reference_date", { ascending: false }).limit(1).maybeSingle(),
      this.supabase.from("lme_sync_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (latestError || runError) throw new Error(latestError?.message ?? runError?.message);
    return { latestReferenceDate: latest?.reference_date ?? null, lastRun: lastRun ?? null };
  }
}
