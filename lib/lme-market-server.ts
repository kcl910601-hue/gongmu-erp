import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMarketSummary, type LmeMarketPrice, type MarketAverage } from "@/lib/lme-market";
import { calculateDomesticLmeValue } from "@/lib/market-data/calculations";
import { buildWeeklyLmeComparison, findNearestExchangeRate, getKoreanWeeklyRanges } from "@/lib/market-data/weekly-lme";

const EXCHANGE_RATE_TYPE = "usd_krw_deal_base_rate";

type ExchangeRateRow = { reference_date: string; rate: number };

async function attachExchangeRates(supabase: SupabaseClient, records: LmeMarketPrice[]) {
  if (records.length === 0) return { data: records, error: null };
  const dates = records.map((record) => record.reference_date).sort();
  const firstDate = dates[0];
  const lastDate = dates.at(-1) ?? firstDate;
  const [rangeResult, previousResult] = await Promise.all([
    supabase.from("exchange_rates").select("reference_date,rate")
      .eq("base_currency", "USD").eq("quote_currency", "KRW").eq("rate_type", EXCHANGE_RATE_TYPE)
      .gte("reference_date", firstDate).lte("reference_date", lastDate).order("reference_date", { ascending: true }),
    supabase.from("exchange_rates").select("reference_date,rate")
      .eq("base_currency", "USD").eq("quote_currency", "KRW").eq("rate_type", EXCHANGE_RATE_TYPE)
      .lt("reference_date", firstDate).order("reference_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (rangeResult.error) return { data: null, error: rangeResult.error };
  if (previousResult.error) return { data: null, error: previousResult.error };
  const rates = [
    ...(previousResult.data ? [previousResult.data] : []),
    ...(rangeResult.data ?? []),
  ] as ExchangeRateRow[];
  rates.sort((a, b) => a.reference_date.localeCompare(b.reference_date));
  const enriched = records.map((record) => {
    const nearest = findNearestExchangeRate(rates, record.reference_date);
    if (!nearest) return record;
    const exchangeRate = Number(nearest.rate);
    const calculation = calculateDomesticLmeValue(record.lme_al_usd_per_ton, exchangeRate);
    return {
      ...record,
      exchange_rate_krw_per_usd: exchangeRate,
      domestic_lme_krw_per_kg: calculation.status === "calculated" ? calculation.value : null,
    };
  });
  return { data: enriched, error: null };
}

export async function getWeeklyLmeComparison(supabase: SupabaseClient, materialCode = "AL", now = new Date()) {
  const ranges = getKoreanWeeklyRanges(now);
  const result = await supabase.from("lme_market_prices").select("*").eq("material_code", materialCode).eq("price_type", "spot").gte("reference_date", ranges.previousWeekStart).lte("reference_date", ranges.currentWeekEnd).order("reference_date", { ascending: true }).order("created_at", { ascending: false });
  if (result.error) return { data: null, error: result.error };
  const enriched = await attachExchangeRates(supabase, (result.data ?? []) as LmeMarketPrice[]);
  if (enriched.error || !enriched.data) return { data: null, error: enriched.error };
  return { data: buildWeeklyLmeComparison(enriched.data, ranges), error: null };
}

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
  const recordsResult = await attachExchangeRates(supabase, (data ?? []) as LmeMarketPrice[]);
  if (recordsResult.error || !recordsResult.data) return { data: null, error: recordsResult.error };
  const records = recordsResult.data;
  const { data: analysisData, error: analysisError } = await supabase.from("lme_market_prices").select("*").eq("material_code", material).order("reference_date", { ascending: false }).limit(30);
  if (analysisError) return { data: null, error: analysisError };
  const analysisResult = await attachExchangeRates(supabase, (analysisData ?? []) as LmeMarketPrice[]);
  if (analysisResult.error || !analysisResult.data) return { data: null, error: analysisResult.error };
  const { data: cache, error: cacheError } = await supabase.from("lme_market_kpi_cache").select("average_1m, sample_count_1m, average_3m, sample_count_3m, average_6m, sample_count_6m").eq("material_code", material).maybeSingle();
  if (cacheError) return { data: null, error: cacheError };
  const cachedAverages: MarketAverage[] | undefined = cache ? [
    { months: 1, value: cache.average_1m, sampleCount: cache.sample_count_1m },
    { months: 3, value: cache.average_3m, sampleCount: cache.sample_count_3m },
    { months: 6, value: cache.average_6m, sampleCount: cache.sample_count_6m },
  ] : undefined;
  return { data: { records, summary: buildMarketSummary(analysisResult.data, cachedAverages) }, error: null };
}
