import assert from "node:assert/strict";
import test from "node:test";
import { calculateVariableStack, getCalendarSegmentKey, orderVariableStackItems } from "./calendar-variable-stack.ts";

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

test("서로 다른 실제 높이 3개를 4px gap으로 순차 배치한다", () => {
  const result = calculateVariableStack([
    { id: "a", startColumn: 2, span: 1, laneIndex: 0, height: 24 },
    { id: "b", startColumn: 2, span: 1, laneIndex: 1, height: 40 },
    { id: "c", startColumn: 2, span: 1, laneIndex: 2, height: 32 },
  ]);
  assert.deepEqual([result.offsets.get("a"), result.offsets.get("b"), result.offsets.get("c")], [0, 28, 72]);
  assert.equal(result.height, 104);
});

test("OFF에서 ON으로 visible collection이 증가하면 신규 Task도 새 offset을 받는다", () => {
  const active = [
    { id: "a", startColumn: 4, span: 1, laneIndex: 0, height: 24 },
    { id: "b", startColumn: 4, span: 1, laneIndex: 1, height: 40 },
  ];
  const completed = [
    { id: "c", startColumn: 4, span: 1, laneIndex: 2, height: 32 },
    { id: "d", startColumn: 4, span: 1, laneIndex: 3, height: 28 },
    { id: "e", startColumn: 4, span: 1, laneIndex: 4, height: 36 },
  ];
  const off = calculateVariableStack(active);
  const on = calculateVariableStack([...active, ...completed]);
  assert.deepEqual(active.map((item) => off.offsets.get(item.id)), [0, 28]);
  assert.deepEqual([...active, ...completed].map((item) => on.offsets.get(item.id)), [0, 28, 72, 108, 140]);
  assert.equal(on.height, 176);
});

test("ON에서 OFF로 collection이 감소하면 stale height와 빈 공간이 남지 않는다", () => {
  const active = [
    { id: "a", startColumn: 4, span: 1, laneIndex: 0, height: 24 },
    { id: "b", startColumn: 4, span: 1, laneIndex: 1, height: 40 },
  ];
  const off = calculateVariableStack(active);
  assert.deepEqual([...off.offsets.keys()], ["a", "b"]);
  assert.equal(off.height, 68);
});

test("ResizeObserver 측정값이 바뀌면 후속 Task offset과 row height를 다시 계산한다", () => {
  const initial = calculateVariableStack([
    { id: "new", startColumn: 3, span: 1, laneIndex: 0, height: 28 },
    { id: "next", startColumn: 3, span: 1, laneIndex: 1, height: 28 },
  ]);
  const measured = calculateVariableStack([
    { id: "new", startColumn: 3, span: 1, laneIndex: 0, height: 64 },
    { id: "next", startColumn: 3, span: 1, laneIndex: 1, height: 36 },
  ]);
  assert.equal(initial.offsets.get("next"), 32);
  assert.equal(measured.offsets.get("next"), 68);
  assert.equal(measured.height, 104);
});

test("밀집 날짜 8개 Task의 모든 인접 gap은 정확히 4px이다", () => {
  const items = [42, 54, 64, 48, 58, 44, 60, 50].map((height, index) => ({ id: `task:${index}`, startColumn: 5, span: 1, laneIndex: index, height }));
  const result = calculateVariableStack(items);
  assert.deepEqual(items.map((item) => result.offsets.get(item.id)), [0, 46, 104, 172, 224, 286, 334, 398]);
  for (let index = 1; index < items.length; index += 1) {
    const previousBottom = (result.offsets.get(items[index - 1].id) ?? 0) + items[index - 1].height;
    assert.equal((result.offsets.get(items[index].id) ?? 0) - previousBottom, 4);
  }
});

test("lane 0이 재사용되어도 앞서 시작한 높은 lane의 multi-day와 겹치지 않는다", () => {
  const items = [
    { id: "task:early-a", startColumn: 1, span: 1, laneIndex: 0, height: 30 },
    { id: "task:early-b", startColumn: 1, span: 1, laneIndex: 1, height: 30 },
    { id: "task:range", startColumn: 1, span: 5, laneIndex: 2, height: 40 },
    { id: "task:later", startColumn: 3, span: 1, laneIndex: 0, height: 100 },
  ];
  const result = calculateVariableStack(items);
  assert.equal(result.offsets.get("task:range"), 0);
  assert.equal(result.offsets.get("task:later"), 44);
});

test("stack input order가 달라도 canonical order와 offset은 같다", () => {
  const items = [
    { id: "task:c", startColumn: 4, span: 1, laneIndex: 2, height: 32 },
    { id: "task:a", startColumn: 4, span: 1, laneIndex: 0, height: 24 },
    { id: "task:b", startColumn: 4, span: 1, laneIndex: 1, height: 40 },
  ];
  const ordered = orderVariableStackItems(items);
  const result = calculateVariableStack(items);
  assert.deepEqual(ordered.map((item) => item.id), ["task:a", "task:b", "task:c"]);
  assert.deepEqual(ordered.map((item) => result.offsets.get(item.id)), [0, 28, 72]);
});

test("서로 다른 entity의 같은 numeric id는 segment key가 충돌하지 않는다", () => {
  assert.notEqual(getCalendarSegmentKey("project-10", 3), getCalendarSegmentKey("task-10", 3));
  assert.notEqual(getCalendarSegmentKey("task-10", 3), getCalendarSegmentKey("task-note-10", 3));
});
