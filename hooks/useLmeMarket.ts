"use client";

import { useCallback, useEffect, useState } from "react";
import type { LmeMarketPrice, MarketSummary } from "@/lib/lme-market";

export type MarketFilters = { period: "1m" | "3m" | "6m" | "1y" | "all"; year: string; month: string; round: string; material: string; startDate: string; endDate: string; sort: "latest" | "oldest" };
export const initialMarketFilters: MarketFilters = { period: "6m", year: "", month: "", round: "", material: "AL", startDate: "", endDate: "", sort: "latest" };
export type ExchangeQuote={referenceDate:string|null;rate:number|null;domesticLmeKrwPerKg:number|null};

function periodStart(period: MarketFilters["period"]) { if (period === "all") return ""; const months = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 }[period]; const date = new Date(); date.setMonth(date.getMonth() - months); return date.toISOString().slice(0, 10); }

export function useLmeMarket() {
  const [filters, setFilters] = useState(initialMarketFilters); const [records, setRecords] = useState<LmeMarketPrice[]>([]); const [summary, setSummary] = useState<MarketSummary | null>(null); const [exchangeQuote,setExchangeQuote]=useState<ExchangeQuote|null>(null); const [isLoading, setIsLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setIsLoading(true); setError(""); try { const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value && key !== "period") params.set(key, value); }); if (!filters.year && !filters.month && !filters.startDate && filters.period !== "all") params.set("startDate", periodStart(filters.period)); const response = await fetch(`/api/statistics/lme/market?${params}`, { cache: "no-store" }); const result = await response.json() as { records?: LmeMarketPrice[]; summary?: MarketSummary; error?: string }; if (!response.ok) throw new Error(result.error ?? "시장 시세를 불러오지 못했습니다."); setRecords(result.records ?? []); setSummary(result.summary ?? null); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "시장 시세를 불러오지 못했습니다."); } finally { setIsLoading(false); } }, [filters]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(()=>{const latest=summary?.latest;const timer=window.setTimeout(async()=>{if(!latest){setExchangeQuote(null);return;}try{const response=await fetch(`/api/statistics/exchange-rates/latest?date=${latest.reference_date}&lme=${latest.lme_al_usd_per_ton}`,{cache:"no-store"});const result=await response.json()as{referenceDate:string|null;rate:number|null;calculation:{status:string;value?:number}};if(response.ok)setExchangeQuote({referenceDate:result.referenceDate,rate:result.rate,domesticLmeKrwPerKg:result.calculation.status==="calculated"?result.calculation.value??null:null});}catch{setExchangeQuote(null);}},0);return()=>window.clearTimeout(timer);},[summary]);
  return { filters, setFilters, records, summary, exchangeQuote, isLoading, error, reload: load };
}
