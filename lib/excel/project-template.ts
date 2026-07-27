"use client";

import * as XLSX from "xlsx-js-style";
import { getProjectEntryOptions } from "@/lib/project-master-data";
import { getActiveProcessTypes } from "@/lib/process-types";

export const PROJECT_EXCEL_COLUMNS = ["프로젝트코드", "프로젝트명", "발주처", "현장주소", "영업담당", "공무담당", "공정유형", "조립업체", "시작일", "종료예정일", "상태", "메모"] as const;
export const PROJECT_EXCEL_COMMON_FIELDS = ["발주처", "현장주소", "영업담당", "공무담당", "공정유형", "조립업체", "시작일", "종료예정일", "상태", "메모"] as const;

const descriptions: Record<(typeof PROJECT_EXCEL_COMMON_FIELDS)[number], string> = {
  발주처: "모든 프로젝트에 적용할 발주처", 현장주소: "모든 프로젝트에 적용할 현장주소",
  영업담당: "ERP 직원 이름을 정확하게 입력", 공무담당: "ERP 직원 이름을 정확하게 입력",
  공정유형: "등록된 공정유형 입력", 조립업체: "여러 업체는 쉼표(,)로 구분하여 입력 (공백 허용, 중복 제거)",
  시작일: "YYYY-MM-DD", 종료예정일: "YYYY-MM-DD", 상태: "대기/진행중/보류/완료",
  메모: "모든 프로젝트에 적용할 메모",
};

const border = {
  top: { style: "thin", color: { rgb: "FFCBD5E1" } }, bottom: { style: "thin", color: { rgb: "FFCBD5E1" } },
  left: { style: "thin", color: { rgb: "FFCBD5E1" } }, right: { style: "thin", color: { rgb: "FFCBD5E1" } },
} as const;
const styles = {
  header: { font: { bold: true, color: { rgb: "FFFFFFFF" } }, fill: { fgColor: { rgb: "FF334155" } }, alignment: { horizontal: "center", vertical: "center" }, border },
  required: { font: { bold: true, color: { rgb: "FFFFFFFF" } }, fill: { fgColor: { rgb: "FF1D4ED8" } }, alignment: { horizontal: "center", vertical: "center" }, border },
  input: { border, alignment: { vertical: "center" } },
  commonInput: { border, fill: { fgColor: { rgb: "FFEFF6FF" } }, alignment: { vertical: "center" } },
  title: { font: { bold: true, sz: 16, color: { rgb: "FF1E3A8A" } }, fill: { fgColor: { rgb: "FFDBEAFE" } } },
} as const;

