import assert from "node:assert/strict";
import test from "node:test";
import { canCalendarOnlyStaffAccessApi, canEmployeeAccessRoute, getCalendarPermissions, isCalendarOnlyStaff } from "./permissions.ts";

const calendarStaff = { role: " Staff ", position: " 스태프 ", organization: { name: " 기타 " } };

test("기타 조직의 스태프 직급 Staff role만 Calendar 전용으로 판정한다", () => {
  assert.equal(isCalendarOnlyStaff(calendarStaff), true);
  assert.equal(isCalendarOnlyStaff({ ...calendarStaff, organization: { name: "공무팀" } }), false);
  assert.equal(isCalendarOnlyStaff({ ...calendarStaff, position: "과장" }), false);
  assert.equal(isCalendarOnlyStaff({ ...calendarStaff, role: "viewer" }), false);
  assert.equal(isCalendarOnlyStaff({ role: "staff", position: "dd", organization: { name: "기타" } }), false);
  assert.equal(isCalendarOnlyStaff({ role: "staff", position: "스태프" }), false);
});

test("Calendar 전용 사용자는 Calendar route만 접근한다", () => {
  assert.equal(canEmployeeAccessRoute(calendarStaff, "/calendar"), true);
  assert.equal(canEmployeeAccessRoute(calendarStaff, "/"), false);
  for (const path of ["/", "/projects", "/tasks", "/statistics/lme", "/employees", "/notifications"]) assert.equal(canEmployeeAccessRoute(calendarStaff, path), false);
  assert.equal(canEmployeeAccessRoute({ role: "staff", position: "대리", organization: { name: "공무팀" } }, "/projects"), true);
});

test("Calendar 조회와 Excel은 허용하고 편집은 차단한다", () => {
  assert.deepEqual(getCalendarPermissions(calendarStaff), { canViewCalendar: true, canEditCalendar: false, canExportCalendar: true, calendarOnly: true });
  assert.equal(getCalendarPermissions({ role: "staff", position: "대리", organization: { name: "공무팀" } }).canEditCalendar, true);
});

test("Calendar 전용 API는 필요한 조회만 허용하고 mutation을 차단한다", () => {
  assert.equal(canCalendarOnlyStaffAccessApi("/api/comments", "GET"), true);
  assert.equal(canCalendarOnlyStaffAccessApi("/api/comments", "POST"), false);
  assert.equal(canCalendarOnlyStaffAccessApi("/api/projects/1", "GET"), false);
  assert.equal(canCalendarOnlyStaffAccessApi("/api/personal-notes/1", "PATCH"), false);
});
