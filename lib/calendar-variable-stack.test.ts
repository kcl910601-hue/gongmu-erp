import assert from "node:assert/strict";
import test from "node:test";
import { calculateVariableStack } from "./calendar-variable-stack.ts";

test("다른 날짜의 높은 일정은 해당 날짜 stack offset에 영향을 주지 않는다", () => {
  const result = calculateVariableStack([
    { id: "day-a-1", startColumn: 1, span: 1, laneIndex: 0, height: 30 },
    { id: "day-b-1", startColumn: 2, span: 1, laneIndex: 0, height: 70 },
    { id: "day-a-2", startColumn: 1, span: 1, laneIndex: 1, height: 60 },
    { id: "day-b-2", startColumn: 2, span: 1, laneIndex: 1, height: 30 },
  ]);
  assert.equal(result.offsets.get("day-a-2"), 34);
  assert.equal(result.offsets.get("day-b-2"), 74);
  assert.equal(result.height, 104);
});

test("일정 7건을 고정 gap으로 배치하고 빈 날짜는 0을 반환한다", () => {
  const items = Array.from({ length: 7 }, (_, index) => ({ id: String(index), startColumn: 3, span: 1, laneIndex: index, height: 30 }));
  const result = calculateVariableStack(items);
  assert.deepEqual(items.map((item) => result.offsets.get(item.id)), [0, 34, 68, 102, 136, 170, 204]);
  assert.equal(result.height, 234);
  assert.equal(calculateVariableStack([]).height, 0);
});

test("multi-day segment는 하나의 span을 유지하고 겹치는 일정만 아래로 배치한다", () => {
  const result = calculateVariableStack([
    { id: "range", startColumn: 2, span: 3, laneIndex: 0, height: 40 },
    { id: "outside", startColumn: 6, span: 1, laneIndex: 1, height: 80 },
    { id: "inside", startColumn: 4, span: 1, laneIndex: 1, height: 30 },
  ]);
  assert.equal(result.offsets.get("outside"), 0);
  assert.equal(result.offsets.get("inside"), 44);
});
