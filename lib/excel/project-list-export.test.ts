import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx-js-style";
import type { ProjectListItem } from "../projects.ts";
import { buildProjectListWorkbook, getProjectListExcelFileName, PROJECT_LIST_HEADERS } from "./project-list-export.ts";

function project(index: number, overrides: Partial<ProjectListItem> = {}): ProjectListItem {
  return { id: index + 1000, project_code: `P-${index}`, project_name: `한글 프로젝트 ${index}`, client_name: "발주처", assembly_vendor: null, process_type: "도어", salesperson: "김영업", task_manager: "박공무", status: "in_progress", start_date: "2026-08-01", end_date: "2026-08-31", completion_due_date: null, site_address: "서울시 긴 현장주소", assembly_vendor_organization_id: null, assemblyVendors: [], memo: null, created_at: "2026-07-01T23:30:00+09:00", quantity: 10, quantity_unit: "SET", progress: 75, task_count: 4, completed_task_count: 3, ...overrides };
}

function reopen(projects: ProjectListItem[]) {
  const workbook = buildProjectListWorkbook({ projects, generatedAt: new Date(2026, 7, 21), filterSummary: "상태: 진행중 · 영업담당: 김영업" });
  return XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), { type: "buffer", cellDates: true, cellNF: true });
}

test("1, 10, 100, 500건을 현재 순서 그대로 내보낸다", () => {
  for (const count of [1, 10, 100, 500]) {
    const sheet = reopen(Array.from({ length: count }, (_, index) => project(index))).Sheets["프로젝트 목록"];
    assert.equal(sheet.A5.v, 1);
    assert.equal(sheet[`C${count + 4}`].v, `한글 프로젝트 ${count - 1}`);
  }
});

test("핵심 값, 서식, 필터 요약과 내부 ID 제외를 보존한다", () => {
  const sheet = reopen([project(0, { id: 98765, status: "completed", project_name: "=위험한 이름", site_address: "+긴 주소 @특수문자" })]).Sheets["프로젝트 목록"];
  assert.equal(PROJECT_LIST_HEADERS.length, 14);
  assert.equal(sheet.C5.v, "=위험한 이름");
  assert.equal(sheet.C5.t, "s");
  assert.equal(sheet.L5.v, "완료");
  assert.equal(sheet.M5.v, 0.75);
  assert.equal(sheet.M5.z, "0%");
  assert.equal(sheet.N5.z, "yyyy-mm-dd");
  assert.match(String(sheet.A3.v), /영업담당: 김영업/);
  assert.equal(JSON.stringify(sheet).includes("98765"), false);
  assert.equal(sheet["!autofilter"]?.ref, "A4:N5");
});

test("빈 결과 구조와 파일명을 만든다", () => {
  const workbook = reopen([]);
  assert.deepEqual(workbook.SheetNames, ["프로젝트 목록"]);
  assert.equal(workbook.Sheets["프로젝트 목록"].A4.v, "순번");
  assert.equal(getProjectListExcelFileName(new Date(2026, 7, 21)), "프로젝트_목록_2026-08-21.xlsx");
});
