import { formatNumber } from "@/lib/lme";
import type { LmeMarketPrice } from "@/lib/lme-market";

export type ComparisonChartSnapshot = {
  periodLabel: string;
  sources: string[];
  records: Pick<LmeMarketPrice, "id" | "reference_date" | "lme_al_usd_per_ton" | "exchange_rate_krw_per_usd" | "domestic_lme_krw_per_kg">[];
};

export type MarketComparisonDraft = {
  writtenDate: string;
  supplier: string;
  beforeLabel: string;
  afterLabel: string;
  beforePrice: string;
  afterPrice: string;
  coatings: { name: string; before: string; after: string; quantityTons?: string }[];
  memo?: string;
  showSavings?: boolean;
  chartSnapshot?: ComparisonChartSnapshot;
};

export const initialMarketComparison: MarketComparisonDraft = {
  writtenDate: "2026-10-08",
  supplier: "옥동",
  beforeLabel: "변경전 (25t 계약) 26.09.23",
  afterLabel: "변경후 (50t 계약) 26.10.06",
  beforePrice: "6100",
  afterPrice: "5700",
  coatings: [
    { name: "불소도장(2코팅)", before: "2250", after: "2250" },
    { name: "불소도장(3코팅)", before: "2450", after: "2450" },
    { name: "불소도장(마이카)", before: "2800", after: "2800" },
  ],
};

function validPrice(value: string) {
  return value.trim() !== "" && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
}

export function isMarketComparisonValid(draft: MarketComparisonDraft) {
  return /^\d{4}-\d{2}-\d{2}$/.test(draft.writtenDate)
    && Number.isFinite(Date.parse(draft.writtenDate))
    && new Date(draft.writtenDate).toISOString().slice(0, 10) === draft.writtenDate
    && draft.supplier.trim().length > 0 && draft.supplier.length <= 40
    && draft.beforeLabel.trim().length > 0 && draft.beforeLabel.length <= 80
    && draft.afterLabel.trim().length > 0 && draft.afterLabel.length <= 80
    && draft.coatings.length === 3
    && (draft.memo ?? "").length <= 2000
    && draft.coatings.every((row) => row.name.trim().length > 0 && row.name.length <= 40)
    && [draft.beforePrice, draft.afterPrice, ...draft.coatings.flatMap((row) => [row.before, row.after])].every(validPrice);
}

export type MarketComparisonHistoryRecord = {
  id: string;
  draft: MarketComparisonDraft;
  created_at: string;
  created_by_name: string;
};

export function parseMarketComparison(value: unknown): MarketComparisonDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.writtenDate !== "string" || typeof body.supplier !== "string"
    || typeof body.beforeLabel !== "string" || typeof body.afterLabel !== "string"
    || typeof body.beforePrice !== "string" || typeof body.afterPrice !== "string"
    || !Array.isArray(body.coatings) || body.coatings.length !== 3) return null;
  const coatings: MarketComparisonDraft["coatings"] = [];
  for (const entry of body.coatings) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.name !== "string" || typeof row.before !== "string" || typeof row.after !== "string") return null;
    if (row.quantityTons !== undefined && typeof row.quantityTons !== "string") return null;
    coatings.push({ name: row.name.trim(), before: row.before.trim(), after: row.after.trim(), quantityTons: typeof row.quantityTons === "string" ? row.quantityTons.trim() : "" });
  }
  const draft = {
    writtenDate: body.writtenDate, supplier: body.supplier.trim(),
    beforeLabel: body.beforeLabel.trim(), afterLabel: body.afterLabel.trim(),
    beforePrice: body.beforePrice.trim(), afterPrice: body.afterPrice.trim(), coatings,
  };
  if (!isMarketComparisonValid(draft)) return null;
  if (body.memo !== undefined && (typeof body.memo !== "string" || body.memo.length > 2000)) return null;
  if (body.showSavings !== undefined && typeof body.showSavings !== "boolean") return null;
  const chartSnapshot = body.chartSnapshot === undefined ? undefined : parseChartSnapshot(body.chartSnapshot);
  if (chartSnapshot === null) return null;
  return {
    ...draft,
    memo: typeof body.memo === "string" ? body.memo.trim() : "",
    showSavings: body.showSavings !== false,
    chartSnapshot,
    beforePrice: String(Number(draft.beforePrice)),
    afterPrice: String(Number(draft.afterPrice)),
    coatings: draft.coatings.map((row) => ({ ...row, before: String(Number(row.before)), after: String(Number(row.after)) })),
  };
}

