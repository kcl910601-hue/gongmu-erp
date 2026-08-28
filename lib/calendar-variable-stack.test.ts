import assert from "node:assert/strict";
import test from "node:test";
import { CALENDAR_DATE_DIVIDER_CLASS, allocateCalendarCompanySlots, getCalendarCompanyGridPosition, getCalendarTaskScheduleRange, getCalendarWeekGridLayout, isSingleDayCalendarRange } from "./calendar-variable-stack.ts";

test("single-day와 multi-day canonical range를 판정한다", () => {
  assert.equal(isSingleDayCalendarRange("2026-08-27", "2026-08-27"), true);
  assert.equal(isSingleDayCalendarRange("2026-08-27", "2026-08-28"), false);
});

test("completed_date는 완료 Task의 Calendar schedule range에 관여하지 않는다", () => {
  const active = getCalendarTaskScheduleRange({ startDate: "2026-08-03", dueDate: "2026-08-06", completedDate: null });
  const completed = getCalendarTaskScheduleRange({ startDate: "2026-08-03", dueDate: "2026-08-06", completedDate: "2026-08-27" });
  assert.deepEqual(completed, active);
});

const augustWeek = ["2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08"];

test("multi-day의 모든 날짜 segment는 같은 Week slot을 유지한다", () => {
  const item = { id: "task-a", start: "2026-08-03", end: "2026-08-06" };
  const result = allocateCalendarCompanySlots([item], augustWeek, (value) => value);
  assert.equal(result.slotCount, 1);
  assert.deepEqual(result.segments.map((segment) => [segment.item.id, segment.slot, segment.startColumn, segment.endColumn]), [["task-a", 0, 1, 4]]);
});

test("날짜가 겹치는 Item은 다른 slot, 겹치지 않는 Item은 같은 slot을 사용한다", () => {
  const conflict = allocateCalendarCompanySlots([
    { id: "task-a", start: "2026-08-03", end: "2026-08-06" },
    { id: "task-b", start: "2026-08-04", end: "2026-08-04" },
  ], augustWeek, (item) => item);
  assert.equal(conflict.slotCount, 2);
  const reused = allocateCalendarCompanySlots([
    { id: "task-a", start: "2026-08-03", end: "2026-08-04" },
    { id: "task-b", start: "2026-08-05", end: "2026-08-06" },
  ], augustWeek, (item) => item);
  assert.equal(reused.slotCount, 1);
});

test("Project 우선 canonical order와 입력 순서 독립성을 유지한다", () => {
  const items = [
    { id: "task-b", start: "2026-08-03", end: "2026-08-04" },
    { id: "project-a", start: "2026-08-03", end: "2026-08-03" },
    { id: "task-a", start: "2026-08-03", end: "2026-08-06" },
  ];
  const first = allocateCalendarCompanySlots(items, augustWeek, (item) => item);
  const second = allocateCalendarCompanySlots([...items].reverse(), augustWeek, (item) => item);
  const signature = (result: typeof first) => result.segments.map((segment) => `${segment.item.id}:${segment.slot}:${segment.startColumn}-${segment.endColumn}`);
  assert.deepEqual(signature(first), signature(second));
  assert.equal(first.segments[0].item.id, "project-a");
});