function formatToday() {
  const date = new Date();
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

export async function buildProjectWorkbook() {
  const [entry, processResult] = await Promise.all([getProjectEntryOptions(), getActiveProcessTypes()]);
  if (entry.error) throw new Error(entry.error);
  if (processResult.error) throw processResult.error;

  const displayHeaders = PROJECT_EXCEL_COLUMNS.map((column) => column === "프로젝트코드" || column === "프로젝트명" ? `${column}*` : column);
  const projectSheet = XLSX.utils.aoa_to_sheet([displayHeaders, ...Array.from({ length: 500 }, () => Array(PROJECT_EXCEL_COLUMNS.length).fill(""))]);
  projectSheet["!cols"] = PROJECT_EXCEL_COLUMNS.map((column) => ({ wch: column === "프로젝트명" || column === "메모" ? 28 : Math.max(14, column.length * 2) }));
  projectSheet["!autofilter"] = { ref: "A1:L501" };
  displayHeaders.forEach((_, column) => {
    const cell = projectSheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (cell) cell.s = column < 2 ? styles.required : styles.header;
  });
  const assemblyVendorHeader = projectSheet[XLSX.utils.encode_cell({ r: 0, c: 7 })];
  if (assemblyVendorHeader) assemblyVendorHeader.c = [{ a: "ERP", t: "여러 업체는 쉼표(,)로 구분하여 입력" }];
  for (let row = 1; row <= 500; row += 1) {
    for (let column = 0; column < PROJECT_EXCEL_COLUMNS.length; column += 1) {
      const cell = projectSheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (!cell) continue;
      cell.s = styles.input;
      if (column === 8 || column === 9) cell.z = "yyyy-mm-dd";
    }
  }

  const commonSheet = XLSX.utils.aoa_to_sheet([["항목", "입력값", "설명"], ...PROJECT_EXCEL_COMMON_FIELDS.map((field) => [field, "", descriptions[field]])]);
  commonSheet["!cols"] = [{ wch: 18 }, { wch: 26 }, { wch: 44 }];
  commonSheet["!autofilter"] = { ref: `A1:C${PROJECT_EXCEL_COMMON_FIELDS.length + 1}` };
  for (let column = 0; column < 3; column += 1) {
    const cell = commonSheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (cell) cell.s = styles.header;
  }
  for (let row = 1; row <= PROJECT_EXCEL_COMMON_FIELDS.length; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const cell = commonSheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.s = column === 1 ? styles.commonInput : styles.input;
    }
  }

  const guideRows = [
    ["프로젝트 엑셀 일괄등록 작성안내"], [""],
    ["1", "프로젝트코드와 프로젝트명은 필수입니다."], ["2", "공통설정 값은 프로젝트목록의 빈칸에만 적용됩니다."],
    ["3", "프로젝트목록에 입력한 값이 공통설정보다 우선합니다."], ["4", "날짜 형식은 YYYY-MM-DD입니다."],
    ["5", "상태는 대기, 진행중, 보류, 완료 중 하나입니다."], ["6", "직원 이름은 코드목록을 확인하여 정확히 입력하십시오."],
    ["6-1", "조립업체는 ERP 등록 명칭과 정확히 일치해야 하며, 여러 업체는 쉼표(,)로 구분합니다."],
    ["6-2", "쉼표 앞뒤 공백은 허용되고 동일 업체를 여러 번 입력하면 하나로 처리됩니다."],
    ["7", "첫 번째 헤더 행을 수정하거나 삭제하지 마십시오."], ["8", "빈 행은 업로드에서 제외됩니다."],
    ["9", "프로젝트코드는 엑셀 내부 및 기존 DB에서 중복될 수 없습니다."], ["10", "다운로드한 파일의 시트명은 변경하지 마십시오."],
    ["11", "작성 완료 후 프로젝트 관리 화면의 엑셀 업로드 기능을 사용하십시오."], [""], ["정상 작성 예시"],
    [...displayHeaders],
    ["PJ-2026-001", "검단 A아파트", "한국건설", "인천광역시 서구", "홍길동", "김철수", "APT", "한빛조립, 씨넷조립", "2026-07-01", "2026-12-31", "진행중", "예시 데이터입니다."],
    ["PJ-2026-002", "김포 B현장", "대한건설", "경기도 김포시", "", "", "", "", "2026-08-01", "2027-01-31", "대기", ""],
  ];
  const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
  guideSheet["!cols"] = [{ wch: 18 }, { wch: 50 }, ...Array.from({ length: 10 }, () => ({ wch: 18 }))];
  guideSheet["!merges"] = [XLSX.utils.decode_range("A1:L1")];
  if (guideSheet.A1) guideSheet.A1.s = styles.title;

  const salespeople = [...new Set(entry.data.salespeople.map((item) => item.value).filter(Boolean))];
  const managers = [...new Set(entry.data.taskManagers.map((item) => item.value).filter(Boolean))];
  const processes = [...new Set(processResult.data.flatMap((item) => [item.code, item.name]).filter(Boolean))];
  const vendors = [...new Set(entry.data.assemblyVendors.map((item) => item.name).filter(Boolean))];
  const statuses = ["대기", "진행중", "보류", "완료"];
  const maxLength = Math.max(statuses.length, salespeople.length, managers.length, processes.length, vendors.length);
  const codeRows = [["상태", "영업담당", "공무담당", "공정유형", "조립업체"]];
  for (let index = 0; index < maxLength; index += 1) codeRows.push([statuses[index] ?? "", salespeople[index] ?? "", managers[index] ?? "", processes[index] ?? "", vendors[index] ?? ""]);
  const codeSheet = XLSX.utils.aoa_to_sheet(codeRows);
  codeSheet["!cols"] = Array.from({ length: 5 }, () => ({ wch: 24 }));
  for (let column = 0; column < 5; column += 1) {
    const cell = codeSheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (cell) cell.s = styles.header;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, projectSheet, "프로젝트목록");
  XLSX.utils.book_append_sheet(workbook, commonSheet, "공통설정");
  XLSX.utils.book_append_sheet(workbook, guideSheet, "작성안내");
  XLSX.utils.book_append_sheet(workbook, codeSheet, "코드목록");
  return workbook;
}

export async function downloadProjectExcelTemplate() {
  const workbook = await buildProjectWorkbook();
  XLSX.writeFile(workbook, `프로젝트_일괄등록_양식_${formatToday()}.xlsx`);
}