function parseChartSnapshot(value: unknown): ComparisonChartSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.periodLabel !== "string" || body.periodLabel.length > 200
    || !Array.isArray(body.sources) || body.sources.length > 10 || !body.sources.every((source): source is string => typeof source === "string" && source.length <= 2000)
    || !Array.isArray(body.records) || body.records.length > 10000) return null;
  const records: ComparisonChartSnapshot["records"] = [];
  const validNumber = (number: unknown): number is number => typeof number === "number" && Number.isFinite(number) && number >= 0;
  for (const entry of body.records) {
    if (!entry || typeof entry !== "object") return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || row.id.length > 100 || typeof row.reference_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.reference_date)
      || !validNumber(row.lme_al_usd_per_ton)
      || (row.exchange_rate_krw_per_usd !== null && !validNumber(row.exchange_rate_krw_per_usd))
      || (row.domestic_lme_krw_per_kg !== null && !validNumber(row.domestic_lme_krw_per_kg))) return null;
    records.push({ id: row.id, reference_date: row.reference_date, lme_al_usd_per_ton: row.lme_al_usd_per_ton, exchange_rate_krw_per_usd: row.exchange_rate_krw_per_usd, domestic_lme_krw_per_kg: row.domestic_lme_krw_per_kg });
  }
  return { periodLabel: body.periodLabel, sources: body.sources, records };
}

export function createNextMarketComparison(previous: MarketComparisonDraft): MarketComparisonDraft {
  const now = new Date();
  const writtenDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return { writtenDate, supplier: previous.supplier, beforeLabel: previous.afterLabel.replace(/^변경\s*후/, "변경전"), afterLabel: "변경후", beforePrice: previous.afterPrice, afterPrice: previous.afterPrice,
    coatings: previous.coatings.map((row) => ({ name: row.name, before: row.after, after: row.after, quantityTons: "" })), memo: "" };
}

export function getMarketComparisonChanges(draft: MarketComparisonDraft) {
  return draft.coatings.map((row) => {
    const valid = [draft.beforePrice, draft.afterPrice, row.before, row.after].every(validPrice);
    const before = Number(draft.beforePrice) + Number(row.before);
    const after = Number(draft.afterPrice) + Number(row.after);
    const delta = after - before;
    const savings = valid ? -delta * 1000 : null;
    return { name: row.name, delta: valid ? delta : null, rate: valid && before > 0 ? delta / before * 100 : null, savings: savings !== null && Number.isSafeInteger(savings) ? savings : null };
  });
}

export function getMarketComparisonChangeRows(draft: MarketComparisonDraft): string[][] {
  const signed = (value: number | null, digits = 0) => value === null ? "-" : `${value > 0 ? "+" : ""}${formatNumber(value, digits)}`;
  return getMarketComparisonChanges(draft).map((row) => [row.name, signed(row.delta), row.rate === null ? "-" : `${signed(row.rate, 1)}%`, row.savings === null ? "-" : row.savings === 0 ? "차이 없음" : `${formatNumber(Math.abs(row.savings), 0)}원 ${row.savings > 0 ? "절감" : "증가"}`]);
}

export function getMarketComparisonRows(draft: MarketComparisonDraft): string[][] {
  const price = (value: string) => validPrice(value) ? formatNumber(Number(value), 0) : "-";
  const total = (base: string, coating: string) => validPrice(base) && validPrice(coating)
    ? formatNumber(Number(base) + Number(coating), 0) : "-";
  return [
    [draft.supplier, "압출비", price(draft.beforePrice), "-", price(draft.afterPrice), "-"],
    ...draft.coatings.map((row) => ["도장", row.name, price(row.before), total(draft.beforePrice, row.before), price(row.after), total(draft.afterPrice, row.after)]),
  ];
}

