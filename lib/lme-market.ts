export const LME_MARKET_SOURCE_URL = "https://www.nonferrous.or.kr/stats/?act=sub3";
export const PURCHASE_SIGNAL_THRESHOLDS = { favorableMaxPercent: -5, cautiousMinPercent: 5 } as const;

export type MarketPeriod = "1m" | "3m" | "6m" | "1y" | "all";
export type LmeMarketPrice = {
  id: string; reference_date: string; reference_month: string; round: 1 | 2 | null; material_code: string;
  lme_al_usd_per_ton: number; exchange_rate_krw_per_usd: number | null; domestic_lme_krw_per_kg: number | null;
  price_type: "spot" | "manual_reference"; currency: "USD"; unit: "metric_ton"; source_name: string;
  source_url: string; memo: string | null; created_by_name: string; created_at: string;
};
export type MarketAverage = { months: 1 | 3 | 6; value: number | null; sampleCount: number };
export type PurchaseSignal = { code: "favorable" | "neutral" | "cautious" | "insufficient"; label: string; reason: string; differenceRate: number | null };
export type MarketSummary = { latest: LmeMarketPrice | null; previous: LmeMarketPrice | null; averages: MarketAverage[]; analysis: string[]; purchaseSignal: PurchaseSignal };

export function calculateDomesticLme(lme: number, exchangeRate: number) { return lme * exchangeRate / 1000; }
export function isValidHttpUrl(value: string) { try { const url = new URL(value); return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname); } catch { return false; } }

function startDate(latestDate: string, months: number) {
  const date = new Date(`${latestDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

export function getAverageMarket(records: LmeMarketPrice[], latestDate: string, months: 1 | 3 | 6): MarketAverage {
  const from = startDate(latestDate, months);
  const samples = records.filter((record) => record.reference_date >= from && record.reference_date <= latestDate && record.domestic_lme_krw_per_kg !== null);
  return { months, value: samples.length ? samples.reduce((sum, record) => sum + (record.domestic_lme_krw_per_kg ?? 0), 0) / samples.length : null, sampleCount: samples.length };
}

export function getPurchaseSignal(latest: LmeMarketPrice | null, sixMonth: MarketAverage | undefined): PurchaseSignal {
  if (!latest || latest.domestic_lme_krw_per_kg === null || !sixMonth?.value || sixMonth.sampleCount === 0) return { code: "insufficient", label: "데이터 부족", reason: "환율이 포함된 최근 6개월 자료가 부족합니다.", differenceRate: null };
  const rate = (latest.domestic_lme_krw_per_kg - sixMonth.value) / sixMonth.value * 100;
  if (rate <= PURCHASE_SIGNAL_THRESHOLDS.favorableMaxPercent) return { code: "favorable", label: "계약 검토 유리", reason: `현재 시세가 최근 6개월 평균보다 ${Math.abs(rate).toFixed(1)}% 낮습니다.`, differenceRate: rate };
  if (rate >= PURCHASE_SIGNAL_THRESHOLDS.cautiousMinPercent) return { code: "cautious", label: "추가 계약 신중", reason: `현재 시세가 최근 6개월 평균보다 ${rate.toFixed(1)}% 높습니다.`, differenceRate: rate };
  return { code: "neutral", label: "중립", reason: `현재 시세와 최근 6개월 평균의 차이는 ${rate >= 0 ? "+" : ""}${rate.toFixed(1)}%입니다.`, differenceRate: rate };
}

export function analyzeMarket(records: LmeMarketPrice[], averages: MarketAverage[]) {
  const ordered = [...records].sort((a, b) => a.reference_date.localeCompare(b.reference_date));
  const latest = ordered.at(-1); const previous = ordered.at(-2);
  if (!latest) return ["분석할 시장 데이터가 없습니다."];
  const messages: string[] = [];
  if (previous?.domestic_lme_krw_per_kg && latest.domestic_lme_krw_per_kg !== null) { const rate = (latest.domestic_lme_krw_per_kg - previous.domestic_lme_krw_per_kg) / previous.domestic_lme_krw_per_kg * 100; messages.push(`전회 대비 국내환산 LME가 ${Math.abs(rate).toFixed(1)}% ${rate >= 0 ? "상승" : "하락"}했습니다.`); }
  for (const average of averages) if (average.value && latest.domestic_lme_krw_per_kg !== null) { const rate = (latest.domestic_lme_krw_per_kg - average.value) / average.value * 100; messages.push(`현재 국내환산 LME는 최근 ${average.months}개월 평균보다 ${Math.abs(rate).toFixed(1)}% ${rate >= 0 ? "높습니다" : "낮습니다"} (${average.sampleCount}건 기준).`); }
  const sixFrom = startDate(latest.reference_date, 6); const six = ordered.filter((item) => item.reference_date >= sixFrom);
  const sixValues = six.flatMap((item) => item.domestic_lme_krw_per_kg === null ? [] : [item.domestic_lme_krw_per_kg]);
  if (sixValues.length && latest.domestic_lme_krw_per_kg === Math.max(...sixValues)) messages.push("현재 값은 최근 6개월 최고값입니다.");
  let streak = 1; let direction = 0;
  const converted = ordered.filter((item) => item.domestic_lme_krw_per_kg !== null);
  for (let index = converted.length - 1; index > 0; index--) { const nextDirection = Math.sign((converted[index].domestic_lme_krw_per_kg ?? 0) - (converted[index - 1].domestic_lme_krw_per_kg ?? 0)); if (!nextDirection || (direction && nextDirection !== direction)) break; direction = nextDirection; streak++; }
  if (streak >= 3) messages.push(`최근 ${streak}회 연속 ${direction > 0 ? "상승" : "하락"}했습니다.`);
  return messages;
}

export function buildMarketSummary(records: LmeMarketPrice[], cachedAverages?: MarketAverage[]): MarketSummary {
  const ordered = [...records].sort((a, b) => a.reference_date.localeCompare(b.reference_date) || a.created_at.localeCompare(b.created_at));
  const latest = ordered.at(-1) ?? null; const previous = ordered.at(-2) ?? null;
  const averages = cachedAverages ?? (latest ? ([1, 3, 6] as const).map((months) => getAverageMarket(ordered, latest.reference_date, months)) : ([1, 3, 6] as const).map((months) => ({ months, value: null, sampleCount: 0 })));
  return { latest, previous, averages, analysis: analyzeMarket(ordered, averages), purchaseSignal: getPurchaseSignal(latest, averages.find((item) => item.months === 6)) };
}
