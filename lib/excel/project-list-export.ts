import XLSX from "xlsx-js-style";
import type { ProjectListItem } from "../projects.ts";
import { formatProjectQuantity } from "../project-quantity.ts";
import { getProjectStatusLabel } from "../status.ts";

type ProjectListSheet = XLSX.WorkSheet & { "!freeze"?: { xSplit: number; ySplit: number } };
export type ProjectListExportOptions = { projects: ProjectListItem[]; generatedAt: Date; filterSummary: string };
export const PROJECT_LIST_HEADERS = ["순번", "프로젝트 코드", "프로젝트명", "수량", "발주처/거래처", "조립업체", "영업담당", "공무담당", "현장주소", "시작일", "종료일", "상태", "진행률", "등록일"] as const;
const BORDER = { style: "thin", color: { rgb: "D8DEE9" } } as const;
const FONT = "맑은 고딕";

function localDate(value: string | null) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : "";
}
function formatDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function getProjectListExcelFileName(date: Date) { return `프로젝트_목록_${formatDate(date)}.xlsx`; }

export function buildProjectListWorkbook(options: ProjectListExportOptions) {
  const rows: Array<Array<string | number | Date>> = [
    ["프로젝트 목록"],
    [`다운로드 기준일: ${formatDate(options.generatedAt)}`],
    [`적용 필터: ${options.filterSummary || "전체"}`],
    [...PROJECT_LIST_HEADERS],
    ...options.projects.map((project, index) => [index + 1, project.project_code ?? "", project.project_name, formatProjectQuantity(project.quantity, project.quantity_unit), project.client_name ?? "", project.assemblyVendors.map((vendor) => vendor.organizationName).join(", "), project.salesperson ?? "", project.task_manager ?? "", project.site_address ?? "", localDate(project.start_date), localDate(project.end_date || project.completion_due_date), getProjectStatusLabel(project.status), project.progress / 100, localDate(project.created_at)]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true }) as ProjectListSheet;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "프로젝트 목록");
  const lastColumn = PROJECT_LIST_HEADERS.length - 1;
  sheet["!merges"] = [0, 1, 2].map((row) => ({ s: { r: row, c: 0 }, e: { r: row, c: lastColumn } }));
  sheet["!autofilter"] = { ref: `A4:${XLSX.utils.encode_col(lastColumn)}${Math.max(rows.length, 4)}` };
  sheet["!freeze"] = { xSplit: 0, ySplit: 4 };
  sheet["!cols"] = [8, 16, 32, 14, 22, 24, 14, 14, 40, 13, 13, 11, 11, 13].map((wch) => ({ wch }));
  sheet["!rows"] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 20 }, { hpt: 24 }, ...options.projects.map(() => ({ hpt: 22 }))];
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  for (let row = 0; row <= range.e.r; row += 1) for (let column = 0; column <= range.e.c; column += 1) {
    const address = XLSX.utils.encode_cell({ r: row, c: column });
    const cell = sheet[address] ?? (sheet[address] = { t: "s", v: "" });
    cell.s = { font: { name: FONT, sz: 10, color: { rgb: "334155" } }, alignment: { vertical: "center", horizontal: column === 0 ? "center" : "left" } };
    if (row === 0) cell.s = { fill: { fgColor: { rgb: "0F172A" } }, font: { name: FONT, sz: 16, bold: true, color: { rgb: "FFFFFF" } }, alignment: { vertical: "center", horizontal: "left" } };
    else if (row === 1 || row === 2) cell.s = { fill: { fgColor: { rgb: "F8FAFC" } }, font: { name: FONT, sz: 9, color: { rgb: "64748B" } }, alignment: { vertical: "center", horizontal: "left" } };
    else if (row === 3) cell.s = { fill: { fgColor: { rgb: "1E3A5F" } }, font: { name: FONT, sz: 10, bold: true, color: { rgb: "FFFFFF" } }, alignment: { vertical: "center", horizontal: "center", wrapText: true }, border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER } };
    else {
      cell.s.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
      if (column === 2 || column === 8) cell.s.alignment = { vertical: "center", horizontal: "left", wrapText: true };
      if (column === 9 || column === 10 || column === 13) cell.z = "yyyy-mm-dd";
      if (column === 12) cell.z = "0%";
    }
  }
  return workbook;
}

export function downloadProjectListWorkbook(options: ProjectListExportOptions) {
  XLSX.writeFile(buildProjectListWorkbook(options), getProjectListExcelFileName(options.generatedAt), { compression: true });
}
