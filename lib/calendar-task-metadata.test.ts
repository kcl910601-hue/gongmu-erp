import assert from "node:assert/strict";
import test from "node:test";
import { getCalendarTaskMetadata } from "./calendar-task-metadata.ts";

test("업무유형, 대공정, 조립업체 순서로 metadata를 만든다", () => {
  assert.deepEqual(getCalendarTaskMetadata({ assemblyVendorName: "준하우스", processTypeName: "본납-도어", taskType: "자재" }), [
    { kind: "taskType", label: "자재" },
    { kind: "process", label: "본납-도어" },
    { kind: "assembly", label: "준하우스" },
  ]);
});

test("일부 metadata가 없어도 남은 Badge 순서를 유지한다", () => {
  assert.deepEqual(getCalendarTaskMetadata({ processTypeName: "SH", taskType: "출고" }), [
    { kind: "taskType", label: "출고" },
    { kind: "process", label: "SH" },
  ]);
  assert.deepEqual(getCalendarTaskMetadata({}), []);
});
