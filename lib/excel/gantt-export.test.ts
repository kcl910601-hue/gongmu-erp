import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx-js-style";
import { buildGanttWorkbook, filterGanttTasksForRange, getGanttExcelFileName, getGanttExportDates, type GanttExcelTask } from "./gantt-export.ts";

function task(index: number, overrides: Partial<GanttExcelTask> = {}): GanttExcelTask {
  return { projectCode: `P-${Math.floor(index / 10)}`, projectName: `현장 ${Math.floor(index / 10)}`, taskName: `업무 ${index}`, assignee: index % 2 ? "김공무" : null, statusLabel: "진행중", status: "in_progress", startDate: "2026-12-30", endDate: "2027-01-03", progress: 40, delayed: false, ...overrides };
}

test("연말을 지나는 날짜 열을 시작일과 종료일 포함으로 만든다", () => {
  assert.deepEqual(getGanttExportDates("2026-12-30", "2027-01-02"), ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
});

test("현재 월·사용자 지정 범위와 겹치는 현재 표시 업무만 유지하며 빈 결과도 반환한다", () => {
  const tasks = [task(1, { startDate: "2026-08-01", endDate: "2026-08-10" }), task(2, { startDate: "2026-09-01", endDate: "2026-09-10" })];
  assert.deepEqual(filterGanttTasksForRange(tasks, "2026-08-10", "2026-08-31").map((item) => item.taskName), ["업무 1"]);
  assert.deepEqual(filterGanttTasksForRange(tasks, "2027-01-01", "2027-01-31"), []);
});

for (const count of [1, 10, 100]) test(`${count}건 Gantt workbook의 행, 병합, 고정 창, 주말/오늘 스타일을 만든다`, () => {
  const workbook = buildGanttWorkbook({ tasks: Array.from({ length: count }, (_, index) => task(index, index === 0 ? { delayed: true } : {})), startDate: "2026-12-28", endDate: "2027-01-05", today: "2027-01-01", generatedAt: new Date("2026-12-28T09:00:00+09:00"), filterSummary: "담당자: 김공무" });
  assert.deepEqual(workbook.SheetNames, ["간트차트"]);
  const sheet = workbook.Sheets["간트차트"] as XLSX.WorkSheet & { "!freeze"?: { xSplit: number; ySplit: number }; "!pageSetup"?: { orientation: string }; "!merges"?: XLSX.Range[] };
  assert.equal(XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1").e.r, count + 3);
  assert.deepEqual(sheet["!freeze"], { xSplit: 9, ySplit: 4 });
  assert.equal(sheet["!pageSetup"]?.orientation, "landscape");
  assert.ok((sheet["!merges"]?.length ?? 0) >= 13);
  assert.equal(sheet["L5"].s.fill.fgColor.rgb, "FECACA");
  const binary = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const reopened = XLSX.read(binary, { type: "buffer" });
  assert.equal(reopened.Sheets["간트차트"]["A5"].v, "P-0");
});

test("완료·지연·미배정과 경계 날짜를 셀 값과 막대 색으로 반영한다", () => {
  const workbook = buildGanttWorkbook({ tasks: [task(0, { assignee: null, status: "completed", statusLabel: "완료", progress: 100 }), task(11, { delayed: true, statusLabel: "지연 2일" })], startDate: "2026-12-30", endDate: "2027-01-03", today: "2027-01-01", generatedAt: new Date() });
  const sheet = workbook.Sheets["간트차트"];
  assert.equal(sheet["D5"].v, "미배정");
  assert.equal(sheet["I5"].v, 1);
  assert.equal(sheet["J5"].s.fill.fgColor.rgb, "BBF7D0");
  assert.equal(sheet["J6"].s.fill.fgColor.rgb, "FECACA");
});

test("파일명에서 금지 문자를 제거하고 단일 프로젝트 접두사를 지원한다", () => {
  assert.equal(getGanttExcelFileName("2026-08-11"), "공무팀_간트차트_2026-08-11.xlsx");
  assert.equal(getGanttExcelFileName("2026-08-11", "A/B:현장?"), "A_B_현장__간트차트_2026-08-11.xlsx");
});
