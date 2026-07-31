export const LME_SYNC_SOURCE_NAME = "한국비철금속협회";
export const LME_SYNC_SOURCE_URL = "https://www.nonferrous.or.kr/stats/?act=sub3";
export const LME_SYNC_MATERIAL_CODE = "AL";

export type ParsedLmeRow = { referenceDate: string; priceUsdPerTon: number };
export type ParsedLmePage = { rows: ParsedLmeRow[]; oldestDate: string; latestDate: string };

export class LmePageStructureError extends Error {}

function text(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function cells(rowHtml: string, tag: "th" | "td") {
  return [...rowHtml.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map((match) => text(match[1]));
}

export function parseLmeDate(value: string) {
  const match = value.trim().match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})$/);
  if (!match) return null;
  const result = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const date = new Date(`${result}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== result ? null : result;
}

export function parseLmePrice(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export function parseLmePage(html: string): ParsedLmePage {
  if (!/<html\b/i.test(html) || !/<table\b/i.test(html)) throw new LmePageStructureError("HTML 시세표를 찾을 수 없습니다.");
  const documentText = text(html);
  if (!/현물\s*US\$\s*\/\s*톤/i.test(documentText)) throw new LmePageStructureError("현물 US$/톤 단위를 확인할 수 없습니다.");
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
  for (const table of tables) {
    const rowHtml = [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
    const headers = rowHtml.flatMap((row) => cells(row, "th")).filter((header) => header !== "품목");
    const dateIndex = headers.findIndex((header) => header === "일자");
    const alIndex = headers.findIndex((header) => header.toUpperCase() === "AL");
    if (dateIndex < 0 || alIndex < 0) continue;
    const rows: ParsedLmeRow[] = [];
    let invalidDataRows = 0;
    for (const row of rowHtml) {
      const values = cells(row, "td");
      if (!values.length) continue;
      const referenceDate = parseLmeDate(values[dateIndex] ?? "");
      const priceUsdPerTon = parseLmePrice(values[alIndex] ?? "");
      if (!referenceDate || priceUsdPerTon === null) { invalidDataRows += 1; continue; }
      rows.push({ referenceDate, priceUsdPerTon });
    }
    if (!rows.length) throw new LmePageStructureError("유효한 일자와 Al 가격 행을 찾을 수 없습니다.");
    if (invalidDataRows > 0) throw new LmePageStructureError(`유효하지 않은 시세 행 ${invalidDataRows}건이 있습니다.`);
    const dates = rows.map((row) => row.referenceDate).sort();
    return { rows, oldestDate: dates[0], latestDate: dates.at(-1) ?? dates[0] };
  }
  throw new LmePageStructureError("일자와 Al 헤더를 포함한 시세표를 찾을 수 없습니다.");
}
