export type WeeklyLmeComparison = {
  currentWeekAverage: number | null; previousWeekAverage: number | null;
  differenceAmount: number | null; differenceRate: number | null;
  currentWeekSampleCount: number; previousWeekSampleCount: number;
  currentWeekStart: string; currentWeekEnd: string;
  previousWeekStart: string; previousWeekEnd: string;
  unit: "KRW/kg";
};

type ConvertedLmeRow = { reference_date: string; domestic_lme_krw_per_kg: number | null };
export type DatedExchangeRate = { reference_date: string; rate: number };

export function findNearestExchangeRate(rates: DatedExchangeRate[], targetDate: string) {
  let nearest: DatedExchangeRate | undefined;
  for (const rate of rates) { if (rate.reference_date > targetDate) break; nearest = rate; }
  return nearest;
}

function addDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getKoreanWeeklyRanges(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value ?? "";
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const currentWeekStart = addDate(today, -((weekday + 6) % 7));
  return { currentWeekStart, currentWeekEnd: today, previousWeekStart: addDate(currentWeekStart, -7), previousWeekEnd: addDate(currentWeekStart, -1) };
}

export function buildWeeklyLmeComparison(records: ConvertedLmeRow[], ranges: ReturnType<typeof getKoreanWeeklyRanges>): WeeklyLmeComparison {
  const byDate = new Map<string, number>();
  for (const record of records) if (!byDate.has(record.reference_date) && record.domestic_lme_krw_per_kg !== null && Number.isFinite(record.domestic_lme_krw_per_kg)) byDate.set(record.reference_date, record.domestic_lme_krw_per_kg);
  const current = [...byDate].filter(([date]) => date >= ranges.currentWeekStart && date <= ranges.currentWeekEnd).map(([, value]) => value);
  const previous = [...byDate].filter(([date]) => date >= ranges.previousWeekStart && date <= ranges.previousWeekEnd).map(([, value]) => value);
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const currentWeekAverage = average(current); const previousWeekAverage = average(previous);
  const differenceAmount = currentWeekAverage !== null && previousWeekAverage !== null ? currentWeekAverage - previousWeekAverage : null;
  const differenceRate = differenceAmount !== null && previousWeekAverage !== null && previousWeekAverage !== 0 ? differenceAmount / previousWeekAverage * 100 : null;
  return { currentWeekAverage, previousWeekAverage, differenceAmount, differenceRate, currentWeekSampleCount: current.length, previousWeekSampleCount: previous.length, ...ranges, unit: "KRW/kg" };
}
