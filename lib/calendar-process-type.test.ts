import assert from "node:assert/strict";
import test from "node:test";
import { buildCalendarProcessTypeMap, resolveCalendarProcessType } from "./calendar-process-type.ts";

const masters = buildCalendarProcessTypeMap([
  { code: "SH", name: "SH" },
  { code: "FRAME", name: "문틀 제작" },
  { code: "OLD", name: "" },
]);

test("Task Section process type을 Project process type보다 우선한다", () => {
  assert.deepEqual(resolveCalendarProcessType("SH", "FRAME", masters), { code: "SH", name: "SH" });
});

test("Section 연결이 없으면 Project process type을 사용한다", () => {
  assert.deepEqual(resolveCalendarProcessType(null, "FRAME", masters), { code: "FRAME", name: "문틀 제작" });
});

test("Master name이 비어 있으면 code를 표시한다", () => {
  assert.deepEqual(resolveCalendarProcessType("OLD", null, masters), { code: "OLD", name: "OLD" });
});

test("process type이 비어 있거나 Master에 없으면 표시하지 않는다", () => {
  assert.equal(resolveCalendarProcessType(null, " ", masters), null);
  assert.equal(resolveCalendarProcessType("UNKNOWN", "SH", masters), null);
});
