import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/auth-admin";
import { LME_SYNC_SOURCE_NAME, LME_SYNC_SOURCE_URL } from "@/lib/lme-sync-parser";
import { lmeMarketDataProvider } from "@/lib/market-data/providers/lme-provider";
import { LmeMarketDataRepository } from "@/lib/market-data/repository";
import { syncMarketData, type MarketDataConflict, type MarketDataSyncResult } from "@/lib/market-data/sync-engine";
import type { MarketDataSyncMode } from "@/lib/market-data/types";

export type LmeSyncMode = MarketDataSyncMode;
export type LmeSyncConflict = MarketDataConflict;
export type LmeSyncResult = MarketDataSyncResult;

export async function getLmeSyncStatus(supabase: SupabaseClient) {
  try {
    const status = await new LmeMarketDataRepository(supabase).getStatus();
    return { data: { ...status, sourceName: LME_SYNC_SOURCE_NAME, sourceUrl: LME_SYNC_SOURCE_URL }, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : "동기화 상태를 불러오지 못했습니다." } };
  }
}

export function runLmeSync(options: { mode: LmeSyncMode; triggerSource: "admin" | "cron"; userId: string | null; userName: string }) {
  const serviceRoleClient = createSupabaseAdminClient();
  return syncMarketData(lmeMarketDataProvider, new LmeMarketDataRepository(serviceRoleClient), { mode: options.mode, actor: { triggerSource: options.triggerSource, userId: options.userId, userName: options.userName }, initialStartDate: "2024-01-01" });
}