test("Week 경계 range는 각 Week 내부 column과 slot으로만 분리된다", () => {
  const item = { id: "task-boundary", start: "2026-08-28", end: "2026-09-02" };
  const august = allocateCalendarCompanySlots([item], ["2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29"], (value) => value);
  const september = allocateCalendarCompanySlots([item], ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"], (value) => value);
  assert.deepEqual(august.segments.map((segment) => [segment.startColumn, segment.endColumn]), [[5, 6]]);
  assert.deepEqual(september.segments.map((segment) => [segment.startColumn, segment.endColumn]), [[0, 3]]);
  assert.equal(august.segments[0].isRangeEnd, false);
  assert.equal(september.segments[0].isRangeEnd, true);
});

test("동일 Week multi-day는 하나의 spanning Grid Item 위치를 만든다", () => {
  const result = allocateCalendarCompanySlots([{ id: "task-a", start: "2026-08-03", end: "2026-08-06" }], augustWeek, (item) => item);
  assert.equal(result.segments.length, 1);
  assert.deepEqual(getCalendarCompanyGridPosition(result.segments[0]), { gridColumn: "2 / 6", gridRow: 2 });
});

test("Date divider는 Bar 위에서 클릭을 막지 않는 CSS contract를 사용한다", () => {
  assert.match(CALENDAR_DATE_DIVIDER_CLASS, /pointer-events-none/);
  assert.match(CALENDAR_DATE_DIVIDER_CLASS, /z-20/);
  assert.match(CALENDAR_DATE_DIVIDER_CLASS, /border-r/);
});

test("동일 날짜를 점유하는 dense 15개 Item은 15개 slot으로 확장된다", () => {
  const items = Array.from({ length: 15 }, (_, index) => ({ id: `task-${index.toString().padStart(2, "0")}`, start: "2026-08-03", end: "2026-08-06" }));
  const result = allocateCalendarCompanySlots(items, augustWeek, (item) => item);
  assert.equal(result.segments.length, 15);
  assert.equal(result.slotCount, 15);
  assert.deepEqual(result.segments.map((segment) => segment.slot), Array.from({ length: 15 }, (_, index) => index));
});

test("OFF→ON→OFF는 현재 visible collection만으로 slot을 다시 계산한다", () => {
  const active = { id: "task-active", start: "2026-08-03", end: "2026-08-06" };
  const completed = { id: "task-completed", start: "2026-08-03", end: "2026-08-06" };
  const off = allocateCalendarCompanySlots([active], augustWeek, (item) => item);
  const on = allocateCalendarCompanySlots([active, completed], augustWeek, (item) => item);
  const restored = allocateCalendarCompanySlots([active], augustWeek, (item) => item);
  assert.equal(off.slotCount, 1);
  assert.equal(on.slotCount, 2);
  assert.deepEqual(restored, off);
});

test("zero-slot Week는 invalid repeat(0) 없이 수축 가능한 row template을 만든다", () => {
  assert.deepEqual(getCalendarWeekGridLayout(0), {
    slotCount: 0,
    rowCount: 2,
    personalRow: 2,
    cellRowSpan: 2,
    gridTemplateRows: "auto auto",
  });
});

test("OFF1→ON→OFF2 Grid layout은 현재 slotCount만 반영한다", () => {
  const active = Array.from({ length: 2 }, (_, index) => ({ id: `active-${index}`, start: "2026-08-03", end: "2026-08-06" }));
  const completed = Array.from({ length: 8 }, (_, index) => ({ id: `completed-${index}`, start: "2026-08-03", end: "2026-08-06" }));
  const off1Slots = allocateCalendarCompanySlots(active, augustWeek, (item) => item);
  const onSlots = allocateCalendarCompanySlots([...active, ...completed], augustWeek, (item) => item);
  const off2Slots = allocateCalendarCompanySlots(active, augustWeek, (item) => item);
  const off1 = getCalendarWeekGridLayout(off1Slots.slotCount);
  const on = getCalendarWeekGridLayout(onSlots.slotCount);
  const off2 = getCalendarWeekGridLayout(off2Slots.slotCount);
  assert.deepEqual([off1.slotCount, on.slotCount, off2.slotCount], [2, 10, 2]);
  assert.deepEqual([off1.personalRow, on.personalRow, off2.personalRow], [4, 12, 4]);
  assert.deepEqual([off1.cellRowSpan, on.cellRowSpan, off2.cellRowSpan], [4, 12, 4]);
  assert.deepEqual(off2, off1);
});

test("Week별 layout은 다른 Week의 과거 slotCount와 독립적이다", () => {
  const weekAOn = getCalendarWeekGridLayout(10);
  const weekB = getCalendarWeekGridLayout(0);
  const weekAOff = getCalendarWeekGridLayout(2);
  assert.equal(weekAOn.rowCount, 12);
  assert.deepEqual(weekB, getCalendarWeekGridLayout(0));
  assert.equal(weekAOff.rowCount, 4);
});
