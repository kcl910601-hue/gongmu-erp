import assert from "node:assert/strict";
import test from "node:test";
import { matchesCalendarCompletedVisibility, matchesCalendarPersonalCompletedVisibility } from "./calendar-completed-visibility.ts";
import { applyCalendarTaskQuickStatus, CALENDAR_TASK_REOPEN_STATUS, getCalendarTaskQuickAction, restoreCalendarTaskQuickStatus } from "./calendar-task-quick-complete.ts";

const activeTask = { status: "in_progress", completed_date: null };
const completedTask = { status: "completed", completed_date: "2026-08-26" };

test("권한과 완료 상태에 맞는 Calendar Task 빠른 Action을 제공한다", () => {
  assert.deepEqual(getCalendarTaskQuickAction(activeTask.status, true), { label: "완료", nextStatus: "completed" });
  assert.deepEqual(getCalendarTaskQuickAction(completedTask.status, true), { label: "완료취소", nextStatus: CALENDAR_TASK_REOPEN_STATUS });
  assert.equal(getCalendarTaskQuickAction(activeTask.status, false), null);
});

test("완료와 완료취소는 canonical status와 completed_date를 적용한다", () => {
  assert.deepEqual(applyCalendarTaskQuickStatus(activeTask, "completed", "2026-08-27"), { status: "completed", completed_date: "2026-08-27" });
  assert.deepEqual(applyCalendarTaskQuickStatus(completedTask, CALENDAR_TASK_REOPEN_STATUS, "2026-08-27"), { status: "in_progress", completed_date: null });
});

test("mutation 실패 시 이전 Task 상태로 rollback한다", () => {
  const optimistic = applyCalendarTaskQuickStatus(activeTask, "completed", "2026-08-27");
  assert.deepEqual(restoreCalendarTaskQuickStatus(optimistic, activeTask), activeTask);
});

test("통합 완료 표시와 빠른 완료 결과가 같은 visible 목록을 만든다", () => {
  const optimistic = applyCalendarTaskQuickStatus(activeTask, "completed", "2026-08-27");
  assert.equal(matchesCalendarCompletedVisibility("task", optimistic.status, false), false);
  assert.equal(matchesCalendarCompletedVisibility("task", optimistic.status, true), true);
  const reopened = applyCalendarTaskQuickStatus(optimistic, CALENDAR_TASK_REOPEN_STATUS, "2026-08-27");
  assert.equal(matchesCalendarCompletedVisibility("task", reopened.status, true), true);
  assert.equal(matchesCalendarCompletedVisibility("project", "completed", false), true);
  assert.equal(matchesCalendarPersonalCompletedVisibility(true, true), true);
});
