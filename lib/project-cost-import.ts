import XLSX from "xlsx-js-style";
import { calculateCostVat, PAYMENT_STATUS_LABEL, type PaymentStatus } from "./project-costs.ts";

export const COST_IMPORT_HEADERS = ["프로젝트 코드", "프로젝트명", "비용 분류", "비용 제목", "비용 발생일", "비용 귀속일", "거래처/업체명", "문서번호", "공급가액", "부가세", "지급상태", "메모"] as const;
export const COST_CATEGORY_CODES = { 외주비: "subcontract", 운송비: "transportation", 노무비: "labor", 설치비: "installation", "AS 비용": "as_service", "기타 비용": "other" } as const;
const PAYMENT_BY_LABEL = new Map(Object.entries(PAYMENT_STATUS_LABEL).map(([code, label]) => [label, code as PaymentStatus]));
export type CostImportInput = { excel_row: number; project_code: string; project_name: string; category_code: string; category_label: string; cost_title: string; cost_date: string; recognition_date: string | null; vendor_name: string | null; document_number: string | null; supply_amount_krw: number | null; vat_amount_krw: number | null; payment_status: PaymentStatus | null; memo: string | null };

function text(value: unknown) { return value === null || value === undefined ? "" : String(value).trim(); }
function date(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const raw = text(value); const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw); if (!match) return "";
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]); const parsed=new Date(Date.UTC(year,month-1,day));
  return parsed.getUTCFullYear()===year&&parsed.getUTCMonth()===month-1&&parsed.getUTCDate()===day?raw:"";
}
function money(value: unknown) { if (value === "" || value === null || value === undefined) return null; const parsed = Number(typeof value === "string" ? value.replace(/,/g, "") : value); return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null; }

export function parseCostImportWorkbook(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets["비용 입력"];
  if (!sheet) throw new Error("프로젝트 비용 등록 양식이 아닙니다.");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true, range: 3 });
  const headers = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: 3, blankrows: false })[0]?.map(text) ?? [];
  if (!COST_IMPORT_HEADERS.every((header) => headers.includes(header))) throw new Error("프로젝트 비용 등록 양식이 아닙니다.");
  if (rows.length > 1000) throw new Error("한 번에 최대 1,000건까지 업로드할 수 있습니다.");
  return rows.flatMap((row, index): CostImportInput[] => {
    if (COST_IMPORT_HEADERS.every((header) => text(row[header]) === "")) return [];
    const categoryLabel = text(row["비용 분류"]);
    const paymentLabel = text(row["지급상태"]) || "미지급";
    const supply = money(row["공급가액"]);
    const vatCell = row["부가세"];
    const vat = vatCell === "" || vatCell === null || vatCell === undefined ? (supply === null ? null : calculateCostVat(supply)) : money(vatCell);
    const memo = typeof row["메모"] === "string" && row["메모"].trim() ? row["메모"].trim() : null;
    return [{ excel_row: index + 5, project_code: text(row["프로젝트 코드"]), project_name: text(row["프로젝트명"]), category_code: COST_CATEGORY_CODES[categoryLabel as keyof typeof COST_CATEGORY_CODES] ?? "", category_label: categoryLabel, cost_title: text(row["비용 제목"]), cost_date: date(row["비용 발생일"]), recognition_date: text(row["비용 귀속일"]) ? date(row["비용 귀속일"]) || "INVALID" : null, vendor_name: text(row["거래처/업체명"]) || null, document_number: text(row["문서번호"]) || null, supply_amount_krw: supply, vat_amount_krw: vat, payment_status: PAYMENT_BY_LABEL.get(paymentLabel) ?? null, memo }];
  });
}
