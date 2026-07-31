import { calculateDomesticLme, isValidHttpUrl, type LmeMarketPrice } from "@/lib/lme-market";

export type MarketImportCandidate = Pick<LmeMarketPrice, "reference_date" | "reference_month" | "round" | "material_code" | "lme_al_usd_per_ton" | "exchange_rate_krw_per_usd" | "source_url" | "memo"> & { domestic_lme_krw_per_kg: number; rowNumber: number };
export type MarketImportFailure = { rowNumber: number; reason: string };

function parseCsvLine(line: string) {
  const values: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index++) { const char = line[index]; if (char === '"') { if (quoted && line[index + 1] === '"') { value += '"'; index++; } else quoted = !quoted; } else if (char === "," && !quoted) { values.push(value.trim()); value = ""; } else value += char; }
  values.push(value.trim()); return values;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseMarketCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const headers = lines.length ? parseCsvLine(lines[0]) : [];
  const required = ["reference_date", "reference_month", "round", "material_code", "lme_al_usd_per_ton", "exchange_rate_krw_per_usd", "source_url"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) return { candidates: [] as MarketImportCandidate[], failures: [{ rowNumber: 1, reason: `필수 헤더 누락: ${missing.join(", ")}` }], totalRows: Math.max(lines.length - 1, 0) };
  const candidates: MarketImportCandidate[] = []; const failures: MarketImportFailure[] = []; const seen = new Set<string>();
  lines.slice(1).forEach((line, lineIndex) => {
    const rowNumber = lineIndex + 2; const values = parseCsvLine(line); const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const referenceDate = row.reference_date; const inputReferenceMonth = row.reference_month; const referenceMonth = `${inputReferenceMonth}-01`;
    const round = Number(row.round); const lme = Number(row.lme_al_usd_per_ton); const exchange = Number(row.exchange_rate_krw_per_usd); const material = row.material_code.toUpperCase();
    const key = `${referenceMonth}|${round}|${material}`; let reason = "";
    if ([row.reference_date, row.reference_month, row.round, row.material_code, row.lme_al_usd_per_ton, row.exchange_rate_krw_per_usd, row.source_url].some((value) => !value?.trim())) reason = "필수값이 누락되었습니다.";
    else if (!isValidDate(referenceDate) || !/^\d{4}-\d{2}$/.test(inputReferenceMonth) || !isValidDate(`${inputReferenceMonth}-01`) || referenceDate.slice(0, 7) !== inputReferenceMonth) reason = "기준일 또는 기준월 형식이 잘못되었습니다.";
    else if (round !== 1 && round !== 2) reason = "회차는 1 또는 2여야 합니다.";
    else if (!/^[A-Z]{2,10}$/.test(material)) reason = "Material 코드를 확인해주세요.";
    else if (!Number.isFinite(lme) || lme <= 0) reason = "LME 가격은 0보다 큰 숫자여야 합니다.";
    else if (!Number.isFinite(exchange) || exchange <= 0) reason = "환율은 0보다 큰 숫자여야 합니다.";
    else if (!isValidHttpUrl(row.source_url.trim())) reason = "출처 URL은 유효한 http 또는 https 주소여야 합니다.";
    else if ((row.memo?.length ?? 0) > 2000) reason = "메모는 2,000자 이하여야 합니다.";
    else if (seen.has(key)) reason = "CSV 내부에 동일 월·회차·Material이 중복되었습니다.";
    if (reason) failures.push({ rowNumber, reason }); else { seen.add(key); candidates.push({ rowNumber, reference_date: referenceDate, reference_month: referenceMonth, round: round as 1 | 2, material_code: material, lme_al_usd_per_ton: lme, exchange_rate_krw_per_usd: exchange, domestic_lme_krw_per_kg: calculateDomesticLme(lme, exchange), source_url: row.source_url.trim(), memo: row.memo?.trim() || null }); }
  });
  return { candidates, failures, totalRows: Math.max(lines.length - 1, 0) };
}
