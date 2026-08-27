import assert from "node:assert/strict";
import test from "node:test";
import "./calendar-task-quick-complete.test.ts";
import { getCalendarProjectScheduleDate, matchesCalendarCompletedVisibility, matchesCalendarPersonalCompletedVisibility } from "./calendar-completed-visibility.ts";

test("Project Calendar eligibility는 completion_due_date가 있을 때만 충족한다", () => {
  assert.equal(getCalendarProjectScheduleDate("2026-08-27"), "2026-08-27");
  assert.equal(getCalendarProjectScheduleDate(null), null);
  assert.equal(getCalendarProjectScheduleDate("  "), null);
});

test("Project 일정은 status와 완료 일정 표시 여부에 영향받지 않는다", () => {
  assert.equal(matchesCalendarCompletedVisibility("project", "진행중", false), true);
  assert.equal(matchesCalendarCompletedVisibility("project", "진행중", true), true);
  assert.equal(matchesCalendarCompletedVisibility("project", "완료", false), true);
  assert.equal(matchesCalendarCompletedVisibility("project", "완료", true), true);
});

test("Task 일정만 완료 일정 표시 여부에 따라 필터링한다", () => {
  assert.equal(matchesCalendarCompletedVisibility("task", "in_progress", false), true);
  assert.equal(matchesCalendarCompletedVisibility("task", "in_progress", true), true);
  assert.equal(matchesCalendarCompletedVisibility("task", "completed", false), false);
  assert.equal(matchesCalendarCompletedVisibility("task", "완료", true), true);
});

test("eligibility가 없는 Project는 status와 완료 표시 여부에 무관하게 생성할 날짜가 없다", () => {
  assert.equal(getCalendarProjectScheduleDate(null), null);
  assert.equal(getCalendarProjectScheduleDate(""), null);
  assert.equal(getCalendarProjectScheduleDate("  "), null);
  assert.equal(matchesCalendarCompletedVisibility("project", "active", false), true);
  assert.equal(matchesCalendarCompletedVisibility("project", "completed", true), true);
});

test("완료 일정 표시 전환 전후 Project 수는 같고 완료 Task만 증가한다", () => {
  const items = [
    { id: "project-active", kind: "project" as const, status: "active", scheduleDate: getCalendarProjectScheduleDate("2026-08-30") },
    { id: "project-completed", kind: "project" as const, status: "completed", scheduleDate: getCalendarProjectScheduleDate("2026-08-31") },
    { id: "project-no-date", kind: "project" as const, status: "completed", scheduleDate: getCalendarProjectScheduleDate(null) },
    { id: "task-active", kind: "task" as const, status: "in_progress", scheduleDate: "2026-08-27" },
    { id: "task-completed", kind: "task" as const, status: "completed", scheduleDate: "2026-08-20" },
  ];
  const visibleItems = (showCompleted: boolean) => items.filter((item) => item.scheduleDate && matchesCalendarCompletedVisibility(item.kind, item.status, showCompleted));
  const hidden = visibleItems(false);
  const shown = visibleItems(true);

  assert.deepEqual(hidden.map((item) => item.id), ["project-active", "project-completed", "task-active"]);
  assert.deepEqual(shown.map((item) => item.id), ["project-active", "project-completed", "task-active", "task-completed"]);
  assert.equal(hidden.filter((item) => item.kind === "project").length, shown.filter((item) => item.kind === "project").length);
  assert.deepEqual(shown.filter((item) => !hidden.includes(item)).map((item) => item.id), ["task-completed"]);
});

test("개인 일정과 공유 일정은 동일한 완료 일정 표시 정책을 따른다", () => {
  for (const source of ["own", "shared"] as const) {
    assert.equal(matchesCalendarPersonalCompletedVisibility(false, false), true, `${source} active OFF`);
    assert.equal(matchesCalendarPersonalCompletedVisibility(false, true), true, `${source} active ON`);
    assert.equal(matchesCalendarPersonalCompletedVisibility(true, false), false, `${source} completed OFF`);
    assert.equal(matchesCalendarPersonalCompletedVisibility(true, true), true, `${source} completed ON`);
  }
});

test("통합 완료 토글 ON 전환 시 완료 Task와 완료 Personal만 증가한다", () => {
  const companyItems = [
    { id: "project", kind: "project" as const, status: "completed" },
    { id: "task-active-1", kind: "task" as const, status: "in_progress" },
    { id: "task-active-2", kind: "task" as const, status: "pending" },
    { id: "task-completed-1", kind: "task" as const, status: "completed" },
    { id: "task-completed-2", kind: "task" as const, status: "완료" },
  ];
  const personalItems = [
    { id: "personal-active", completed: false },
    { id: "shared-active", completed: false },
    { id: "personal-completed", completed: true },
    { id: "shared-completed", completed: true },
  ];
  const visibleIds = (showCompleted: boolean) => [
    ...companyItems.filter((item) => matchesCalendarCompletedVisibility(item.kind, item.status, showCompleted)).map((item) => item.id),
    ...personalItems.filter((item) => matchesCalendarPersonalCompletedVisibility(item.completed, showCompleted)).map((item) => item.id),
  ];
  const hidden = visibleIds(false);
  const shown = visibleIds(true);

  assert.deepEqual(hidden, ["project", "task-active-1", "task-active-2", "personal-active", "shared-active"]);
  assert.deepEqual(shown, ["project", "task-active-1", "task-active-2", "task-completed-1", "task-completed-2", "personal-active", "shared-active", "personal-completed", "shared-completed"]);
  assert.deepEqual(shown.filter((id) => !hidden.includes(id)), ["task-completed-1", "task-completed-2", "personal-completed", "shared-completed"]);
  assert.equal(hidden.filter((id) => id === "project").length, 1);
  assert.equal(shown.filter((id) => id === "project").length, 1);
});
