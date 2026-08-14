import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRequiredProcessAlerts, REQUIRED_PROCESS_RULES, subtractCalendarMonths } from "./required-process-alerts.ts";

const project = { id: 1, project_name: "청라 현장", status: "in_progress", end_date: "2026-12-31" };
const process = (processType = "본납-도어") => ({ project_id: 1, process_type: processType });

test("달력 월 차감은 월말과 윤년 2월을 보정한다", () => {
  assert.equal(subtractCalendarMonths("2027-06-30", 4), "2027-02-28");
  assert.equal(subtractCalendarMonths("2024-06-30", 4), "2024-02-29");
  assert.equal(subtractCalendarMonths("2026-12-31", 4), "2026-08-31");
});

test("기준일 전에는 없고 당일·이후·종료일·종료 이후에는 경고한다", () => {
  assert.equal(evaluateRequiredProcessAlerts([project], [], "2026-08-30").length, 0);
  for (const today of ["2026-08-31", "2026-09-01", "2026-12-31", "2027-01-03"]) {
    assert.equal(evaluateRequiredProcessAlerts([project], [], today).length, 1);
  }
});

test("종료일 없음·완료·보류 프로젝트는 제외하고 종료일 변경을 재평가한다", () => {
  assert.equal(evaluateRequiredProcessAlerts([{ ...project, end_date: null }], [], "2026-09-01").length, 0);
  assert.equal(evaluateRequiredProcessAlerts([{ ...project, status: "completed" }], [], "2026-09-01").length, 0);
  assert.equal(evaluateRequiredProcessAlerts([{ ...project, status: "hold" }], [], "2026-09-01").length, 0);
  assert.equal(evaluateRequiredProcessAlerts([{ ...project, end_date: "2027-06-30" }], [], "2026-09-01").length, 0);
  assert.equal(evaluateRequiredProcessAlerts([{ ...project, end_date: "2026-10-31" }], [], "2026-09-01").length, 1);
});

test("본납-도어 프로젝트 공정 존재로 해결하고 Task 유무와는 분리한다", () => {
  assert.equal(evaluateRequiredProcessAlerts([project], [process()], "2026-09-01").length, 0);
  assert.equal(evaluateRequiredProcessAlerts([project], [process("본납-문틀")], "2026-09-01").length, 1);
  assert.equal(evaluateRequiredProcessAlerts([project], [], "2026-09-01").length, 1);
});

test("공정 생성·삭제·type 변경을 동일한 evaluator가 재평가한다", () => {
  assert.equal(evaluateRequiredProcessAlerts([project], [], "2026-09-01").length, 1);
  assert.equal(evaluateRequiredProcessAlerts([project], [process()], "2026-09-01").length, 0);
  assert.equal(evaluateRequiredProcessAlerts([project], [process("본납-문틀")], "2026-09-01").length, 1);
  assert.equal(evaluateRequiredProcessAlerts([project], [process()], "2026-09-01").length, 0);
});

test("반복 평가는 동일한 stable key와 persistent warning을 반환한다", () => {
  const first = evaluateRequiredProcessAlerts([project], [], "2026-09-01", REQUIRED_PROCESS_RULES);
  const second = evaluateRequiredProcessAlerts([project], [], "2026-09-02", REQUIRED_PROCESS_RULES);
  assert.equal(first[0].id, "required_process_missing:1:final_delivery_door");
  assert.equal(first[0].id, second[0].id);
  assert.equal(first[0].isPersistent, true);
  assert.match(first[0].description, /D-121/);
});
