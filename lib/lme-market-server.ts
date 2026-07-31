import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMarketSummary, type LmeMarketPrice, type MarketAverage } from "@/lib/lme-market";

export async function getLatestLmeMarket(supabase: SupabaseClient, materialCode = "AL") {
  return supabase.from("lme_market_prices").select("*").eq("material_code", materialCode).not("domestic_lme_krw_per_kg", "is", null).order("reference_date", { ascending: false }).order("round", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
}

export async function getLatestLmeMarkets(supabase: SupabaseClient, materialCodes: string[]) {
  if (materialCodes.length === 0) return { data: new Map<string, LmeMarketPrice>(), error: null };
  const { data, error } = await supabase.from("lme_market_prices").select("*").in("material_code", materialCodes).not("domestic_lme_krw_per_kg", "is", null).order("reference_date", { ascending: false }).order("round", { ascending: false }).order("created_at", { ascending: false });
  if (error) return { data: null, error };
  const latest = new Map<string, LmeMarketPrice>();
  for (const record of (data ?? []) as LmeMarketPrice[]) if (!latest.has(record.material_code)) latest.set(record.material_code, record);
  return { data: latest, error: null };
}

export async function getNearestPreviousLmeMarket(supabase: SupabaseClient, targetDate: string, materialCode = "AL") {
  return supabase.from("lme_market_prices").select("*").eq("material_code", materialCode).lte("reference_date", targetDate).order("reference_date", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
}

export async function getMarketDataset(supabase: SupabaseClient, params: URLSearchParams) {
  const material = params.get("material") || "AL"; const year = params.get("year"); const month = params.get("month"); const round = params.get("round");
  let query = supabase.from("lme_market_prices").select("*").eq("material_code", material);
  const start = params.get("startDate"); const end = params.get("endDate");
  if (start) query = query.gte("reference_date", start); if (end) query = query.lte("reference_date", end);
  if (year && /^\d{4}$/.test(year)) query = query.gte("reference_date", `${year}-01-01`).lte("reference_date", `${year}-12-31`);
  if (month && /^\d{4}-\d{2}$/.test(month)) query = query.eq("reference_month", `${month}-01`);
  if (round === "1" || round === "2") query = query.eq("round", Number(round));
  const ascending = params.get("sort") === "oldest";
  const { data, error } = await query.order("reference_date", { ascending }).order("round", { ascending });
  if (error) return { data: null, error };
  const records = (data ?? []) as LmeMarketPrice[];
  const { data: analysisData, error: analysisError } = await supabase.from("lme_market_prices").select("*").eq("material_code", material).order("reference_date", { ascending: false }).limit(30);
  if (analysisError) return { data: null, error: analysisError };
  const { data: cache, error: cacheError } = await supabase.from("lme_market_kpi_cache").select("average_1m, sample_count_1m, average_3m, sample_count_3m, average_6m, sample_count_6m").eq("material_code", material).maybeSingle();
  if (cacheError) return { data: null, error: cacheError };
  const cachedAverages: MarketAverage[] | undefined = cache ? [
    { months: 1, value: cache.average_1m, sampleCount: cache.sample_count_1m },
    { months: 3, value: cache.average_3m, sampleCount: cache.sample_count_3m },
    { months: 6, value: cache.average_6m, sampleCount: cache.sample_count_6m },
  ] : undefined;
  return { data: { records, summary: buildMarketSummary((analysisData ?? []) as LmeMarketPrice[], cachedAverages) }, error: null };
}
