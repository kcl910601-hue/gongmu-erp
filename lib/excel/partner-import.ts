import XLSX from "xlsx-js-style";
import { parsePartnerImport } from "@/lib/partner-import";
import { PARTNER_TYPES, PARTNER_TYPE_LABELS } from "@/lib/partners";

const headers = ["업체명", "업체 유형", "정렬 순서", "비고"];
export function downloadPartnerTemplate() {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers]);
  sheet["!cols"] = [30, 20, 16, 45].map(wch => ({ wch }));
  for (const cell of ["A1", "B1", "C1", "D1"]) sheet[cell].s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1E3A5F" } } };
  XLSX.utils.book_append_sheet(book, sheet, "업체 등록");
  const guide = XLSX.utils.aoa_to_sheet([["항목", "작성 안내"], ["업체명", "필수. 기존 업체와 동일한 이름은 등록하지 않습니다. 비활성 업체도 중복 확인합니다."], ["업체 유형", PARTNER_TYPES.map(t => PARTNER_TYPE_LABELS[t]).join(" / ")], ["정렬 순서", "선택. 0 이상의 정수, 빈칸은 0"], ["비고", "선택. 1,000자 이하"], ["등록", "최대 1,000행, 5MB. 전체 활성 상태로 등록. 기존 업체 수정 없음."], ["가스켓 업체", "부자재업체로 입력하세요."], ["파일", "업체 등록 시트와 첫 행 제목을 유지해주세요."]]);
  guide["!cols"] = [{ wch: 18 }, { wch: 95 }];
  XLSX.utils.book_append_sheet(book, guide, "작성 안내");
  XLSX.writeFile(book, "업체등록_업로드양식.xlsx");
}
export async function readPartnerFile(file: File) {
  if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) throw new Error("5MB 이하의 .xlsx 파일을 선택해주세요.");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = book.Sheets["업체 등록"];
  if (!sheet) throw new Error("양식의 '업체 등록' 시트가 필요합니다.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (!headers.every((h, i) => rows[0]?.[i] === h)) throw new Error("양식의 열 제목을 유지해주세요.");
  return parsePartnerImport(rows.slice(1).filter(r => r.some(v => v !== "")).map(r => ({ name: r[0], partner_type: r[1], sort_order: r[2], memo: r[3] })));
}
