import assert from "node:assert/strict";
import test from "node:test";
import { formatTaskNoteForExport, getLatestTaskNotes, getTaskNoteCheckDateStatus, isTaskActiveOnDate, isValidTaskNoteCheckDate, normalizeTaskNoteImportance, shouldShowActiveImportantNoteReminder, type TaskNotePreview } from "./task-notes.ts";

const note = (id: string, taskId: number, createdAt: string, important = false): TaskNotePreview => ({ id, taskId, note: `메모 ${id}`, isImportant: important, createdAt, createdByName: null, checkDate: null });

test("업무별 최신 원본 메모와 중요도를 선택한다", () => {
  const latest = getLatestTaskNotes([note("old", 1, "2026-08-01T00:00:00Z"), note("new", 1, "2026-08-02T00:00:00Z", true), note("two", 2, "2026-08-01T00:00:00Z")]);
  assert.equal(latest.get(1)?.id, "new");
  assert.equal(latest.get(1)?.isImportant, true);
  assert.equal(latest.get(2)?.id, "two");
});

test("오늘 진행 중인 미완료 Task의 최신 중요 메모만 active reminder로 표시한다", () => {
  const active = { startDate: "2026-08-10", endDate: "2026-08-15", completed: false };
  const important = { isImportant: true, checkDate: null };
  assert.equal(isTaskActiveOnDate(active, "2026-08-10"), true);
  assert.equal(isTaskActiveOnDate(active, "2026-08-12"), true);
  assert.equal(isTaskActiveOnDate(active, "2026-08-15"), true);
  assert.equal(shouldShowActiveImportantNoteReminder(active, important, "2026-08-12"), true);
  assert.equal(shouldShowActiveImportantNoteReminder(active, { ...important, checkDate: "2026-08-12" }, "2026-08-12"), false);
  assert.equal(shouldShowActiveImportantNoteReminder({ ...active, completed: true }, important, "2026-08-12"), false);
  assert.equal(shouldShowActiveImportantNoteReminder(active, { isImportant: false, checkDate: null }, "2026-08-12"), false);
  assert.equal(shouldShowActiveImportantNoteReminder(active, important, "2026-08-16"), false);
});

test("빈 메모는 중요 상태를 유지하지 않고 Excel 중요 접두사를 만든다", () => {
  assert.equal(normalizeTaskNoteImportance("", true), false);
  assert.equal(normalizeTaskNoteImportance(" 내용 ", true), true);
  assert.equal(formatTaskNoteForExport({ note: " 자재 반입\n확인 ", isImportant: true, checkDate: "2026-08-15" }), "[중요][확인 08/15] 자재 반입\n확인");
  assert.equal(formatTaskNoteForExport({ note: "일반", isImportant: false, checkDate: null }), "일반");
});

test("확인일을 로컬 날짜 문자열로 검증하고 상태를 구분한다", () => {
  assert.equal(isValidTaskNoteCheckDate(null), true);
  assert.equal(isValidTaskNoteCheckDate("2026-02-29"), false);
  assert.equal(isValidTaskNoteCheckDate("2026-08-15"), true);
  assert.equal(getTaskNoteCheckDateStatus(null, "2026-08-12"), "none");
  assert.equal(getTaskNoteCheckDateStatus("2026-08-13", "2026-08-12"), "upcoming");
  assert.equal(getTaskNoteCheckDateStatus("2026-08-12", "2026-08-12"), "today");
  assert.equal(getTaskNoteCheckDateStatus("2026-08-10", "2026-08-12"), "overdue");
});
